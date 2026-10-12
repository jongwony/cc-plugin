import { fencesOf, verdictsOf } from './figures.ts'
import { INK, type Ink } from './math.ts'

// What the model reads after a turn whose reply held a fence the terminal renderer
// would not draw: each such fence by its place in the turn and its kind, with its own
// verdict's reason, and beside it any reason the whole reply is left as written. The
// verdicts are the terminal renderer's (`verdictsOf`, measured only), against the last
// terminal that drew a reply this session, or against the default width when none has,
// in which case the surface in use shows every fence as its source.

// the transcript's gutter and margins the drawing must clear
export const INLINE_MARGIN = 6
// the width the drawing assumes when the terminal gives none
export const DEFAULT_COLUMNS = 80

export const reportOf = (texts: readonly string[], terminalColumns: number | null, ink: Ink = INK.either): string | null => {
  const columns = (terminalColumns ?? DEFAULT_COLUMNS) - INLINE_MARGIN
  const lines: string[] = []
  let undrawn = 0
  let ordinal = 0
  for (const raw of texts) {
    const text = raw.replace(/\r\n?/g, '\n')
    const fences = fencesOf(text)
    if (fences.length === 0) continue
    const verdict = verdictsOf(text, columns, ink, fences, true)
    const first = ordinal + 1
    for (const fence of verdict.fences) {
      ordinal++
      if (fence.drawn) continue
      undrawn++
      const kind = fence.kind === 'math' ? 'math' : `mermaid ${fence.kind}`
      const reason =
        fence.cells === undefined
          ? fence.reason
          : terminalColumns === null
            ? `drew ${fence.cells} cells wide, over the ${DEFAULT_COLUMNS}-column default (room ${columns})`
            : `drew ${fence.cells} cells wide; the terminal last seen was ${terminalColumns} columns (room ${columns})`
      lines.push(`- figure ${ordinal} (${kind}): ${reason}`)
    }
    if (verdict.held !== null) {
      const span = first === ordinal ? `figure ${first}` : `figures ${first}–${ordinal}`
      const drawable = verdict.fences.filter(f => f.drawn).length
      undrawn += drawable
      lines.push(`- ${span}: the whole reply text holding ${first === ordinal ? 'it' : 'them'} is left as written, because ${verdict.held}${drawable > 0 ? ` (${drawable} would draw on ${drawable === 1 ? 'its' : 'their'} own)` : ''}`)
    }
  }
  if (lines.length === 0) return null
  const count = undrawn === 1 ? 'a figure' : `${undrawn} figures`
  return [
    terminalColumns === null
      ? `[ink-figure] No terminal has drawn a reply this session, so the surface in use shows every fence as its source. These are the terminal renderer's verdicts: it would not draw ${count} of your last reply.`
      : `[ink-figure] The terminal renderer did not draw ${count} of your last reply; on the terminal ${undrawn === 1 ? 'it shows' : 'they show'} as fence source.`,
    ...lines,
    'This is for the figures you write later in this session (the drawn grammar is in the ink-figure README). The reply stands as written: do not re-emit it.',
  ].join('\n')
}
