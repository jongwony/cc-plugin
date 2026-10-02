import type { Register } from 'claude-code'
import type { Chart } from './charts.ts'
import type { Role, Segment } from './diagrams.ts'
import { piecesOf, type Piece } from './figures.ts'
import type { Fitted } from './diagrams.ts'

// Every ```heatmap, ```bars and ```mermaid fence Claude writes is drawn where the
// fence was, on the terminal: charts as Raster cells, mermaid as box art built from
// Text elements. AssistantMessage is the finest site a mod gets, so a reply holding
// a figure is redrawn as a column of its own: Markdown for the prose around each
// fence, the figure in the fence's place. A fence that will not draw stays as
// written; a reply with nothing to draw, or another surface, goes to Claude Code
// untouched.

// the transcript's gutter and margins the drawing must clear
const INLINE_MARGIN = 6
const CACHE_LIMIT = 200
const HINT = /(`{3,}|~{3,})[ \t]*(heatmap|bars|mermaid)\b/i

// colour by role through element styles: the engine refuses escape sequences in text
const STYLE: Record<Role, { color?: string; dimColor?: boolean }> = {
  text: {},
  border: { color: 'cyan' },
  junction: { color: 'cyan' },
  line: { dimColor: true },
  corner: { dimColor: true },
  arrow: { color: 'yellow' },
  accent: { color: 'magenta' },
}

const cache = new Map<string, Piece[] | null>()

const planned = (text: string, columns: number): Piece[] | null => {
  const key = `${columns}\u0000${text}`
  if (cache.has(key)) return cache.get(key)!
  const pieces = piecesOf(text, columns)
  if (cache.size >= CACHE_LIMIT) cache.clear()
  cache.set(key, pieces)
  return pieces
}

export const register: Register = on => {
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    // Raster and the box art are terminal drawings; elsewhere the fence stays as Claude wrote it
    if (e.surface !== 'terminal') return next(e)
    const text = e.props.text
    if (!HINT.test(text)) return next(e)
    const pieces = planned(text, (e.viewport?.columns ?? 80) - INLINE_MARGIN)
    if (!pieces) return next(e)
    const { Box, Text, Markdown, Raster } = $.ui.resolve(e)

    const labelColumn = (chart: Chart) =>
      Box({
        flexDirection: 'column',
        width: chart.labelWidth,
        flexShrink: 0,
        children: chart.labels.map(label => Text({ wrap: 'truncate', children: [label] })),
      })

    const drawn = (chart: Chart, i: number) => {
      if (chart.kind === 'bars')
        return Box({
          flexDirection: 'column',
          children: [
            Box({
              flexDirection: 'row',
              columnGap: 1,
              children: [
                labelColumn(chart),
                Raster({ key: `chart-${i}`, columns: chart.columns, rows: chart.rows, cells: chart.cells }),
                Box({
                  flexDirection: 'column',
                  flexShrink: 0,
                  children: chart.values.map(v => Text({ dimColor: true, wrap: 'truncate', children: [v] })),
                }),
              ],
            }),
            Text({ dimColor: true, children: [chart.scale] }),
          ],
        })
      return Box({
        flexDirection: 'column',
        children: [
          Box({
            flexDirection: 'row',
            columnGap: 1,
            children: [
              Box({ width: chart.labelWidth, flexShrink: 0 }),
              Text({ dimColor: true, wrap: 'truncate', children: [chart.header] }),
            ],
          }),
          Box({
            flexDirection: 'row',
            columnGap: 1,
            children: [labelColumn(chart), Raster({ key: `chart-${i}`, columns: chart.columns, rows: chart.rows, cells: chart.cells })],
          }),
          Box({
            flexDirection: 'row',
            columnGap: 1,
            children: [
              Raster({ key: `legend-${i}`, columns: chart.legendColumns, rows: 1, cells: chart.legendCells }),
              Text({ dimColor: true, children: [chart.scale] }),
            ],
          }),
          Text({ dimColor: true, children: [chart.key] }),
        ],
      })
    }

    const spanOf = ({ text, role }: Segment) => Text({ ...STYLE[role ?? 'text'], children: [text] })
    const diagram = (fit: Fitted) =>
      Box({
        flexDirection: 'column',
        children: [
          ...fit.lines.map(line => (line.length === 0 ? Text({ children: [' '] }) : Box({ flexDirection: 'row', children: line.map(spanOf) }))),
          ...(fit.overflow > 0 ? [Text({ dimColor: true, children: [`… ${fit.overflow} columns cut · widen the terminal`] })] : []),
        ],
      })

    let charts = 0
    return Box({
      flexDirection: 'column',
      rowGap: 1,
      children: pieces.map(p => ('chart' in p ? drawn(p.chart, charts++) : 'diagram' in p ? diagram(p.diagram) : Markdown({ text: p.markdown }))),
    })
  })
}
