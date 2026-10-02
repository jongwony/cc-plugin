import type { Register } from 'claude-code'
import { piecesOf, type Chart, type Piece } from './charts.ts'

// Every ```heatmap and ```bars fence Claude writes is drawn as Raster cells
// where the fence was, on the terminal. AssistantMessage is the finest site a
// mod gets, so a reply holding a chart is redrawn as a column of its own:
// Markdown for the prose around each fence, and the chart in the fence's place.
// Anything that will not draw — another surface, a malformed fence, a chart
// wider than the terminal — goes to Claude Code untouched.

// the transcript's gutter and margins the drawing must clear
const INLINE_MARGIN = 6
const CACHE_LIMIT = 200
const HINT = /(`{3,}|~{3,})[ \t]*(heatmap|bars)\b/i

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
    // Raster is a terminal element; elsewhere the fence stays as Claude wrote it
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

    let charts = 0
    return Box({
      flexDirection: 'column',
      rowGap: 1,
      children: pieces.map(p => ('chart' in p ? drawn(p.chart, charts++) : Markdown({ text: p.markdown }))),
    })
  })
}
