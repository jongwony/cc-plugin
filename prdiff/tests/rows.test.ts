import { expect, test } from 'claude-code/testing'
import type { FileDiff } from '../hooks/parse.ts'
import { Budget, CHAR_BUDGET, clip, drawn } from '../hooks/rows.ts'

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
  expect(d.left).toBe(0)
})

test('a file over the budget is drawn from its start and says how many lines are left out', () => {
  const whole = drawn(file(2, 4), 80, new Budget(CHAR_BUDGET))
  const first = whole.runs[0]
  if (!first) throw new Error('no run')
  // Room for the first hunk and one more line of the second.
  const budget = first.title.length + first.source.length + 50
  const d = drawn(file(2, 4), 80, new Budget(budget))
  expect(d.runs.map(r => r.source.split('\n').length - 1)).toEqual([4, 1])
  expect(d.left).toBe(3)
  expect(total(d)).toBeLessThanOrEqual(budget)
})

test('many tiny hunks are charged for every header and source they draw', () => {
  const d = drawn(file(20_000, 1, 1), 80, new Budget(CHAR_BUDGET))
  expect(total(d)).toBeLessThanOrEqual(CHAR_BUDGET)
  expect(d.left).toBeGreaterThan(0)
  expect(d.runs.length + d.left).toBe(20_000)
})

test('lines are clipped to the width a row shows, which leaves more of the file under the budget', () => {
  const d = drawn(file(1, 3, 1000), 20, new Budget(CHAR_BUDGET))
  expect(d.runs[0]?.source.split('\n').slice(1).map(l => l.length)).toEqual([21, 21, 21])
})

test('a "no newline" marker takes nothing from the budget and is never drawn', () => {
  const f = file(1, 1)
  f.hunks[0]?.lines.push({ mark: '\\', text: ' No newline at end of file', oldNo: 1, newNo: 2 })
  expect(drawn(f, 80, new Budget(CHAR_BUDGET)).runs[0]?.source).toBe('@@ -0,0 +1,1 @@\n+xxxxxxxxxx')
})

test('a budget takes a string only while it fits, and what it took is spent', () => {
  const b = new Budget(5)
  expect([b.take('aa'), b.take('bbbb'), b.take('cc'), b.left]).toEqual([true, false, true, 1])
})

test('drawing leaves what it is told to keep, and charges exactly what it draws', () => {
  const b = new Budget(CHAR_BUDGET)
  const d = drawn(file(20_000, 1, 1), 80, b, 20_000)
  expect(b.left).toBeGreaterThanOrEqual(20_000)
  expect(CHAR_BUDGET - b.left).toBe(total(d))
})

test('a line clipped next to an astral character never keeps half of it', () => {
  expect(clip('ab😀c', 3)).toBe('ab')
  expect(clip('ab😀c', 4)).toBe('ab😀')
  expect(clip('abc', 5)).toBe('abc')
})
