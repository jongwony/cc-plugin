import { expect, test } from 'claude-code/testing'
import { displayWidth, drawn, fitLines, layouts, leftToRightOf, plainOf, renderOf, SPACING } from '../hooks/diagrams.ts'
import { fencesOf, piecesOf } from '../hooks/figures.ts'

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

test('emoji, astral CJK and presentation emoji line up with the box borders', () => {
  for (const label of ['😀 smile', '𠀀𠀁 rare', '✅ passed', '🚀 launch']) {
    const lines = linesOf(`graph LR\n  A["${label}"] --> B[done]`)
    expect(lines.some(l => l.includes(label))).toBe(true)
    expect(new Set(lines.map(displayWidth)).size).toBe(1)
  }
})

test('a decomposed Hangul label is composed before layout and lines up', () => {
  const lines = linesOf(`graph LR\n  A[${'서울 요청'.normalize('NFD')}] --> B[cache]`)
  expect(lines.some(l => l.includes('서울 요청'))).toBe(true)
  expect(new Set(lines.map(displayWidth)).size).toBe(1)
})

test('a character the cells cannot hold keeps the fence', () => {
  expect('error' in renderOf('graph LR\n  A["👨‍👩‍👧 family"] --> B[ok]')).toBe(true)
  expect('error' in renderOf('graph LR\n  A["❤️ love"] --> B[ok]')).toBe(true)
  expect('error' in renderOf('graph LR\n  A["beforeafter"] --> B[ok]')).toBe(true)
  expect(piecesOf('```mermaid\ngraph LR\n  A["🇰🇷 flag"] --> B[ok]\n```', 94)).toBe(null)
})

test('a state diagram keeps its start and end transitions, their labels and the states only they name', () => {
  const labelled = linesOf('stateDiagram-v2\n  [*] --> A: boot\n  A --> B: proceed\n  B --> [*]: exit').join('\n')
  for (const word of ['boot', 'proceed', 'exit']) expect(labelled.includes(word)).toBe(true)
  const ending = linesOf('stateDiagram-v2\n  [*] --> Idle\n  Idle --> Run\n  Error --> [*]\n  Run --> Done').join('\n')
  for (const state of ['Idle', 'Run', 'Error', 'Done']) expect(ending.includes(state)).toBe(true)
})

test('a statement the parser cannot consume keeps the fence instead of drawing part of it', () => {
  expect('error' in renderOf('graph LR\n  A --> B; B --> C')).toBe(true)
  expect('error' in renderOf('graph LR\n  A --> B\n  가[시작] --> 나[끝]')).toBe(true)
  expect('error' in renderOf('sequenceDiagram\n  autonumber\n  A->>B: one')).toBe(true)
  expect('error' in renderOf('erDiagram\n  A {\n    name\n  }')).toBe(true)
  expect('error' in renderOf('classDiagram\n  class A\n  note for A "a note"')).toBe(true)
})

test('statements that draw nothing, a trailing semicolon and unspaced arrows still draw', () => {
  const lines = linesOf('graph TD;\n  %% note\n  accTitle: flow\n  A-->B;\n  B---C\n  click A "https://example.com"\n  style A fill:#f00').join('\n')
  for (const id of ['A', 'B', 'C']) expect(new RegExp(`│ ${id} [│├]`).test(lines)).toBe(true)
  expect(lines.includes('click')).toBe(false)
})

test('a later definition of a node or state gives it its text', () => {
  expect(linesOf('graph LR\n  A --> B\n  A[Customer]').some(l => l.includes('Customer'))).toBe(true)
  expect(linesOf('stateDiagram-v2\n  A --> B\n  A : Customer').some(l => l.includes('Customer'))).toBe(true)
  const both = linesOf('stateDiagram-v2\n  state "Long name" as L\n  A --> L\n  L : described').join('\n')
  expect(both.includes('Long name') && both.includes('described')).toBe(true)
})

test('an ER relationship label is drawn whole, however long', () => {
  for (const label of ['places many orders', '주문을 여러 번 한다']) {
    const lines = linesOf(`erDiagram\n  CUSTOMER ||--o{ ORDER : "${label}"`)
    expect(lines.some(l => l.includes(label))).toBe(true)
  }
})

