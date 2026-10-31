import { expect, test } from 'claude-code/testing'
import type { FileDiff } from '../hooks/parse.ts'
import { Budget, CHAR_BUDGET, clip, drawn, listed, targetIndex } from '../hooks/rows.ts'

function file(hunks: number, lines: number, width = 10): FileDiff {
  return {
    path: 'a',
    status: 'A',
    added: hunks * lines,
    deleted: 0,
    isBinary: false,
    notes: [],
    hunks: Array.from({ length: hunks }, (_, h) => ({
      header: `@@ -0,0 +${h * lines + 1},${lines} @@`,
      section: '',
      lines: Array.from({ length: lines }, (_, i) => ({ mark: '+' as const, text: 'x'.repeat(width), oldNo: 1, newNo: h * lines + i + 1 })),
    })),
  }
}

const total = (d: ReturnType<typeof drawn>) => d.runs.reduce((n, r) => n + r.title.length + r.source.length, 0)

test('a file under the budget is drawn whole, hunk by hunk', () => {
  const d = drawn(file(3, 5), 80, new Budget(CHAR_BUDGET))
  expect(d.runs.map(r => r.source.split('\n').length - 1)).toEqual([5, 5, 5])
  expect(d.note).toBe(undefined)
})

test('a file over the budget is drawn from its start and says how many lines are left out', () => {
  const whole = drawn(file(2, 4), 80, new Budget(CHAR_BUDGET))
  const first = whole.runs[0]
  if (!first) throw new Error('no run')
  // Room for the first hunk and one more line of the second.
  const budget = first.title.length + first.source.length + 50 + '  8 more lines of this file are not drawn'.length
  const d = drawn(file(2, 4), 80, new Budget(budget))
  expect(d.runs.map(r => r.source.split('\n').length - 1)).toEqual([4, 1])
  expect(d.note).toBe('  3 more lines of this file are not drawn')
  expect(total(d) + (d.note?.length ?? 0)).toBeLessThanOrEqual(budget)
})

test('many tiny hunks are charged for every header and source they draw', () => {
  const d = drawn(file(20_000, 1, 1), 80, new Budget(CHAR_BUDGET))
  expect(total(d)).toBeLessThanOrEqual(CHAR_BUDGET)
  expect(d.runs.length).toBeLessThan(20_000)
  expect(d.note).toBe(`  ${20_000 - d.runs.length} more lines of this file are not drawn`)
})

test('lines are clipped to the width a row shows, which leaves more of the file under the budget', () => {
  const d = drawn(file(1, 3, 1000), 20, new Budget(CHAR_BUDGET))
  expect(d.runs[0]?.source.split('\n').slice(1).map(l => l.length)).toEqual([21, 21, 21])
})

test('a budget takes a string only while it fits, and what it took is spent', () => {
  const b = new Budget(5)
  expect([b.take('aa'), b.take('bbbb'), b.take('cc'), b.left]).toEqual([true, false, true, 1])
})

test('drawing leaves what it is told to keep, and charges exactly what it draws', () => {
  const b = new Budget(CHAR_BUDGET)
  const d = drawn(file(20_000, 1, 1), 80, b, 20_000)
  expect(b.left).toBeGreaterThanOrEqual(20_000)
  expect(CHAR_BUDGET - b.left).toBe(total(d) + (d.note?.length ?? 0))
})

test('a line clipped next to an astral character never keeps half of it', () => {
  expect(clip('ab😀c', 3)).toBe('ab')
  expect(clip('ab😀c', 4)).toBe('ab😀')
  expect(clip('abc', 5)).toBe('abc')
})

test('the note on what is left out is charged as printed, its count taken from the lines drawn, context included', () => {
  // Two changed lines among 30,000 context lines: numstat would count 2, the note counts 29,999.
  const f = file(1, 30_000, 1)
  f.added = 2
  f.deleted = 0
  const b = new Budget(1000)
  const d = drawn(f, 80, b)
  const shown = d.runs.reduce((n, r) => n + r.source.split('\n').length - 1, 0)
  expect(d.note).toBe(`  ${30_000 - shown} more lines of this file are not drawn`)
  expect(1000 - b.left).toBe(total(d) + (d.note?.length ?? 0))
})

test('the last label is drawn when it fits, with no room kept for a note it would not need', () => {
  const labels = ['aaaa', 'bbbb', 'cccc']
  // Exactly the three labels: nothing remains after the last, so no note is needed.
  expect(listed(labels, new Budget(12))).toEqual({ labels, note: undefined })
  // Not all fit: labels give way, from the end, until the note counting the rest fits beside them.
  const long = ['a'.repeat(20), 'b'.repeat(20), 'c'.repeat(20)]
  const note = '2 more files; j and k reach them'
  expect(listed(long, new Budget(20 + note.length))).toEqual({ labels: [long[0]], note })
})

test('j and k step within the files; from no open file they land on the first or the last', () => {
  expect(targetIndex(7, undefined, { step: 1 }, 5)).toBe(0)
  expect(targetIndex(7, undefined, { step: -1 }, 5)).toBe(4)
  expect([targetIndex(7, 2, { step: 1 }, 5), targetIndex(7, 4, { step: 1 }, 5), targetIndex(7, 0, { step: -1 }, 5)]).toEqual([3, 4, 0])
})

test('a list entry opens its file only in the load it was drawn for', () => {
  expect(targetIndex(7, 1, { index: 3, gen: 7 }, 5)).toBe(3)
  // Drawn for load 6, pressed after a reload made load 7: it names no file of load 7.
  expect(targetIndex(7, 1, { index: 3, gen: 6 }, 5)).toBe(-1)
})

