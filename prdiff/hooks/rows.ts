// What one drawing of a file carries, under the engine's limit on a drawn
// tree. Pure: no `$`.

import { clean, hunkSource, type FileDiff } from './parse.ts'

/** The engine's limit on the text of one drawing: strings, Code sources, Button labels, Box keys. */
export const CHAR_BUDGET = 100_000

/** The part of CHAR_BUDGET held back for the file list while the open file is drawn. */
export const LIST_BUDGET = 20_000

/** What one drawing has left to draw; `take` charges a drawn string and says whether it fits. */
export class Budget {
  constructor(public left: number) {}
  take(text: string): boolean {
    if (text.length > this.left) return false
    this.left -= text.length
    return true
  }
}

/** `text` cut to at most `n` UTF-16 units, never through a surrogate pair. */
export function clip(text: string, n: number): string {
  if (text.length <= n) return text
  const last = text.charCodeAt(n - 1)
  return text.slice(0, last >= 0xd800 && last <= 0xdbff ? n - 1 : n)
}

/** One hunk as drawn: its header row's text and its Code source. */
export type Run = { title: string; source: string }

/**
 * The hunks of `f` drawn from its start, charged to `b` while `keep` of it
 * stays unspent, each line clipped to `width`, and how many content lines
 * are left out. A hunk the
 * budget reaches is drawn as far as it fits.
 */
export function drawn(f: FileDiff, width: number, b: Budget, keep = 0): { runs: Run[]; left: number; note?: string } {
  const runs: Run[] = []
  let left = 0
  // Room for the note on what is left out, sized for the most it could count: every content line.
  const all = f.hunks.reduce((n, h) => n + h.lines.length, 0)
  const room0 = keep + leftOut(all).length
  for (const hunk of f.hunks) {
    const lines = hunk.lines.map(l => (l.text.length > width ? { ...l, text: clip(l.text, width) } : l))
    if (left > 0) {
      left += lines.length
      continue
    }
    const title = clip(clean(`${hunk.header} ${hunk.section}`), width)
    const run = (n: number): Run => ({ title, source: hunkSource(lines.slice(0, n)) })
    const room = b.left - room0
    // The most lines of this hunk that still fit.
    let lo = 0
    let hi = lines.length
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2)
      const r = run(mid)
      if (r.title.length + r.source.length <= room) lo = mid
      else hi = mid - 1
    }
    if (lo > 0) {
      const r = run(lo)
      b.take(r.title)
      b.take(r.source)
      runs.push(r)
    }
    left += lines.length - lo
  }
  const note = left > 0 && b.take(leftOut(left)) ? leftOut(left) : undefined
  return { runs, left, note }
}

/**
 * The most labels of `labels`, in order, that `b` takes together with the
 * line counting the rest; with none left over, no such line is needed.
 */
export function listed(labels: readonly string[], b: Budget): { labels: string[]; note?: string } {
  let k = 0
  let used = 0
  while (k < labels.length && used + (labels[k]?.length ?? 0) <= b.left) {
    used += labels[k]?.length ?? 0
    k += 1
  }
  while (k > 0 && k < labels.length && used + moreFiles(labels.length - k).length > b.left) {
    k -= 1
    used -= labels[k]?.length ?? 0
  }
  const out = labels.slice(0, k)
  for (const label of out) b.take(label)
  const rest = labels.length - k
  return { labels: out, note: rest > 0 && b.take(moreFiles(rest)) ? moreFiles(rest) : undefined }
}

/** The line that counts the files left out of the list. */
function moreFiles(n: number): string {
  return `${n} more files; j and k reach them`
}

/** The line that counts a file's lines left out of its drawing. */
function leftOut(n: number): string {
  return `  ${n} more lines of this file are not drawn`
}

export function fileLabel(f: FileDiff): string {
  const name = f.oldPath !== undefined && f.oldPath !== f.path ? `${f.oldPath} → ${f.path}` : f.path
  const stat = f.isBinary ? 'bin' : `+${f.added} −${f.deleted}`
  return `${f.status} ${name}  ${stat}`
}
