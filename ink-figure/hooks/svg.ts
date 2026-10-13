import { cellsOf, SERIES_COLOURS, type Role, type Segment } from './diagrams.ts'
import { CELL_PX } from './math.ts'

// A drawn diagram's cells as an SVG document, for the surfaces that draw an `Svg`
// element (the Claude apps) rather than a grid of terminal cells. Every run of
// characters of one width class sits at its own cell's x and is held to its cells'
// width (`textLength`), so the grid lines up whatever the app's font makes of a
// wide character. No `$`, so the tests drive it directly.

export type SvgPicture = { source: string; width: number; height: number; alt: string }

// an `Svg` element's source limit
export const MAX_SVG_CHARS = 131_072

// one cell, in CSS pixels: the cell a formula's picture is sized against; and the font
// size whose monospace advance fills it
export const SVG_CELL = CELL_PX
const FONT_PX = 15

// the terminal's role colours, as values that read on a light page and a dark one;
// text and the dim strokes take the page's own colour
const FILL: Record<Role, string> = {
  text: 'currentColor',
  border: '#1a9fb5',
  junction: '#1a9fb5',
  line: 'currentColor',
  corner: 'currentColor',
  arrow: '#c79a00',
  accent: '#c040c0',
}
const DIM: ReadonlySet<Role> = new Set(['line', 'corner'])
// each of SERIES_COLOURS, as a value that reads on either page
const SERIES_FILL: Record<(typeof SERIES_COLOURS)[number], string> = { green: '#2e9e44', blue: '#3b73d9', red: '#d24c4c' }

const escaped = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

type Run = { text: string; column: number; cells: number }

// a segment's characters split where a space falls or the width class changes, each
// run with the column it starts at and the cells it covers
const runsOf = (text: string, column: number): { runs: Run[]; next: number } => {
  const runs: Run[] = []
  let current: (Run & { each: number }) | null = null
  for (const ch of text) {
    const cells = cellsOf(ch.codePointAt(0)!)
    if (ch === ' ') {
      if (current) runs.push(current)
      current = null
    } else if (current && current.each === cells) {
      current.text += ch
      current.cells += cells
    } else {
      if (current) runs.push(current)
      current = { text: ch, column, cells, each: cells }
    }
    column += cells
  }
  if (current) runs.push(current)
  return { runs: runs.map(({ text, column, cells }) => ({ text, column, cells })), next: column }
}

export const gridSvgOf = (lines: readonly (readonly Segment[])[], alt: string): SvgPicture => {
  const body: string[] = []
  let columns = 0
  lines.forEach((line, row) => {
    let column = 0
    const y = row * SVG_CELL.height + SVG_CELL.height / 2
    for (const segment of line) {
      const { runs, next } = runsOf(segment.text, column)
      column = next
      const role = segment.role ?? 'text'
      const fill = segment.series ? SERIES_FILL[SERIES_COLOURS[segment.series - 1]!] : FILL[role]
      const opacity = DIM.has(role) && !segment.series ? ' fill-opacity="0.6"' : ''
      for (const run of runs) {
        const x = run.column * SVG_CELL.width
        const length = run.cells * SVG_CELL.width
        body.push(`<text x="${x}" y="${y}" textLength="${length}" lengthAdjust="spacingAndGlyphs" dominant-baseline="central" fill="${fill}"${opacity}>${escaped(run.text)}</text>`)
      }
    }
    columns = Math.max(columns, column)
  })
  const width = columns * SVG_CELL.width
  const height = lines.length * SVG_CELL.height
  const source = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="${FONT_PX}">`,
    ...body,
    '</svg>',
  ].join('')
  return { source, width, height, alt }
}
