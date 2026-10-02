import { expect, test } from 'claude-code/testing'
import { displayWidth, heatmapOf, niceStep, packCells } from '../hooks/charts.ts'
import { piecesOf } from '../hooks/figures.ts'

const ENGINE = { type: 'Text', props: {}, children: ['drawn by Claude Code'] }

const message = (text: string, surface: 'terminal' | 'desktop' = 'terminal') => ({
  plugin: 'ink-figure',
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
  const bad = ['```heatmap', 'unit: ms', '     00h 12h', 'api  3 lots', '```'].join('\n')
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

test('a step is the smallest nice 1, 2, 2.5 or 5 × 10ⁿ at or above the raw step', () => {
  expect(niceStep(0.13)).toBe(0.2)
  expect(niceStep(2.1)).toBe(2.5)
})

test('a bars fence is not drawn: bars are written as text', () => {
  expect(piecesOf('```bars\nunit: GB\napi: 0.8\n```', 94)).toBe(null)
})

test('heatmap shades stay within the palette and accept piped tables', () => {
  const chart = heatmapOf('| | a | b |\n|---|---|---|\n| x | 0 | 1000 |\n| y | 250 | 500 |', 94)!
  expect(chart.labels).toEqual(['x', 'y'])
  expect(chart.legendColumns <= 16).toBe(true)
  expect(heatmapOf('a b\nx y', 94)).toBe(null)
})

test('the legend states the measured range, not the band edges', () => {
  const chart = heatmapOf('unit: 칸\n      a  b\n1줄  34 34\n3줄  34 40', 94)!
  expect(chart.scale).toBe('1 shade ~ 1 칸 · 34 to 40 칸, 7 shades')
})

test('Hangul labels count two columns each', () => {
  expect(displayWidth('서울')).toBe(4)
  expect(displayWidth('api')).toBe(3)
})

test('prose without a figure fence yields nothing to draw', () => {
  expect(piecesOf('Run this:\n\n```python\nprint(1)\n```', 94)).toBe(null)
})
