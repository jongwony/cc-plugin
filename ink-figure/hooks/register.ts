import type { EngineInterface, Register, Timer } from 'claude-code'
import { SERIES_COLOURS, type Fitted, type Role, type Segment } from './diagrams.ts'
import { fencesOf, piecesOf, type MathPicture } from './figures.ts'
import { INK, inkOf, type Ink } from './math.ts'

// Every ```mermaid and ```math fence Claude writes is drawn where the fence was, on
// the terminal: a diagram or chart as box art built from Text elements, a formula as
// an Image. AssistantMessage is the finest site a mod gets, so a reply holding a
// figure is redrawn as a column of its own: Markdown for the prose around each
// fence, the figure in the fence's place. A fence that will not draw stays as
// written; a reply with nothing to draw, or another surface, goes to Claude Code
// untouched.

// the transcript's gutter and margins the drawing must clear
const INLINE_MARGIN = 6

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
// a theme change through /config, read on demand only while still unknown, and read
// again every THEME_POLL_MS once a formula has been drawn, since /theme changes the
// theme without a config.set; a read that fails settles on the ink that reads on
// either theme. A read answers only while no theme change landed after it began:
// `themeSet` counts those changes.
const THEME_POLL_MS = 5000
let themeInk: Ink | null = null
let themeSet = 0
let themePoll: Timer | null = null

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

// a new ink redraws the formulas already in the transcript; a render is otherwise
// reused until its props or viewport change
const rereadTheme = async ($: EngineInterface): Promise<void> => {
  const before = themeInk
  await readTheme($)
  if (themeInk !== before) $.ui.invalidate('ui.render')
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

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    // the figures are terminal drawings; elsewhere the fence stays as Claude wrote it
    if (e.surface !== 'terminal') return next(e)
    const text = e.props.text.replace(/\r\n?/g, '\n')
    const fences = fencesOf(text)
    if (fences.length === 0) return next(e)
    const math = fences.some(f => f.lang === 'math')
    if (math && themePoll === null) themePoll = $.clock.every(THEME_POLL_MS, () => void rereadTheme($))
    const ink = themeInk ?? (math ? await readTheme($) : INK.either)
    const pieces = piecesOf(text, (e.viewport?.columns ?? 80) - INLINE_MARGIN, ink, fences)
    if (!pieces) return next(e)
    const { Box, Text, Markdown, Image } = $.ui.resolve(e)

    const spanOf = ({ text, role, series }: Segment) =>
      Text({ ...STYLE[role ?? 'text'], ...(series ? { color: SERIES_COLOURS[series - 1] } : {}), children: [text] })
    const diagram = (fit: Fitted) =>
      Box({
        flexDirection: 'column',
        children: [
          ...fit.lines.map(line => (line.length === 0 ? Text({ children: [' '] }) : Box({ flexDirection: 'row', children: line.map(spanOf) }))),
          ...(fit.overflow > 0 ? [Text({ dimColor: true, children: [`… ${fit.overflow} columns cut · widen the terminal`] })] : []),
        ],
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
