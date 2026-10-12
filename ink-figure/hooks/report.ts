import { fencesOf, verdictsOf } from './figures.ts'
import { INK, type Ink } from './math.ts'

// What the model reads after a turn whose reply held a fence the terminal would not
// draw: each such fence by its place in the turn and its kind, with the verdict's own
// reason. The verdict is the one the drawing takes (`verdictsOf`), measured against the
// last terminal that drew a reply this session, or against the drawing's own default
// width when none has.

// the transcript's gutter and margins the drawing must clear
export const INLINE_MARGIN = 6
// the width the drawing assumes when the terminal gives none
export const DEFAULT_COLUMNS = 80

export const reportOf = (texts: readonly string[], terminalColumns: number | null, ink: Ink = INK.either): string | null => {
  const columns = (terminalColumns ?? DEFAULT_COLUMNS) - INLINE_MARGIN
  const lines: string[] = []
  let ordinal = 0
  for (const raw of texts) {
    const text = raw.replace(/\r\n?/g, '\n')
    const fences = fencesOf(text)
    if (fences.length === 0) continue
    for (const verdict of verdictsOf(text, columns, ink, fences).fences) {
      ordinal++
      if ('drawn' in verdict) continue
      const kind = verdict.kind === 'math' ? 'math' : `mermaid ${verdict.kind}`
      const reason =
        verdict.cells === undefined
          ? verdict.reason
          : terminalColumns === null
            ? `drew ${verdict.cells} cells wide; no terminal has drawn a reply this session, so it was measured against the ${DEFAULT_COLUMNS}-column default (room ${columns})`
            : `drew ${verdict.cells} cells wide; the terminal last seen was ${terminalColumns} columns (room ${columns})`
      lines.push(`- figure ${ordinal} (${kind}): ${reason}`)
    }
  }
  if (lines.length === 0) return null
  return [
    `[ink-figure] ${lines.length === 1 ? 'A figure' : `${lines.length} figures`} in your last reply did not draw; the reader sees the fence source as written.`,
    ...lines,
    'This is for the figures you write later in this session (the drawn grammar is in the ink-figure README). The reply stands as written: do not re-emit it.',
  ].join('\n')
}
