// What one drawing of a file carries, under the engine's limit on a drawn
// tree. Pure: no `$`.

import type { DiffLine, FileDiff, Hunk } from './parse.ts'

/** What one drawing may carry in text; the engine cuts a tree at 100,000. */
export const CHAR_BUDGET = 90_000

/** The part of CHAR_BUDGET the file list may take; the rest is the file's body. */
export const LIST_BUDGET = 20_000

/** `text` cut to at most `n` UTF-16 units, never through a surrogate pair. */
export function clip(text: string, n: number): string {
  if (text.length <= n) return text
  const last = text.charCodeAt(n - 1)
  return text.slice(0, last >= 0xd800 && last <= 0xdbff ? n - 1 : n)
}

/** How many of `texts`, in order, fit in `budget` characters, each costing its length and 8. */
export function fitting(texts: readonly string[], budget: number): number {
  let used = 0
  let n = 0
  for (const t of texts) {
    if (used + t.length + 8 > budget) break
    used += t.length + 8
    n += 1
  }
  return n
}

export type Run = { hunk: Hunk; lines: DiffLine[] }

/**
 * The hunks of `f` drawn from its start under `budget`, each line clipped to
 * `width` (a row drawn `truncate-end` shows no more), and how many content
 * lines are left out. A hunk the budget reaches is drawn up to where it ends.
 */
export function drawn(f: FileDiff, width: number, budget: number): { runs: Run[]; left: number } {
  const runs: Run[] = []
  let used = 0
  let left = 0
  for (const hunk of f.hunks) {
    const lines: DiffLine[] = []
    for (const l of hunk.lines) {
      if (l.mark === '\\') continue
      const line = l.text.length > width ? { ...l, text: clip(l.text, width) } : l
      if (left > 0 || used + line.text.length + 8 > budget) {
        left += 1
        continue
      }
      used += line.text.length + 8
      lines.push(line)
    }
    if (lines.length > 0) runs.push({ hunk, lines })
  }
  return { runs, left }
}

export function fileLabel(f: FileDiff): string {
  const name = f.oldPath !== undefined && f.oldPath !== f.path ? `${f.oldPath} → ${f.path}` : f.path
  const stat = f.isBinary ? 'bin' : `+${f.added} −${f.deleted}`
  return `${f.status} ${name}  ${stat}`
}
