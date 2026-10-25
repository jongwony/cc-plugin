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
      // `\ No newline at end of file` takes no row: Code draws nothing for it.
      const shown = h.lines.flatMap((l, li) => (l.mark === '\\' ? [] : [li]))
      total += shown.length
      if (drawn >= MAX_FILE_LINES) return
      rows.push({ kind: 'hunk', file: i, hunk: hi })
      const take = Math.min(shown.length, MAX_FILE_LINES - drawn)
      for (const li of shown.slice(0, take)) rows.push({ kind: 'line', file: i, hunk: hi, line: li })
      drawn += take
    })
    if (total > drawn) {
      rows.push({ kind: 'note', file: i, text: `${total - drawn} more lines of this file are not drawn` })
    }
    rows.push({ kind: 'rule' })
  })
  return { rows, fileRows }
}

/** `top` within the stream: at most the last full window, or the last file's header when that lies further down. */
export function clampTop(top: number, rowCount: number, bodyRows: number, fileRows: readonly number[] = []): number {
  return Math.max(0, Math.min(top, Math.max(0, rowCount - bodyRows, fileRows.at(-1) ?? 0)))
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

/**
 * The body's window under `headRows` rows kept out of a pane `paneRows` tall.
 * A drawing is `headRows - 1` rows plus the window, shorter than the pane
 * whenever `paneRows > headRows`.
 */
export function windowRows(paneRows: number, headRows: number): number {
  return Math.max(1, paneRows - headRows)
}

/** Rows a wheel tick moves the body. */
export const TICK = 3

/**
 * The top a `ui.scroll` move asks for, the body `rows` tall over `rowCount`
 * rows. Home and End (`by = ±contentRows`) are told from a page key
 * (`bodyRows`) only while the drawing is shorter than the pane: see windowRows.
 */
export function scrolled(
  now: number,
  e: { by: number; bodyRows: number; contentRows: number },
  rows: number,
  rowCount: number,
): number {
  const { by, bodyRows, contentRows } = e
  if (contentRows !== bodyRows && Math.abs(by) === contentRows) return by < 0 ? 0 : rowCount
  return now + (Math.abs(by) >= bodyRows ? Math.max(1, rows - 2) * Math.sign(by) : by * TICK)
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

/** Terminal cells a code point takes: 2 for East Asian wide and emoji, 0 for combining marks, else 1. */
function cells(cp: number): number {
  if ((cp >= 0x0300 && cp <= 0x036f) || (cp >= 0x200b && cp <= 0x200f) || (cp >= 0xfe00 && cp <= 0xfe0f)) return 0
  if (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1faff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  ) return 2
  return 1
}

/** `text` cut to at most `width` cells, ending in `…` when cut. */
export function fit(text: string, width: number): string {
  const chars = Array.from(text)
  const widths = chars.map(ch => cells(ch.codePointAt(0) ?? 0))
  if (widths.reduce((n, w) => n + w, 0) <= width) return text
  let used = 0
  let out = ''
  for (const [i, ch] of chars.entries()) {
    const w = widths[i] ?? 1
    if (used + w > width - 1) break
    out += ch
    used += w
  }
  return `${out}…`
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
    case 'typechange':
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
