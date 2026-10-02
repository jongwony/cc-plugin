import { expect, test } from 'claude-code/testing'
import { barsOf, displayWidth, heatmapOf, niceStep, packCells, piecesOf } from '../hooks/charts.ts'

const ENGINE = { type: 'Text', props: {}, children: ['drawn by Claude Code'] }

const message = (text: string, surface: 'terminal' | 'desktop' = 'terminal') => ({
  plugin: 'cell-chart',
  component: 'AssistantMessage',
  requestId: 'msg-1',
  surface,
  viewport: { columns: 100, rows: 40 },
  props: { text, isFirstOfReply: true },
})

const HEATMAP = [
  'Latency by region and hour:',
  '',
  '```heatmap',
  'unit: ms',
  '        00h 06h 12h',
  '서울    12  40  95',
  'Tokyo   10  33  -',
  '```',
  '',
  'Seoul peaks at noon.',
].join('\n')

const BARS = ['Memory per worker:', '```bars', 'unit: GB', '인덱서: 3.2', 'api: 0.8', 'cache: 6', '```'].join('\n')

test('heatmap draws a Raster with a label column, a scale line and a column key', async ($, on) => {
  on('ui.render', () => ENGINE)
  const ui = await $.ui.mount(message(HEATMAP))
  const grid = await ui.find({ key: 'chart-0' })
  expect(grid?.type).toBe('Raster')
  expect(grid?.props).toMatchObject({ columns: 6, rows: 2 })
  expect(await ui.find({ type: 'Raster', key: 'legend-0' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '서울' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^1 shade ~ \d+(\.\d+)? ms · / })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'columns: 1 00h · 2 06h · 3 12h' })).toBeDefined()
  expect(await ui.find({ type: 'Markdown', text: 'Seoul peaks at noon.' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'drawn by Claude Code' })).toBeUndefined()
})

test('bars draw whole cells with the scale of one cell stated', async ($, on) => {
  on('ui.render', () => ENGINE)
  const ui = await $.ui.mount(message(BARS))
  const bars = await ui.find({ key: 'chart-0' })
  expect(bars?.type).toBe('Raster')
  expect(bars?.props).toMatchObject({ rows: 3 })
  expect(await ui.find({ type: 'Text', text: '인덱서' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '3.2 GB' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^1 cell ~ [\d.]+ GB/ })).toBeDefined()
})

test('off the terminal the message goes to Claude Code untouched', async ($, on) => {
  let seen = ''
  on('ui.render', ($, e) => {
    seen = e.props.text
    return ENGINE
  })
  const ui = await $.ui.mount(message(HEATMAP, 'desktop'))
  expect(await ui.find({ type: 'Text', text: 'drawn by Claude Code' })).toBeDefined()
  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  expect(seen).toBe(HEATMAP)
})

test('a malformed fence goes to Claude Code untouched', async ($, on) => {
  const bad = ['```bars', 'unit: GB', 'api: lots', '```'].join('\n')
  let seen = ''
  on('ui.render', ($, e) => {
    seen = e.props.text
    return ENGINE
  })
  const ui = await $.ui.mount(message(bad))
  expect(await ui.find({ type: 'Text', text: 'drawn by Claude Code' })).toBeDefined()
  expect(seen).toBe(bad)
})

test('a chart wider than the terminal goes to Claude Code untouched', async ($, on) => {
  const names = Array.from({ length: 40 }, (_, i) => `c${i}`)
  const wide = ['```heatmap', names.join(' '), 'row ' + names.map((_, i) => i).join(' '), '```'].join('\n')
  on('ui.render', () => ENGINE)
  const ui = await $.ui.mount(message(wide))
  expect(await ui.find({ type: 'Text', text: 'drawn by Claude Code' })).toBeDefined()
})

test('cells pack as little-endian u32 triplets in padded base64', () => {
  expect(packCells([0x2588, 0xff8800, 0x01000000])).toBe('iCUAAACI/wAAAAAB')
})

test('bar lengths round to whole cells of a nice step', () => {
  const chart = barsOf('unit: GB\na: 3.2\nb: 0.8\nc: 6', 94)!
  expect(chart.scale.startsWith('1 cell ~ 0.1 GB')).toBe(true)
  expect(chart.columns).toBe(60)
  expect(niceStep(0.13)).toBe(0.2)
  expect(niceStep(2.1)).toBe(2.5)
})

test('heatmap shades stay within the palette and accept piped tables', () => {
  const chart = heatmapOf('| | a | b |\n|---|---|---|\n| x | 0 | 1000 |\n| y | 250 | 500 |', 94)!
  expect(chart.labels).toEqual(['x', 'y'])
  expect(chart.legendColumns <= 16).toBe(true)
  expect(heatmapOf('a b\nx y', 94)).toBe(null)
})

test('Hangul labels count two columns each', () => {
  expect(displayWidth('서울')).toBe(4)
  expect(displayWidth('api')).toBe(3)
})

test('prose without a chart fence yields nothing to draw', () => {
  expect(piecesOf('```mermaid\ngraph LR\nA-->B\n```', 94)).toBe(null)
})
