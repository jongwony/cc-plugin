import { expect, test } from 'claude-code/testing'
import type { FileDiff } from '../hooks/parse.ts'
import { CHAR_BUDGET, clip, drawn, fitting } from '../hooks/rows.ts'

function file(hunks: number, lines: number, width = 10): FileDiff {
  return {
    path: 'a',
    kind: 'added',
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

test('a file under the budget is drawn whole, hunk by hunk', () => {
  const d = drawn(file(3, 5), 80, CHAR_BUDGET)
  expect(d.runs.map(r => r.lines.length)).toEqual([5, 5, 5])
  expect(d.left).toBe(0)
})

test('a file over the budget is drawn from its start and says how many lines are left out', () => {
  // Each line costs 10 + 8: a budget of 100 takes five of them.
  const d = drawn(file(2, 4), 80, 100)
  expect(d.runs.map(r => r.lines.length)).toEqual([4, 1])
  expect(d.left).toBe(3)
})

test('lines are clipped to the width a row shows, which leaves more of the file under the budget', () => {
  const d = drawn(file(1, 3, 1000), 20, CHAR_BUDGET)
  expect(d.runs[0]?.lines.map(l => l.text.length)).toEqual([20, 20, 20])
})

test('a "no newline" marker takes nothing from the budget and is never drawn', () => {
  const f = file(1, 1)
  f.hunks[0]?.lines.push({ mark: '\\', text: ' No newline at end of file', oldNo: 1, newNo: 2 })
  expect(drawn(f, 80, CHAR_BUDGET).runs[0]?.lines.map(l => l.mark)).toEqual(['+'])
})

test('the file list keeps the labels that fit its budget', () => {
  expect(fitting(['aa', 'bb', 'cc'], 20)).toBe(2)
  expect(fitting(['aa', 'bb', 'cc'], 1000)).toBe(3)
})

test('a line clipped next to an astral character never keeps half of it', () => {
  expect(clip('ab😀c', 3)).toBe('ab')
  expect(clip('ab😀c', 4)).toBe('ab😀')
  expect(clip('abc', 5)).toBe('abc')
})
