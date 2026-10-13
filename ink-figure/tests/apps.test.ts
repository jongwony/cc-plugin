import { expect, test } from 'claude-code/testing'
import { displayWidth, drawn, plainOf } from '../hooks/diagrams.ts'
import { fencesOf, piecesOf } from '../hooks/figures.ts'
import { APP_COLUMNS, reportOf } from '../hooks/report.ts'
import { gridSvgOf, SVG_CELL } from '../hooks/svg.ts'

// The Claude apps: every surface but the terminal draws a fence as an Svg element.

const ENGINE = { type: 'Text' as const, props: {}, children: ['drawn by Claude Code'] }

type Surface = 'terminal' | 'desktop' | 'mobile'
const message = (text: string, surface: Surface, columns = 140) =>
  ({
    plugin: 'ink-figure',
    component: 'AssistantMessage',
    requestId: 'msg-1',
    surface,
    viewport: { columns, rows: 40 },
    props: { text, isFirstOfReply: true },
  }) as any

const fenced = (source: string, lang = 'mermaid') => '```' + lang + '\n' + source + '\n```'
const HANGUL_SOURCE = 'graph LR\n  A[서울 요청] --> B[cache]\n  B --> C[응답]'
const HANGUL = fenced(HANGUL_SOURCE)
const FRACTION = '\\frac{a+b}{c}'
const MATH = fenced(FRACTION, 'math')
// outside the drawn grammar: a dotted edge
const BAD = 'flowchart LR\n  A --> B\n  B -.-> C'
// wider than an 80-column terminal, within the app's room
const WIDE = 'graph LR\n' + Array.from({ length: 6 }, (_, i) => `  N${i}[a rather long label number ${i}] --> N${i + 1}[a rather long label number ${i + 1}]`).join('\n')
// wider than the app's room
const WIDER = 'graph LR\n' + Array.from({ length: 12 }, (_, i) => `  N${i}[a rather long label number ${i}] --> N${i + 1}[a rather long label number ${i + 1}]`).join('\n')
// a sequence diagram 119 cells wide, with Hangul messages
const SEQUENCE = [
  'sequenceDiagram',
  '  participant CC as Claude Code',
  '  participant HH as headersHelper',
  '  participant AU as Auth',
  '  participant EX as Exec',
  '  participant BQ as BigQuery',
  '  CC->>HH: 연결할 때 헤더 요청',
  '  HH->>AU: 봇 키로 서명한 assertion',
  '  AU-->>HH: 8시간 access token',
  '  HH-->>CC: Authorization 헤더',
  '  CC->>AU: tools/call과 slack_event',
  '  AU->>AU: 토큰 검증, voucher 확인, 판정',
  '  AU->>EX: 일회용 토큰으로 전달',
  '  EX->>BQ: 쿼리 100 GB, 100초',
  '  BQ-->>EX: 결과',
  '  EX-->>AU: 200 결과',
  '  AU-->>CC: 200 그대로 전달',
].join('\n')

// first in the file, before any terminal draws: a turn after an app drew reads the
// app's room and says so, and the app never stands in for a terminal width
test('after an app drew a reply, the report speaks for the app at the default room', async ($, on) => {
  on('ui.render', () => ENGINE)
  const notes: string[] = []
  on('session.append', ($: any, e: any, next: any) => {
    if (e.door === 'note') notes.push(...e.message.content.map((b: any) => b.text))
    return next(e)
  })
  on('turn.start', ($: any, e: any) => ({ turnId: e.turnId }))
  on('turn.complete', ($: any, e: any) => ({ text: e.answer }))
  const ui = await $.ui.mount(message(HANGUL, 'mobile', 30))
  expect(await ui.find({ type: 'Svg' })).toBeDefined()
  await ui.unmount()
  await $.turn.start({ text: 'draw it', turnId: 't1' })
  await $.session.append({ door: 'response', origin: { kind: 'model', model: 'test' }, uuid: 'row-0', message: { type: 'assistant', role: 'assistant', content: [{ type: 'text', text: `${fenced(WIDE)}\n\n${fenced(WIDER)}` }] } } as any)
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as any)
  expect(notes.length).toBe(1)
  expect(notes[0]).toContain(`The Claude app drawing this session lays figures out in a ${APP_COLUMNS}-cell room`)
  expect(notes[0]).not.toContain('figure 1 ')
  expect(notes[0]).toContain(`- figure 2 (mermaid flowchart): drew`)
  expect(notes[0]).toContain(`over the app's ${APP_COLUMNS}-cell room`)
})

test('the report preface names the app once one drew, and the source otherwise', () => {
  expect(reportOf([fenced(BAD)], null, undefined, true)).toContain('The Claude app drawing this session')
  expect(reportOf([fenced(BAD)], null, undefined, false)).toContain('the surface in use shows every fence as its source')
  expect(reportOf([fenced(BAD)], 120, undefined, true)).toContain('The terminal renderer did not draw')
})