test('a self-loop keeps its return segment and arrowhead at the compact spacing', () => {
  const lines = linesOf('graph LR\n  A --> A')
  expect(lines.some(l => l.includes('▲'))).toBe(true)
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

test('an astral character one cell wide keeps the fence: the layout would give it two', () => {
  for (const label of ['𝐀𝐁𝐂 bold', '𝒜 request', '🌡 temp']) expect('error' in renderOf(`graph LR\n  A["${label}"] --> B[done]`)).toBe(true)
})

test('a sequence activation keeps the fence: its bar is not drawn', () => {
  expect('error' in renderOf('sequenceDiagram\n  A->>B: hi\n  activate B\n  B-->>A: ok\n  deactivate B')).toBe(true)
  expect('error' in renderOf('sequenceDiagram\n  A->>+B: hi\n  B-->>-A: ok')).toBe(true)
  expect('error' in renderOf('sequenceDiagram\n  A->>B: hi\n  B-->>A: ok')).toBe(false)
})

test('a fence indented four spaces is an indented code block, and three is still a fence', () => {
  const example = '```mermaid\ngraph TD\nA-->B\n```'
  const indented = (n: number) => example.split('\n').map(line => ' '.repeat(n) + line).join('\n')
  expect(piecesOf(`Example:\n\n${indented(4)}\n`, 94)).toBe(null)
  expect(piecesOf(`1. Step\n${indented(3)}\n`, 94)).not.toBe(null)
})

test('a reply with CRLF line ends draws like one with LF', () => {
  expect(piecesOf('a\r\n\r\n```mermaid\r\ngraph TD\r\nA-->B\r\n```\r\n', 94)).not.toBe(null)
})

test('a reply holding a link or footnote definition goes to Claude Code whole', () => {
  const fence = '```mermaid\ngraph TD\nA-->B\n```'
  expect(piecesOf(`see [x][1]\n\n${fence}\n\n[1]: https://example.com`, 94)).toBe(null)
  expect(piecesOf(`a note[^1]\n\n${fence}\n\n[^1]: the note`, 94)).toBe(null)
  expect(piecesOf(`see [x](https://example.com)\n\n${fence}`, 94)).not.toBe(null)
})

test('a control character inside a statement keeps the fence; leading indentation does not', () => {
  for (const label of ['a\tb', 'a\x1b[31mb', 'a\x07b']) expect('error' in renderOf(`graph LR\n  A["${label}"] --> B`)).toBe(true)
  expect('lines' in renderOf('graph LR\n\tA --> B')).toBe(true)
})

const bigGraph = (nodes: number, edges: number): string => {
  const lines = ['graph TD']
  let seed = 7
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
  for (let i = 0; i < edges; i++) lines.push(`  N${Math.floor(rand() * nodes)} --> N${Math.floor(rand() * nodes)}`)
  return lines.join('\n')
}

test('a diagram too big to lay out quickly keeps its fence at once', () => {
  const started = performance.now()
  expect('error' in drawn(bigGraph(300, 750), 134)).toBe(true)
  expect(performance.now() - started).toBeLessThan(500)
  expect('lines' in drawn(EIGHT, 134)).toBe(true)
})

test('every kind past its size caps keeps its fence before allocating a canvas; ordinary ones draw', () => {
  const many = (n: number, line: (i: number) => string) => Array.from({ length: n }, (_, i) => line(i)).join('\n')
  const started = performance.now()
  for (const source of [
    `sequenceDiagram\n${many(600, i => `  A${i}->>A${(i + 1) % 600}: x`)}`,
    `sequenceDiagram\n${many(151, () => '  A->>B: x')}`,
    `classDiagram\n${many(50, i => `  C${i} <|-- C${i + 1}`)}`,
    `erDiagram\n${many(45, i => `  E${i} ||--o{ E${i + 1} : r`)}`,
  ])
    expect('error' in renderOf(source)).toBe(true)
  expect(performance.now() - started).toBeLessThan(500)
  for (const source of [
    `sequenceDiagram\n${many(40, i => `  A${i % 6}->>A${(i + 1) % 6}: m${i}`)}`,
    `classDiagram\n${many(12, i => `  C${i} <|-- C${i + 1}`)}`,
    `erDiagram\n${many(8, i => `  E${i} ||--o{ E${i + 1} : r`)}`,
  ])
    expect('lines' in renderOf(source)).toBe(true)
})

test('an edge the router gives up on keeps the fence instead of a straight fallback', () => {
  const chain = (n: number) => ['graph TD', ...Array.from({ length: n }, (_, i) => `  N${i} --> N${i + 1}`)].join('\n')
  expect(renderOf(chain(25))).toEqual({ error: 'an edge too long to route' })
  expect('lines' in renderOf(chain(20))).toBe(true)
})

test('a flowchart header with no direction draws, as mermaid draws it top to bottom', () => {
  for (const header of ['flowchart', 'graph', 'graph;']) expect(linesOf(`${header}\n  A[start] --> B[end]`).some(l => l.includes('start'))).toBe(true)
})

test('a Yijing hexagram is one cell and a Hangul Jamo Extended-A initial is two; rows line up', () => {
  for (const label of ['䷀ yi', 'ꥠ x', '〈x〉']) {
    const lines = linesOf(`graph LR\n  A["${label}"] --> B[ok]`)
    expect(new Set(lines.map(displayWidth)).size).toBe(1)
  }
  expect('error' in renderOf('graph LR\n  A["ꥠힰ x"] --> B[ok]')).toBe(true)
})

test('only a top-down flowchart is turned sideways; BT and RL keep the direction written', () => {
  expect(leftToRightOf('graph TD\n  A --> B')).not.toBe(null)
  expect(leftToRightOf('graph td\n  A --> B')).not.toBe(null)
  expect(leftToRightOf('graph\n  A --> B')).not.toBe(null)
  for (const header of ['graph BT', 'graph rl', 'graph RL', 'graph LR', 'flowchart bt']) expect(leftToRightOf(`${header}\n  A --> B`)).toBe(null)
})

test('the sideways layout rewrites the header line itself, not a comment above it', () => {
  expect(leftToRightOf('%% graph TD\ngraph TD\nA-->B')).toBe('%% graph TD\ngraph LR\nA-->B')
  expect(leftToRightOf('%% stateDiagram note\nstateDiagram-v2\n  A --> B')).toBe('%% stateDiagram note\nstateDiagram-v2\n  direction LR\n  A --> B')
  expect(leftToRightOf('graph TD\n  A["$& $1"] --> B')).toBe('graph LR\n  A["$& $1"] --> B')
})

test('a block left open at the end of the source keeps the fence', () => {
  for (const source of [
    'graph LR\n  subgraph S\n  A --> B',
    'sequenceDiagram\n  loop forever\n  A->>B: hi',
    'sequenceDiagram\n  alt ok\n  A->>B: hi\n  else no\n  B->>A: bye',
    'stateDiagram-v2\n  state Busy {\n    Load --> Work',
    'classDiagram\n  class A {\n    +int x',
    'erDiagram\n  A {\n    int x',
  ])
    expect('error' in renderOf(source)).toBe(true)
  for (const source of [
    'graph LR\n  subgraph S\n  A --> B\n  end',
    'sequenceDiagram\n  loop forever\n  A->>B: hi\n  end',
    'classDiagram\n  class A {\n    +int x\n  }',
    'erDiagram\n  A {\n    int x\n  }',
  ])
    expect('lines' in renderOf(source)).toBe(true)
})

test('a mermaid fence inside an outer fence opened in a list item or block quote stays text', () => {
  expect(fencesOf('- ~~~~markdown\n  ```mermaid\n  graph LR\n  A-->B\n  ```\n  ~~~~')).toEqual([])
  expect(fencesOf('> ````\n> ```mermaid\n> graph LR\n> A-->B\n> ```\n> ````')).toEqual([])
  const after = fencesOf('1. ````text\n   ```mermaid\n   graph LR\n   ```\n   ````\n\n```mermaid\ngraph LR\n  A --> B\n```')
  expect(after.length).toBe(1)
  expect(after[0]!.source).toBe('graph LR\n  A --> B')
})

test('a source opening with front matter keeps its fence', () => {
  expect('error' in drawn('---\nconfig:\n  flowchart:\n    curve: basis\n---\nflowchart TD\n  A --> B', 200)).toBe(true)
})

test('a definition whose destination is on the next line also sends the reply back whole', () => {
  expect(piecesOf('See [docs][r].\n\n```mermaid\ngraph LR\nA-->B\n```\n\n[r]:\n  https://example.com', 94)).toBe(null)
})

test('a diagram is laid out once per source: another width only chooses and fits again', () => {
  const source = 'graph TD\n  Q1[resize probe] --> Q2[second box]\n  Q1 --> Q3[third box]'
  const fence = '```mermaid\n' + source + '\n```'
  const before = layouts.runs
  const wide = piecesOf(fence, 120)
  expect(layouts.runs).toBe(before + 1)
  const narrow = piecesOf(fence, 30)
  const again = piecesOf(fence, 120)
  expect(layouts.runs).toBe(before + 1)
  const fresh = (columns: number) => {
    const art = drawn(source, columns)
    if (!('lines' in art)) throw new Error(art.error)
    return fitLines(art.lines, columns)
  }
  expect(narrow).toEqual([{ diagram: fresh(30) }])
  expect(wide).toEqual([{ diagram: fresh(120) }])
  expect(again).toEqual(wide)
})
