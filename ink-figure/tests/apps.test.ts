import { expect, test } from 'claude-code/testing'
import { displayWidth, drawn, plainOf } from '../hooks/diagrams.ts'
import { cachedSvgs, fencesOf, piecesOf } from '../hooks/figures.ts'
import { mathSvgOf } from '../hooks/math.ts'
import { APP_COLUMNS, reportOf } from '../hooks/report.ts'
import { gridSvgOf, SVG_CELL } from '../hooks/svg.ts'
import { adaptor, texToSvg } from '../hooks/vendor/math/mathjax.js'

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

const APP_PREFACE = (surface: string) => `The Claude app drawing this session (${surface}) lays figures out in a ${APP_COLUMNS}-cell room`
const TERMINAL_PREFACE = 'The terminal renderer did not draw'

// Draws each [surface, text] in order, then ends a turn whose reply is `reply`; the
// rows the model reads.
const reportAfter = async ($: any, on: any, draws: [Surface, string][], reply: string): Promise<string[]> => {
  on('ui.render', () => ENGINE)
  const notes: string[] = []
  on('session.append', ($: any, e: any, next: any) => {
    if (e.door === 'note') notes.push(...e.message.content.map((b: any) => b.text))
    return next(e)
  })
  on('turn.start', ($: any, e: any) => ({ turnId: e.turnId }))
  on('turn.complete', ($: any, e: any) => ({ text: e.answer }))
  for (const [surface, text] of draws) {
    const ui = await $.ui.mount(message(text, surface, 30))
    await ui.unmount()
  }
  await $.turn.start({ text: 'draw it', turnId: 't1' })
  await $.session.append({ door: 'response', origin: { kind: 'model', model: 'test' }, uuid: 'row-0', message: { type: 'assistant', role: 'assistant', content: [{ type: 'text', text: reply }] } })
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  return notes
}

test('after an app drew a reply, the report judges against the app room', async ($, on) => {
  const notes = await reportAfter($, on, [['mobile', HANGUL]], `${fenced(WIDE)}\n\n${fenced(WIDER)}`)
  expect(notes.length).toBe(1)
  expect(notes[0]).toContain(APP_PREFACE('mobile'))
  expect(notes[0]).not.toContain('figure 1 ')
  expect(notes[0]).toContain(`- figure 2 (mermaid flowchart): drew`)
  expect(notes[0]).toContain(`over the app's ${APP_COLUMNS}-cell room`)
})

test('an app whose fences all stay as written is still the surface the report judges for', async ($, on) => {
  const notes = await reportAfter($, on, [['mobile', fenced(BAD)]], fenced(BAD))
  expect(notes[0]).toContain(APP_PREFACE('mobile'))
  expect(notes[0]).toContain('a statement outside the drawn grammar')
})

test('the report follows the surface that drew last, terminal to app and back', async ($, on) => {
  const toApp = await reportAfter($, on, [['terminal', HANGUL], ['mobile', HANGUL]], fenced(WIDER))
  expect(toApp[0]).toContain(APP_PREFACE('mobile'))
  expect(toApp[0]).not.toContain(TERMINAL_PREFACE)
})

test('the report follows the surface that drew last, app to terminal', async ($, on) => {
  const toTerminal = await reportAfter($, on, [['mobile', HANGUL], ['terminal', HANGUL]], fenced(WIDE))
  expect(toTerminal[0]).toContain(TERMINAL_PREFACE)
  expect(toTerminal[0]).toContain('the terminal last seen was 30 columns (room 24)')
})

test('on the desktop app a formula is the app own and is not reported, and figures keep their place', async ($, on) => {
  const broken = fenced('\\frac{1}{\\nope}', 'math')
  const notes = await reportAfter($, on, [['desktop', HANGUL]], `${broken}\n\n${fenced(BAD)}`)
  expect(notes.length).toBe(1)
  expect(notes[0]).toContain(APP_PREFACE('desktop'))
  expect(notes[0]).not.toContain('figure 1 ')
  expect(notes[0]).toContain('- figure 2 (mermaid flowchart): ')
  expect(reportOf([broken], { surface: 'desktop', columns: APP_COLUMNS })).toBe(null)
  expect(reportOf([broken], { surface: 'mobile', columns: APP_COLUMNS })).toContain('- figure 1 (math): ')
})

test('an SVG over the Svg source limit stays as written on the apps, and is reported so', async ($, on) => {
  const long = ['sequenceDiagram', '  participant A', '  participant B', ...Array.from({ length: 100 }, (_, i) => `  A->>B: a b c d e f g h ${i}`)].join('\n')
  expect(piecesOf(fenced(long), APP_COLUMNS, undefined, undefined, 'svg')).toBe(null)
  const notes = await reportAfter($, on, [['mobile', HANGUL]], fenced(long))
  expect(notes[0]).toContain('source limit of an Svg element')
})

test('the report preface names the surface in use, and the source where none drew', () => {
  expect(reportOf([fenced(BAD)], { surface: 'mobile', columns: APP_COLUMNS })).toContain(APP_PREFACE('mobile'))
  expect(reportOf([fenced(BAD)], null)).toContain('the surface in use shows every fence as its source')
  expect(reportOf([fenced(BAD)], { surface: 'terminal', columns: 114 })).toContain(TERMINAL_PREFACE)
})

test('the SVG verdicts are held within a byte budget, two bytes a character', () => {
  const source = 'graph LR\n  Q[budget probe] --> R[held]'
  const before = cachedSvgs()
  const pieces = piecesOf(fenced(source), APP_COLUMNS, undefined, undefined, 'svg')!
  const svg = pieces.find(p => 'svg' in p) as { svg: { source: string } }
  const after = cachedSvgs()
  expect(after.count).toBe(before.count + 1)
  expect(after.bytes - before.bytes).toBe(svg.svg.source.length * 2)
})

// a formula drawn past its own box: \rlap's text to the right, \smash's fraction above
// and below
for (const tex of ['\\rlap{\\text{overhanging text here}}x', '\\smash{\\frac{\\frac a b}{\\frac c d}}']) {
  test(`a formula's SVG covers its overhang and keeps it at the left: ${tex}`, () => {
    const svg = mathSvgOf(tex, APP_COLUMNS)
    if ('error' in svg) throw new Error(svg.error)
    const view = /viewBox="([^"]+)"/.exec(svg.source)![1]!.split(' ').map(Number) as [number, number, number, number]
    const own = adaptor.getAttribute(texToSvg(tex), 'viewBox')!.split(' ').map(Number) as [number, number, number, number]
    // the box the picture is laid out on, in MathJax's units: no letterbox, so nothing is centred
    expect(Math.abs(view[2] / view[3] - svg.width / svg.height)).toBeLessThan(1e-6)
    expect(svg.source).toContain('preserveAspectRatio="xMinYMin meet"')
    expect(view[0]).toBeLessThanOrEqual(own[0])
    expect(view[1]).toBeLessThanOrEqual(own[1])
    expect(view[0] + view[2]).toBeGreaterThanOrEqual(own[0] + own[2])
    expect(view[1] + view[3]).toBeGreaterThanOrEqual(own[1] + own[3])
    if (tex.startsWith('\\rlap')) expect(view[2]).toBeGreaterThan(own[2] * 5)
    else expect(view[3]).toBeGreaterThan(own[3] * 5)
  })
}

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
