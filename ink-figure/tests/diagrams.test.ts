import { expect, test } from 'claude-code/testing'
import { displayWidth, drawn, plainOf, renderOf, SPACING } from '../hooks/diagrams.ts'
import { piecesOf } from '../hooks/figures.ts'

const ENGINE = { type: 'Text', props: {}, children: ['drawn by Claude Code'] }

const message = (text: string, surface: 'terminal' | 'desktop' = 'terminal') => ({
  plugin: 'ink-figure',
  component: 'AssistantMessage',
  requestId: 'msg-1',
  surface,
  viewport: { columns: 140, rows: 40 },
  props: { text, isFirstOfReply: true },
})

const HANGUL = '```mermaid\ngraph LR\n  A[서울 요청] --> B[cache]\n  B --> C[응답]\n```'

const EIGHT = [
  'graph LR',
  '  F[fence in reply] --> T{surface}',
  '  T -->|terminal| M[mod redraws]',
  '  T -->|desktop| D[host renders]',
  '  M --> R[Raster: cells]',
  '  M --> I[Image: LaTeX png]',
  '  M --> X[text: mermaid box]',
  '  D --> K[math: native]',
  '  D --> S[mermaid: gap]',
].join('\n')

const linesOf = (source: string): string[] => {
  const art = drawn(source, 200)
  if (!('lines' in art)) throw new Error(art.error)
  return art.lines.map(plainOf)
}

test('Hangul labels line up: every row of the boxes ends in the same screen column', () => {
  const lines = linesOf('graph LR\n  A[서울 요청] --> B[cache]\n  B --> C[응답]')
  expect(lines.some(l => l.includes('서울 요청'))).toBe(true)
  expect(new Set(lines.map(displayWidth)).size).toBe(1)
})

test('a Hangul sequence diagram keeps its lifelines in one column', () => {
  const lines = linesOf('sequenceDiagram\n  사용자->>서버: 요청 보내기\n  서버-->>사용자: 응답')
  const lifelines = lines.filter(l => /^ +[│◀].*[│▶]$/.test(l))
  expect(lifelines.length).toBeGreaterThan(3)
  expect(new Set(lifelines.map(displayWidth)).size).toBe(1)
})

test('spacing defaults to 3 · 1 · 1 and boxes stand five rows tall', () => {
  expect(SPACING).toEqual({ paddingX: 3, paddingY: 1, boxBorderPadding: 1 })
  expect(linesOf('graph LR\n  A --> B').length).toBe(5)
})

test('an edge leaves its box from the border, not from inside the box', () => {
  const lines = linesOf(EIGHT)
  expect(lines.some(l => /surface ├─+terminal/.test(l))).toBe(true)
  expect(lines.some(l => /│ +┬ +│/.test(l))).toBe(false)
})

test('a fan-out edge ends its arrowhead on the target box border, not on the shared line', () => {
  const lines = linesOf(EIGHT)
  expect(lines.some(l => /[├└]►│ +Image: LaTeX png/.test(l))).toBe(true)
  expect(lines.some(l => /└►│ +text: mermaid box/.test(l))).toBe(true)
  expect(lines.every(l => [...l.matchAll(/►/g)].every(m => l[m.index! + 1] === '│'))).toBe(true)
})

test('the art carries no control character', () => {
  for (const source of ['graph LR\n  A[서울 요청] --> B[cache]', EIGHT, 'sequenceDiagram\n  A->>B: hi']) {
    for (const line of linesOf(source)) expect(/[\x00-\x1f\x7f]/.test(line)).toBe(false)
  }
})

test('a mermaid fence is drawn as Text in the fence place, the label kept whole', async ($, on) => {
  on('ui.render', () => ENGINE)
  const ui = await $.ui.mount(message(`Before.\n\n${HANGUL}\n\nAfter.`))
  expect(await ui.find({ type: 'Text', text: '서울 요청' })).toBeDefined()
  expect(await ui.find({ type: 'Markdown', text: 'Before.' })).toBeDefined()
  expect(await ui.find({ type: 'Markdown', text: 'After.' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'drawn by Claude Code' })).toBeUndefined()
})

test('a reply with two mermaid fences and prose between them draws both', async ($, on) => {
  on('ui.render', () => ENGINE)
  const text = ['Flow:', '', HANGUL, '', 'And the second:', '', '```mermaid\ngraph LR\n  P[plan] --> Q[ship]\n```'].join('\n')
  const ui = await $.ui.mount(message(text))
  expect(await ui.find({ type: 'Text', text: '서울 요청' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'ship' })).toBeDefined()
  expect(await ui.find({ type: 'Markdown', text: 'And the second:' })).toBeDefined()
})

test('off the terminal the message goes to Claude Code untouched', async ($, on) => {
  on('ui.render', () => ENGINE)
  const ui = await $.ui.mount(message(HANGUL, 'desktop'))
  expect(await ui.find({ type: 'Text', text: 'drawn by Claude Code' })).toBeDefined()
})

test('a mermaid fence shown inside another code block stays that block text', () => {
  const inner = '```mermaid\ngraph LR\n  A[request] --> B[cache]\n```'
  expect(piecesOf(`Syntax:\n\n\`\`\`\`markdown\n${inner}\n\`\`\`\`\n\nAfter.`, 94)).toBe(null)
  expect(piecesOf(`~~~\n${inner}\n~~~`, 94)).toBe(null)
  expect(piecesOf(`\`\`\`\`markdown\n${inner}\n\`\`\`\`\n\n${inner}`, 94)?.filter(p => 'diagram' in p).length).toBe(1)
})

test('a fence closes on a run at least as long as its opener', () => {
  const pieces = piecesOf('````mermaid\ngraph LR\n  A --> B\n`````\n\nAfter.', 94)
  expect(pieces?.length).toBe(2)
})

test('a kind the renderer does not draw, or a broken source, keeps its fence', () => {
  expect('error' in renderOf('pie title Pets\n  "Dogs" : 386')).toBe(true)
  expect(piecesOf('```mermaid\npie title Pets\n  "Dogs" : 386\n```', 94)).toBe(null)
  expect(piecesOf('```mermaid\nxychart-beta\n  x-axis [a, b]\n  bar [1, 2]\n```', 94)).toBe(null)
  expect(piecesOf('```mermaid\ngraph TD\n  가[시작] --> 나[끝]\n```', 94)).toBe(null)
})
