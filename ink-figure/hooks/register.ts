import type { EngineInterface, Register } from 'claude-code'
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
// a theme change through /config, and read on demand only while still unknown; a
// read that fails settles on the ink that reads on either theme
let themeInk: Ink | null = null

const readTheme = async ($: EngineInterface): Promise<Ink> => {
  try {
    themeInk = inkOf((await $.config.list()).find(row => row.key === 'theme')?.value)
  } catch {
    themeInk = INK.either
  }
  return themeInk
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await readTheme($)
    return next(e)
  })

  on('config.set', { key: 'theme' }, async ($, e, next) => {
    const result = await next(e)
    if (result.deny === undefined) themeInk = inkOf(result.value)
    return result
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    // the figures are terminal drawings; elsewhere the fence stays as Claude wrote it
    if (e.surface !== 'terminal') return next(e)
    const text = e.props.text.replace(/\r\n?/g, '\n')
    const fences = fencesOf(text)
    if (fences.length === 0) return next(e)
    const ink = themeInk ?? (fences.some(f => f.lang === 'math') ? await readTheme($) : INK.either)
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
