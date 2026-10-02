import { expect, test } from 'claude-code/testing'
import { displayWidth, plainOf, renderOf } from '../hooks/diagrams.ts'
import { piecesOf } from '../hooks/figures.ts'

const ENGINE = { type: 'Text', props: {}, children: ['drawn by Claude Code'] }

const LATENCY = [
  'xychart-beta',
  '  title "Latency"',
  '  x-axis [mon, tue, wed, thu, fri]',
  '  y-axis "ms" 0 --> 120',
  '  line [20, 35, 80, 60, 110]',
].join('\n')

const TWO = 'xychart-beta\n  x-axis [a, b, c, d]\n  line [1, 5, 3, 4]\n  line [4, 2, 2, 1]'

const linesOf = (source: string) => {
  const art = renderOf(source)
  if (!('lines' in art)) throw new Error(art.error)
  return art.lines
}

test('a line chart draws its title, axis ticks, categories and the line', () => {
  const lines = linesOf(LATENCY).map(plainOf)
  expect(lines.some(l => l.includes('Latency'))).toBe(true)
  expect(lines.some(l => /^ *120┤/.test(l))).toBe(true)
  expect(lines.some(l => /mon +tue +wed +thu +fri/.test(l))).toBe(true)
  expect(lines.some(l => /[╭╮╰╯]/.test(l))).toBe(true)
})

test('a bar chart, or a chart with a statement the parser cannot read, keeps its fence', () => {
  expect('error' in renderOf('xychart-beta\n  x-axis [a, b]\n  bar [1, 2]')).toBe(true)
  expect('error' in renderOf('xychart-beta\n  x-axis [a, b]\n  line [1, two]')).toBe(true)
  expect('error' in renderOf('xychart-beta\n  title Latency\n  line [1, 2]')).toBe(true)
})

test('a chart holding a line draws its bars beside it', () => {
  const lines = linesOf('xychart-beta\n  x-axis [q1, q2, q3]\n  bar [5, 7, 3]\n  line [4, 6, 5]').map(plainOf)
  expect(lines.some(l => l.includes('█'))).toBe(true)
})

test('two line series are told apart: the second carries a series number the first does not', () => {
  const segments = linesOf(TWO).flat()
  const lineCells = segments.filter(s => s.role === 'accent' && /[─╭╮╰╯│]/.test(s.text))
  expect(lineCells.some(s => s.series === undefined)).toBe(true)
  expect(lineCells.some(s => s.series === 1)).toBe(true)
})

test('Hangul categories and title keep every axis row within the chart width', () => {
  const lines = linesOf('xychart-beta\n  title "응답 시간"\n  x-axis [월, 화, 수]\n  line [3, 9, 5]').map(plainOf)
  const labels = lines.find(l => l.includes('월'))!
  expect(/월 +화 +수/.test(labels)).toBe(true)
  const axis = lines.find(l => l.includes('┬'))!
  expect(displayWidth(labels)).toBeLessThanOrEqual(displayWidth(axis))
})

test('a line chart fence is drawn in the reply, its second series in its own colour', async ($, on) => {
  on('ui.render', () => ENGINE)
  const ui = await $.ui.mount({
    plugin: 'ink-figure',
    component: 'AssistantMessage',
    requestId: 'msg-1',
    surface: 'terminal',
    viewport: { columns: 140, rows: 40 },
    props: { text: `Trend:\n\n\`\`\`mermaid\n${TWO}\n\`\`\``, isFirstOfReply: true },
  })
  expect(await ui.find({ type: 'Markdown', text: 'Trend:' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'drawn by Claude Code' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', props: { color: 'green' } })).toBeDefined()
  expect(piecesOf(`\`\`\`mermaid\n${TWO}\n\`\`\``, 94)).not.toBe(null)
})
