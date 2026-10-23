import { expect, test } from 'claude-code/testing'
import type { FileDiff } from '../hooks/parse.ts'
import { CHAR_BUDGET, MAX_FILE_LINES, clampTop, fileAt, jump, layout, windowOf, type Row } from '../hooks/rows.ts'

function file(path: string, lineCount: number, width = 10): FileDiff {
  const lines = Array.from({ length: lineCount }, (_, i) => ({
    mark: '+' as const,
    text: 'x'.repeat(width),
    oldNo: 1,
    newNo: i + 1,
  }))
  return { path, kind: 'added', added: lineCount, deleted: 0, isBinary: false, notes: [], hunks: [{ header: '@@ -0,0 +1 @@', section: '', lines }] }
}

const textOf = (_: Exclude<Row, { kind: 'line' }>) => 'label'

test('every file gets a list row, a header row and its lines, in one stream', () => {
  const files = [file('a', 2), file('b', 3)]
  const l = layout(files)
  expect(l.rows.slice(0, 3).map(r => r.kind)).toEqual(['goto', 'goto', 'rule'])
  expect(l.fileRows).toEqual([3, 8])
  expect(l.rows[3]).toEqual({ kind: 'file', file: 0 })
  expect(l.rows[4]).toEqual({ kind: 'hunk', file: 0, hunk: 0 })
})

test('a file over the line cap is cut with a note saying how much', () => {
  const l = layout([file('big', MAX_FILE_LINES + 5)])
  const lines = l.rows.filter(r => r.kind === 'line').length
  expect(lines).toBe(MAX_FILE_LINES)
  expect(l.rows.some(r => r.kind === 'note' && r.text === '5 more lines of this file are not drawn')).toBe(true)
})

test('j and k land on the next and previous file header', () => {
  const l = layout([file('a', 2), file('b', 3), file('c', 1)])
  expect(jump(l.fileRows, 0, 1)).toBe(l.fileRows[0])
  expect(jump(l.fileRows, l.fileRows[0] ?? 0, 1)).toBe(l.fileRows[1])
  expect(jump(l.fileRows, (l.fileRows[1] ?? 0) + 1, -1)).toBe(l.fileRows[1])
  expect(jump(l.fileRows, l.fileRows[2] ?? 0, 1)).toBe(l.fileRows[2])
  expect(fileAt(l.fileRows, (l.fileRows[1] ?? 0) + 2)).toBe(1)
  expect(fileAt(l.fileRows, 0)).toBe(-1)
})

test('top is clamped to the last full window', () => {
  expect(clampTop(500, 100, 20)).toBe(80)
  expect(clampTop(-3, 100, 20)).toBe(0)
  expect(clampTop(5, 10, 20)).toBe(0)
})

test('consecutive lines of one hunk become one code piece', () => {
  const files = [file('a', 4), file('b', 4)]
  const l = layout(files)
  const w = windowOf(files, l.rows, l.fileRows[0] ?? 0, 7, 80, textOf)
  expect(w.pieces.map(p => p.kind === 'code' ? `code${p.lines.length}` : p.row.kind)).toEqual(['file', 'hunk', 'code4', 'rule'])
  expect(w.rows).toBe(7)
})

test('the window stays under the character budget whatever the line lengths', () => {
  const files = [file('wide', 400, 5000)]
  const l = layout(files)
  const w = windowOf(files, l.rows, 0, 400, 100_000, textOf)
  const chars = w.pieces.reduce((n, p) => n + (p.kind === 'code' ? p.lines.reduce((m, x) => m + x.text.length, 0) : 5), 0)
  expect(chars <= CHAR_BUDGET).toBe(true)
  expect(w.isCut).toBe(true)
  const clipped = windowOf(files, l.rows, 0, 50, 120, textOf)
  expect(clipped.isCut).toBe(false)
  expect(clipped.pieces.every(p => p.kind !== 'code' || p.lines.every(x => x.text.length <= 120))).toBe(true)
})
