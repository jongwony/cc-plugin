import { expect, test } from 'claude-code/testing'
import { displayWidth, plainOf, renderOf, SERIES_COLOURS } from '../hooks/diagrams.ts'
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

test('a value off the y-axis, or an axis that cannot be drawn, keeps the fence at once', () => {
  for (const source of [
    'xychart-beta\n  y-axis 0 --> 1\n  line [0, 1000000000]',
    'xychart-beta\n  x-axis [a, b]\n  line [-1e308, 1e308]',
    'xychart-beta\n  y-axis 100000000000000000 --> 100000000000000020\n  line [100000000000000000, 100000000000000016]',
  ]) {
    const started = performance.now()
    expect('error' in renderOf(source)).toBe(true)
    expect(performance.now() - started).toBeLessThan(500)
  }
})

test('series take colours that read on every theme; a chart with more series than colours keeps its fence', () => {
  const chart = (n: number) =>
    'xychart-beta\n  x-axis [a, b, c]\n  y-axis 0 --> 10\n' + Array.from({ length: n }, (_, i) => `  line [${i + 1}, ${i + 2}, ${i + 1}]`).join('\n')
  expect(SERIES_COLOURS).not.toContain('white')
  expect(SERIES_COLOURS).not.toContain('yellow')
  expect('lines' in renderOf(chart(SERIES_COLOURS.length + 1))).toBe(true)
  expect('error' in renderOf(chart(SERIES_COLOURS.length + 2))).toBe(true)
})

test('a chart statement with anything after it keeps the fence', () => {
  for (const extra of ['  line [1, 2] invalid', '  bar [1, 2] x', '  title "T" more', '  y-axis 0 --> 10 ms', '  x-axis [a, b] c'])
    expect('error' in renderOf(`xychart-beta\n  x-axis [a, b]\n${extra}\n  line [1, 2]`)).toBe(true)
  expect('error' in renderOf('xychart-beta sideways\n  x-axis [a, b]\n  line [1, 2]')).toBe(true)
  expect('lines' in renderOf('xychart-beta horizontal\n  x-axis [a, b]\n  line [1, 2]')).toBe(true)
})

test('bars on an axis that lies wholly below zero grow from its top, at once', () => {
  const started = performance.now()
  const art = renderOf('xychart-beta\n  x-axis [a]\n  y-axis -1000000001 --> -1000000000\n  bar [-1000000000]\n  line [-1000000000]')
  expect(performance.now() - started).toBeLessThan(200)
  const horizontal = renderOf('xychart-beta horizontal\n  x-axis [a]\n  y-axis -20 --> -10\n  bar [-15]\n  line [-12]')
  expect('lines' in horizontal || 'error' in horizontal).toBe(true)
  expect('lines' in art || 'error' in art).toBe(true)
})

test('a series with more or fewer values than categories keeps the fence', () => {
  for (const source of [
    'xychart-beta\n  x-axis [a, b]\n  y-axis 0 --> 10\n  line [2, 8, 5]',
    'xychart-beta\n  x-axis [a, b, c]\n  line [2, 8]',
    'xychart-beta\n  x-axis [a, b]\n  bar [1, 2, 3]\n  line [1, 2]',
    'xychart-beta horizontal\n  x-axis [a, b]\n  line [1, 2, 3]',
    'xychart-beta\n  line [1, 2, 3]\n  line [1, 2]',
  ])
    expect('error' in renderOf(source)).toBe(true)
  expect('lines' in renderOf('xychart-beta\n  line [1, 2, 3]\n  line [3, 2, 1]')).toBe(true)
})

test('a chart with more values than its size cap keeps the fence at once; an ordinary one draws', () => {
  const values = (n: number) => Array.from({ length: n }, (_, i) => i % 7).join(', ')
  const categories = (n: number) => Array.from({ length: n }, (_, i) => `c${i}`).join(', ')
  const started = performance.now()
  expect('error' in renderOf(`xychart-beta\n  x-axis [${categories(130)}]\n  line [${values(130)}]`)).toBe(true)
  expect(performance.now() - started).toBeLessThan(100)
  expect('lines' in renderOf(`xychart-beta\n  x-axis [${categories(12)}]\n  line [${values(12)}]`)).toBe(true)
})