test('each surface draws a diagram its own way: Text on the terminal, an Svg on the apps', async ($, on) => {
  on('ui.render', () => ENGINE)
  for (const surface of ['terminal', 'desktop', 'mobile'] as const) {
    const ui = await $.ui.mount(message(`Before.\n\n${HANGUL}\n\nAfter.`, surface))
    expect(await ui.find({ type: 'Text', text: 'drawn by Claude Code' })).toBeUndefined()
    expect(await ui.find({ type: 'Markdown', text: 'Before.' })).toBeDefined()
    expect(await ui.find({ type: 'Markdown', text: 'After.' })).toBeDefined()
    if (surface === 'terminal') {
      expect(await ui.find({ type: 'Text', text: '서울 요청' })).toBeDefined()
      expect(await ui.find({ type: 'Svg' })).toBeUndefined()
    } else {
      const svg = await ui.find({ type: 'Svg' })
      expect(svg!.props.alt).toBe(HANGUL_SOURCE)
      expect(String(svg!.props.source).startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
      expect(svg!.props.source).toContain('>서울<')
      expect(svg!.props.source).toContain('>요청<')
    }
    await ui.unmount()
  }
})

test('on the mobile app a formula is MathJax SVG in currentColor, its TeX the alt', async ($, on) => {
  on('ui.render', () => ENGINE)
  const ui = await $.ui.mount(message(`Cost:\n\n${MATH}`, 'mobile'))
  const svg = await ui.find({ type: 'Svg' })
  expect(svg!.props.alt).toBe(FRACTION)
  expect(svg!.props.source).toContain('xmlns="http://www.w3.org/2000/svg"')
  expect(svg!.props.source).toContain('currentColor')
  expect(svg!.props.source).not.toContain('vertical-align')
  expect(await ui.find({ type: 'Markdown', text: 'Cost:' })).toBeDefined()
})

test('on the desktop app a formula is left to the app, inside the prose as written', async ($, on) => {
  on('ui.render', () => ENGINE)
  const text = `Flow:\n\n${HANGUL}\n\nCost:\n\n${MATH}`
  const ui = await $.ui.mount(message(text, 'desktop'))
  expect((await ui.find({ type: 'Svg' }))!.props.alt).toBe(HANGUL_SOURCE)
  expect(await ui.find({ type: 'Markdown', text: /Cost:\n\n```math\n\\frac\{a\+b\}\{c\}\n```/ })).toBeDefined()
  // the fences the desktop is handed: the diagram alone
  const pieces = piecesOf(text, APP_COLUMNS, undefined, fencesOf(text).filter(f => f.lang === 'mermaid'), 'svg')!
  expect(pieces.filter(p => 'svg' in p).length).toBe(1)
  expect((pieces.at(-1) as { markdown: string }).markdown).toBe(`Cost:\n\n${MATH}`)
})

test('on the desktop app a reply with only a formula goes to the app untouched', async ($, on) => {
  on('ui.render', () => ENGINE)
  const ui = await $.ui.mount(message(`Cost:\n\n${MATH}`, 'desktop'))
  expect(await ui.find({ type: 'Text', text: 'drawn by Claude Code' })).toBeDefined()
})

test('on the apps a fence outside the drawn grammar goes to the app untouched', async ($, on) => {
  on('ui.render', () => ENGINE)
  for (const surface of ['desktop', 'mobile'] as const) {
    const ui = await $.ui.mount(message(fenced(BAD), surface))
    expect(await ui.find({ type: 'Text', text: 'drawn by Claude Code' })).toBeDefined()
    await ui.unmount()
  }
})

test("the apps lay a diagram out in their own room, never the app's width", async ($, on) => {
  on('ui.render', () => ENGINE)
  for (const source of [HANGUL_SOURCE, WIDE, SEQUENCE]) {
    const narrow = await $.ui.mount(message(fenced(source), 'mobile', 20))
    expect((await narrow.find({ type: 'Svg' }))!.props.alt).toBe(source)
    await narrow.unmount()
  }
  const wider = await $.ui.mount(message(fenced(WIDER), 'mobile', 400))
  expect(await wider.find({ type: 'Text', text: 'drawn by Claude Code' })).toBeDefined()
})

test('wide characters sit at their own cells in the SVG, held to two cells each', () => {
  const art = drawn(HANGUL_SOURCE, 200)
  if (!('lines' in art)) throw new Error(art.error)
  const { source } = gridSvgOf(art.lines, HANGUL_SOURCE)
  const row = art.lines.findIndex(line => plainOf(line).includes('서울 요청'))
  const plain = plainOf(art.lines[row]!)
  const y = row * SVG_CELL.height + SVG_CELL.height / 2
  for (const word of ['서울', '요청']) {
    const column = displayWidth(plain.slice(0, plain.indexOf(word)))
    expect(source).toContain(`<text x="${column * SVG_CELL.width}" y="${y}" textLength="${4 * SVG_CELL.width}"`)
  }
  expect(source).toContain(`width="${Math.max(...art.lines.map(l => displayWidth(plainOf(l)))) * SVG_CELL.width}"`)
})

test('the SVG escapes markup characters in a label', () => {
  const { source } = gridSvgOf([[{ text: 'a<b & "c"', role: null }]], '')
  expect(source).toContain('>a&lt;b<')
  expect(source).toContain('>&amp;<')
  expect(source).toContain('>&quot;c&quot;<')
})
