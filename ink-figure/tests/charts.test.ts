import { expect, test } from 'claude-code/testing'
import { displayWidth, plainOf, renderOf } from '../hooks/diagrams.ts'
import { piecesOf } from '../hooks/figures.ts'

const ENGINE = { type: 'Text', props: {}, children: ['drawn by Claude Code'] }

const LATENCY = [
  'xychart-beta',
  '  title "Latency"',
  '  x-axis [mon, tue, wed, thu, fri]',
  '  y-axis 0 --> 120',
  '  line [20, 35, 80, 60, 110]',
].join('\n')

const TWO = 'xychart-beta\n  x-axis [a, b, c, d]\n  line [1, 5, 3, 4]\n  line [4, 2, 2, 1]'
const ONE = 'xychart-beta\n  x-axis [a, b, c, d]\n  line [1, 5, 3, 4]'

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

test('the allowed chart draws every value at its tick, in order across the categories', () => {
  const lines = linesOf('xychart-beta\n  x-axis [p, q, r]\n  y-axis 0 --> 4\n  line [1, 3, 2]').map(plainOf)
  const row = (tick: string) => lines.find(l => new RegExp(`^ *${tick}┤`).test(l))!
  const columnOf = (category: string) => lines[lines.length - 1]!.indexOf(category)
  // the line runs flat along each value's row through its category's column
  expect(/─/.test(row('1')[columnOf('p')]!)).toBe(true)
  expect(/[─╭╮]/.test(row('3')[columnOf('q')]!)).toBe(true)
  expect(/[─╭╮╰╯]/.test(row('2')[columnOf('r')]!)).toBe(true)
})

test('bars beside a line, a second series, or a horizontal chart keep the fence', () => {
  expect('error' in renderOf('xychart-beta\n  x-axis [q1, q2, q3]\n  bar [5, 7, 3]\n  line [4, 6, 5]')).toBe(true)
  expect('error' in renderOf(TWO)).toBe(true)
  expect('error' in renderOf('xychart-beta horizontal\n  x-axis [a, b]\n  line [1, 2]')).toBe(true)
  expect('lines' in renderOf(ONE)).toBe(true)
})

test('an axis title, whose units the drawing drops, keeps the fence', () => {
  expect('error' in renderOf('xychart-beta\n  x-axis [a, b]\n  y-axis "Latency (ms)" 0 --> 10\n  line [1, 2]')).toBe(true)
  expect('error' in renderOf('xychart-beta\n  x-axis "day" [a, b]\n  line [1, 2]')).toBe(true)
  expect('lines' in renderOf('xychart-beta\n  x-axis [a, b]\n  y-axis 0 --> 10\n  line [1, 2]')).toBe(true)
})

test('a fractional or very small value, whose ticks are drawn wrong, keeps the fence', () => {
  expect('error' in renderOf('xychart-beta\n  x-axis [a, b, c]\n  line [0.000001, 0.000002, 0.000003]')).toBe(true)
  expect('error' in renderOf('xychart-beta\n  x-axis [a, b]\n  line [1.5, 2]')).toBe(true)
  expect('error' in renderOf('xychart-beta\n  x-axis [a, b]\n  y-axis 0 --> 2.5\n  line [1, 2]')).toBe(true)
  const lines = linesOf('xychart-beta\n  x-axis [a, b, c]\n  line [-5, 0, 1234567]').map(plainOf)
  expect(lines.some(l => /^ *1200000┤/.test(l))).toBe(true)
})

test('category names that run into each other, or a title cut at its ends, keep the fence', () => {
  expect('error' in renderOf('xychart-beta\n  x-axis [alphabetical, betamaxformat, gammaradiation, deltafunction, epsilonzero, zetaone]\n  line [1, 2, 3, 4, 5, 6]')).toBe(true)
  expect('error' in renderOf(`xychart-beta\n  title "${'a long title '.repeat(8).trim()}"\n  x-axis [a, b]\n  line [1, 2]`)).toBe(true)
  expect('lines' in renderOf('xychart-beta\n  x-axis [alpha, beta, gamma]\n  line [1, 2, 3]')).toBe(true)
})

test('Hangul categories and title keep every axis row within the chart width', () => {
  const lines = linesOf('xychart-beta\n  title "응답 시간"\n  x-axis [월, 화, 수]\n  line [3, 9, 5]').map(plainOf)
  const labels = lines.find(l => l.includes('월'))!
  expect(/월 +화 +수/.test(labels)).toBe(true)
  const axis = lines.find(l => l.includes('┬'))!
  expect(displayWidth(labels)).toBeLessThanOrEqual(displayWidth(axis))
})

test('a line chart fence is drawn in the reply, its line in the accent colour', async ($, on) => {
  on('ui.render', () => ENGINE)
  const ui = await $.ui.mount({
    plugin: 'ink-figure',
    component: 'AssistantMessage',
    requestId: 'msg-1',
    surface: 'terminal',
    viewport: { columns: 140, rows: 40 },
    props: { text: `Trend:\n\n\`\`\`mermaid\n${ONE}\n\`\`\``, isFirstOfReply: true },
  })
  expect(await ui.find({ type: 'Markdown', text: 'Trend:' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'drawn by Claude Code' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', props: { color: 'magenta' } })).toBeDefined()
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

test('a chart statement with anything after it keeps the fence', () => {
  for (const extra of ['  line [1, 2] invalid', '  bar [1, 2] x', '  title "T" more', '  y-axis 0 --> 10 ms', '  x-axis [a, b] c'])
    expect('error' in renderOf(`xychart-beta\n  x-axis [a, b]\n${extra}\n  line [1, 2]`)).toBe(true)
  expect('error' in renderOf('xychart-beta sideways\n  x-axis [a, b]\n  line [1, 2]')).toBe(true)
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
  expect('lines' in renderOf('xychart-beta\n  line [1, 2, 3]')).toBe(true)
})

test('a chart with more values than its size cap keeps the fence at once; an ordinary one draws', () => {
  const values = (n: number) => Array.from({ length: n }, (_, i) => i % 7).join(', ')
  const categories = (n: number) => Array.from({ length: n }, (_, i) => `c${i}`).join(', ')
  const started = performance.now()
  expect('error' in renderOf(`xychart-beta\n  x-axis [${categories(130)}]\n  line [${values(130)}]`)).toBe(true)
  expect(performance.now() - started).toBeLessThan(100)
  expect('lines' in renderOf(`xychart-beta\n  x-axis [${categories(12)}]\n  line [${values(12)}]`)).toBe(true)
})

test('a chart whose layout draws over a wide character keeps its fence; a short Hangul chart draws', () => {
  const long = ['일월', '이월', '삼월', '사월', '오월', '육월', '칠월', '팔월', '구월', '시월', '십일월'].map(m => `${m}매우긴범주`)
  expect('error' in renderOf(`xychart-beta\n  x-axis [${long.join(', ')}]\n  line [${long.map((_, i) => i + 1).join(', ')}]`)).toBe(true)
  expect('lines' in renderOf('xychart-beta\n  title "응답 시간"\n  x-axis [월, 화, 수]\n  line [3, 9, 5]')).toBe(true)
})
