// What one drawing of a file carries, under the engine's limit on a drawn
// tree. Pure: no `$`.

import { hunkSource, type FileDiff } from './parse.ts'

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

/** How many of `texts`, in order, fit in `budget` characters. */
export function fitting(texts: readonly string[], budget: number): number {
  let used = 0
  let n = 0
  for (const t of texts) {
    if (used + t.length > budget) break
    used += t.length
    n += 1
  }
  return n
}

/** One hunk as drawn: its header row's text and its Code source. */
export type Run = { title: string; source: string }

/** The characters a drawn run puts in the tree: the one place the budget is charged. */
function cost(r: Run): number {
  return r.title.length + r.source.length
}

/**
 * The hunks of `f` drawn from its start under `budget`, each line clipped to
 * `width` (a row drawn `truncate-end` shows no more), and how many content
 * lines are left out. A hunk the budget reaches is drawn as far as it fits.
 */
export function drawn(f: FileDiff, width: number, budget: number): { runs: Run[]; left: number } {
  const runs: Run[] = []
  let used = 0
  let left = 0
  for (const hunk of f.hunks) {
    const lines = hunk.lines.filter(l => l.mark !== '\\').map(l => (l.text.length > width ? { ...l, text: clip(l.text, width) } : l))
    if (left > 0) {
      left += lines.length
      continue
    }
    const title = `${hunk.header} ${hunk.section}`
    const run = (n: number): Run => ({ title, source: hunkSource(lines.slice(0, n)) })
    // The most lines of this hunk that still fit.
    let lo = 0
    let hi = lines.length
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2)
      if (used + cost(run(mid)) <= budget) lo = mid
      else hi = mid - 1
    }
    if (lo > 0) {
      const r = run(lo)
      runs.push(r)
      used += cost(r)
    }
    left += lines.length - lo
  }
  return { runs, left }
}

export function fileLabel(f: FileDiff): string {
  const name = f.oldPath !== undefined && f.oldPath !== f.path ? `${f.oldPath} → ${f.path}` : f.path
  const stat = f.isBinary ? 'bin' : `+${f.added} −${f.deleted}`
  return `${f.status} ${name}  ${stat}`
}
