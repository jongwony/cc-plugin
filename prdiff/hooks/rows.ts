// The diff body as one stream of display rows, and the window of it a drawing
// shows. Pure: no `$`.

import type { DiffLine, FileDiff } from './parse.ts'

/** Lines of one file drawn before the rest is summarised in a note. */
export const MAX_FILE_LINES = 3000

/** What one drawing may carry in text; the engine cuts a tree at 100,000. */
export const CHAR_BUDGET = 90_000

export type Row =
  | { kind: 'goto'; file: number }
  | { kind: 'rule' }
  | { kind: 'file'; file: number }
  | { kind: 'note'; file: number; text: string }
  | { kind: 'hunk'; file: number; hunk: number }
  | { kind: 'line'; file: number; hunk: number; line: number }

export type Layout = {
  rows: Row[]
  /** Row index of each file's header, by file index. */
  fileRows: number[]
}

export function layout(files: readonly FileDiff[]): Layout {
  const rows: Row[] = []
  const fileRows: number[] = []
  files.forEach((_, i) => rows.push({ kind: 'goto', file: i }))
  if (files.length > 0) rows.push({ kind: 'rule' })
  files.forEach((f, i) => {
    fileRows.push(rows.length)
    rows.push({ kind: 'file', file: i })
    for (const text of f.notes) rows.push({ kind: 'note', file: i, text })
    let drawn = 0
    let total = 0
    f.hunks.forEach((h, hi) => {
      total += h.lines.length
      if (drawn >= MAX_FILE_LINES) return
      rows.push({ kind: 'hunk', file: i, hunk: hi })
      const take = Math.min(h.lines.length, MAX_FILE_LINES - drawn)
      for (let li = 0; li < take; li += 1) rows.push({ kind: 'line', file: i, hunk: hi, line: li })
      drawn += take
    })
    if (total > drawn) {
      rows.push({ kind: 'note', file: i, text: `${total - drawn} more lines of this file are not drawn` })
    }
    rows.push({ kind: 'rule' })
  })
  return { rows, fileRows }
}

export function clampTop(top: number, rowCount: number, bodyRows: number): number {
  return Math.max(0, Math.min(top, Math.max(0, rowCount - bodyRows)))
}

/** The file whose section holds row `top`, or -1 above the first file. */
export function fileAt(fileRows: readonly number[], top: number): number {
  let at = -1
  fileRows.forEach((r, i) => {
    if (r <= top) at = i
  })
  return at
}

/** The top that lands on the next (`+1`) or previous (`-1`) file's header. */
export function jump(fileRows: readonly number[], top: number, dir: 1 | -1): number {
  if (fileRows.length === 0) return top
  if (dir === 1) return fileRows.find(r => r > top) ?? top
  const before = fileRows.filter(r => r < top)
  return before.at(-1) ?? 0
}

export type Piece =
  | { kind: 'row'; row: Exclude<Row, { kind: 'line' }> }
  | { kind: 'code'; file: number; hunk: number; lines: DiffLine[] }

export type Window = {
  pieces: Piece[]
  /** Rows the pieces take. */
  rows: number
  /** True when the budget stopped the window short of `want` rows. */
  isCut: boolean
}

/**
 * The rows from `top`, at most `want` of them, grouped so consecutive lines
 * of one hunk become one Code piece. Each line is clipped to `clip`
 * characters (a row drawn `truncate-end` shows no more), and the whole stays
 * under CHAR_BUDGET.
 */
export function windowOf(
  files: readonly FileDiff[],
  rows: readonly Row[],
  top: number,
  want: number,
  clip: number,
  textOf: (row: Exclude<Row, { kind: 'line' }>) => string,
): Window {
  const pieces: Piece[] = []
  let used = 0
  let chars = 0
  let isCut = false
  for (let r = top; r < rows.length && used < want; r += 1) {
    const row = rows[r]
    if (!row) break
    if (row.kind === 'line') {
      const src = files[row.file]?.hunks[row.hunk]?.lines[row.line]
      if (!src) continue
      const line = src.text.length > clip ? { ...src, text: src.text.slice(0, clip) } : src
      const cost = line.text.length + 24
      if (chars + cost > CHAR_BUDGET) {
        isCut = true
        break
      }
      chars += cost
      const last = pieces.at(-1)
      if (last?.kind === 'code' && last.file === row.file && last.hunk === row.hunk) last.lines.push(line)
      else pieces.push({ kind: 'code', file: row.file, hunk: row.hunk, lines: [line] })
    } else {
      const cost = Math.min(textOf(row).length, clip) + 8
      if (chars + cost > CHAR_BUDGET) {
        isCut = true
        break
      }
      chars += cost
      pieces.push({ kind: 'row', row })
    }
    used += 1
  }
  return { pieces, rows: used, isCut }
}

export function kindMark(kind: FileDiff['kind']): string {
  switch (kind) {
    case 'added':
      return 'A'
    case 'deleted':
      return 'D'
    case 'renamed':
      return 'R'
    case 'copied':
      return 'C'
    case 'mode':
      return 'T'
    case 'untracked':
      return '?'
    default:
      return 'M'
  }
}

export function fileLabel(f: FileDiff): string {
  const name = f.oldPath !== undefined && f.oldPath !== f.path ? `${f.oldPath} → ${f.path}` : f.path
  const stat = f.isBinary ? 'bin' : `+${f.added} −${f.deleted}`
  return `${kindMark(f.kind)} ${name}  ${stat}`
}
