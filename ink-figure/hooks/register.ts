import type { ApiContentBlock, EngineInterface, Register } from 'claude-code'
import { SERIES_COLOURS, type Role, type Segment } from './diagrams.ts'
import { fencesFor, fencesOf, piecesOf, type Drawer, type MathPicture } from './figures.ts'
import { INK, inkOf, type Ink } from './math.ts'
import { APP_COLUMNS, DEFAULT_COLUMNS, INLINE_MARGIN, reportOf } from './report.ts'

// Every ```mermaid and ```math fence Claude writes is drawn where the fence was, on
// the terminal: a diagram or chart as box art built from Text elements, a formula as
// an Image; on a Claude app (any other surface), as an Svg laid out in APP_COLUMNS,
// but for a formula on the desktop, which the app draws itself. AssistantMessage is
// the finest site a mod gets, so a reply holding a figure is redrawn as a column of
// its own: Markdown for the prose around each fence, the figure in the fence's place.
// A fence that will not draw stays as written; a reply with nothing to draw goes to
// Claude Code untouched. When a turn ends, a fence of its reply that would not draw is
// reported to the model in a row it reads and the person does not see as typed, so
// the figures it writes later fit what draws.

// colour by role through element styles: the engine refuses escape sequences in text
const STYLE: Record<Role, { color?: string; dimColor?: boolean }> = {
  text: {},
  border: { color: 'cyan' },
  junction: { color: 'cyan' },
  line: { dimColor: true },
  corner: { dimColor: true },
  arrow: { color: 'yellow' },
  accent: { color: 'magenta' },
}

// the math ink for the current theme: read when the session starts, kept in step by
// config.set on `theme` (the path /config and /theme both save through), and read on
// demand only while still unknown; a read that fails settles on the ink that reads on
// either theme. A read answers only while no theme change landed after it began:
// `themeSet` counts those changes.
let themeInk: Ink | null = null
let themeSet = 0

// the surface that last drew a reply and the room it lays figures out in, recorded on
// every draw whether or not a figure drew; and the main loop's response text this turn,
// in order
let drawer: Drawer | null = null
let replyTexts: string[] = []

const textsOf = (content: readonly ApiContentBlock[]): string[] => content.flatMap(b => (b.type === 'text' && typeof b.text === 'string' ? [b.text] : []))

const readTheme = async ($: EngineInterface): Promise<Ink> => {
  const began = themeSet
  let ink: Ink
  try {
    ink = inkOf((await $.config.list()).find(row => row.key === 'theme')?.value)
  } catch {
    ink = INK.either
  }
  if (themeSet === began) themeInk = ink
  return themeInk ?? ink
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    void readTheme($)
    return result
  })

  on('config.set', { key: 'theme' }, async ($, e, next) => {
    const result = await next(e)
    if (result.deny === undefined) {
      const ink = inkOf(result.value)
      themeSet++
      if (ink !== themeInk) {
        themeInk = ink
        $.ui.invalidate('ui.render')
      }
    }
    return result
  })

  on('session.append', { door: 'response' }, async ($, e, next) => {
    const result = await next(e)
    // observing only: once next stored the row, nothing here may fail the hook
    try {
      if (e.agentId === undefined && result.message?.type === 'assistant') replyTexts.push(...textsOf(result.message.content))
    } catch {}
    return result
  })

  on('turn.start', async ($, e, next) => {
    replyTexts = []
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) return result
    const texts = replyTexts
    replyTexts = []
    if (e.reason !== 'answer') return result
    const text = reportOf(texts, drawer, themeInk ?? INK.either)
    if (text !== null) {
      // a plugin above refuses the row by resolving { deny }; the bottom refuses a run
      // no plugin may shape by rejecting. The reply stands either way; the debug log
      // keeps why the report did not reach the model.
      try {
        const stored = await $.session.append({ message: { type: 'user', content: [{ type: 'text', text }] } })
        if (stored.deny !== undefined) $.ui.log(`undrawn-figure report refused: ${stored.deny}`, { to: 'debug' })
      } catch (err) {
        $.ui.log(`undrawn-figure report refused: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' })
      }
    }
    return result
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.surface !== 'terminal') {
      // a Claude app draws an Svg in a fixed room, never its own width, and only the
      // fences fencesFor leaves to the mod
      drawer = { surface: e.surface, columns: APP_COLUMNS }
      const text = e.props.text.replace(/\r\n?/g, '\n')
      const fences = fencesFor(fencesOf(text), e.surface)
      if (fences.length === 0) return next(e)
      const pieces = piecesOf(text, APP_COLUMNS, INK.either, fences, 'svg')
      if (!pieces) return next(e)
      const { Box, Markdown, Svg } = $.ui.resolve(e)
      return Box({
        flexDirection: 'column',
        rowGap: 1,
        children: pieces.map(p => ('svg' in p ? Svg({ source: p.svg.source, alt: p.svg.alt }) : Markdown({ text: p.markdown }))),
      })
    }
    const columns = e.viewport?.columns ?? DEFAULT_COLUMNS
    drawer = { surface: 'terminal', columns: columns - INLINE_MARGIN }
    const text = e.props.text.replace(/\r\n?/g, '\n')
    const fences = fencesOf(text)
    if (fences.length === 0) return next(e)
    const math = fences.some(f => f.lang === 'math')
    const ink = themeInk ?? (math ? await readTheme($) : INK.either)
    const pieces = piecesOf(text, columns - INLINE_MARGIN, ink, fences)
    if (!pieces) return next(e)
    const { Box, Text, Markdown, Image } = $.ui.resolve(e)

    const spanOf = ({ text, role, series }: Segment) =>
      Text({ ...STYLE[role ?? 'text'], ...(series ? { color: SERIES_COLOURS[series - 1] } : {}), children: [text] })
    const diagram = ({ lines }: { lines: Segment[][] }) =>
      Box({
        flexDirection: 'column',
        children: lines.map(line => (line.length === 0 ? Text({ children: [' '] }) : Box({ flexDirection: 'row', children: line.map(spanOf) }))),
      })
    const formula = ({ rgba, width, height, columns, rows, tex }: MathPicture) =>
      Image({ source: { rgba, width, height }, columns, rows, alt: tex })

    return Box({
      flexDirection: 'column',
      rowGap: 1,
      children: pieces.map(p => ('diagram' in p ? diagram(p.diagram) : 'math' in p ? formula(p.math) : Markdown({ text: p.markdown }))),
    })
  })
}
