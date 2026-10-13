import { chosenOf, fitsIn, kindOf, layoutsOf, widthOf, type Layouts, type Segment } from './diagrams.ts'
import { INK, MAX_CELLS, mathLayoutOf, mathOf, mathSvgOf, type Ink } from './math.ts'
import { gridSvgOf, MAX_SVG_CHARS, type SvgPicture } from './svg.ts'

// One pass over a reply: every ```mermaid and ```math fence, in order, with the
// prose between them kept as Markdown.

export type MathPicture = { rgba: string; width: number; height: number; columns: number; rows: number; tex: string }
export type Piece = { markdown: string } | { diagram: { lines: Segment[][] } } | { math: MathPicture } | { svg: SvgPicture }
// What the figures are drawn for: the terminal's cells and pixels, or an `Svg` element
// on a surface that draws one (the Claude apps). The verdicts are the same either way
// but for an SVG past the element's source limit.
export type Target = 'terminal' | 'svg'
export type FenceBlock = { lang: 'mermaid' | 'math'; start: number; end: number; source: string }
// Why a fence draws or not on its own: its kind (a mermaid diagram's header kind, or
// `math`), that it draws (with its figure, unless only measured), or the reason it
// stays as written and, for a figure that drew too wide, its width in cells.
export type FenceVerdict = { kind: string; drawn: true; piece?: Piece } | { kind: string; drawn: false; reason: string; cells?: number }
// The reply's verdict: one per fence in order, each its own; `held`, the reason the
// whole reply is left as written even where a fence would draw, or null; and the
// pieces the reply is drawn as, null when the caller leaves the message untouched or
// the verdict was only measured.
export type ReplyVerdict = { fences: FenceVerdict[]; held: string | null; pieces: Piece[] | null }

// Markdown element limit per chunk
export const MAX_MARKDOWN_CHARS = 10_000

// Markdown takes tab and newline as its only control characters
const DRAWABLE = /^[^\x00-\x08\x0b-\x1f\x7f]*$/
// a link reference or footnote definition, which applies across the whole reply; its
// destination may stand on the next line
const DEFINITION = /^ {0,3}\[[^\]\n]+\]:/m

const FENCE_LINE = /^ {0,3}(`{3,}|~{3,})(.*)$/
// a fence opened after a list item's or a block quote's marker
const CONTAINER_FENCE = /^ {0,3}(?:(?:[-*+]|\d{1,9}[.)])[ \t]+|>[ \t]?)+ {0,3}(`{3,}|~{3,})(.*)$/
// a fence closing one opened in a container, at the container's indent or marker
const CONTAINER_CLOSE = /^[ \t]*(?:>[ \t]?)*[ \t]*(`{3,}|~{3,})[ \t]*$/
const LANG = /^[ \t]*(mermaid|math)(?![\w-])/i

const opens = (fence: RegExpExecArray | null): fence is RegExpExecArray => fence !== null && !(fence[1]!.startsWith('`') && fence[2]!.includes('`'))

// Fenced code blocks as CommonMark reads them: a fence line is indented at most
// three spaces, and closes on the same character, at least as long, with nothing
// after it. A mermaid or math fence on a line of its own, at 0–3 spaces (a list
// item's indented content included), that opens while no other fence is open is a
// figure. A fence opened on a list item's or block quote's marker line is tracked
// so that a fence inside it stays its text, and is never drawn itself.
export const fencesOf = (text: string): FenceBlock[] => {
  const blocks: FenceBlock[] = []
  let open: { mark: string; start: number; body: number; lang: FenceBlock['lang'] | null; container: boolean } | null = null
  let at = 0
  for (const line of text.split('\n')) {
    const next = at + line.length + 1
    const fence = FENCE_LINE.exec(line)
    if (open === null) {
      if (opens(fence)) {
        const lang = LANG.exec(fence[2]!)?.[1]?.toLowerCase() as FenceBlock['lang'] | undefined
        open = { mark: fence[1]!, start: at, body: next, lang: lang ?? null, container: false }
      } else {
        const contained = CONTAINER_FENCE.exec(line)
        if (opens(contained)) open = { mark: contained[1]!, start: at, body: next, lang: null, container: true }
      }
    } else if (open.container) {
      const close = CONTAINER_CLOSE.exec(line)
      if (close && close[1]![0] === open.mark[0] && close[1]!.length >= open.mark.length) open = null
    } else if (fence && fence[1]![0] === open.mark[0] && fence[1]!.length >= open.mark.length && fence[2]!.trim() === '') {
      const source = text.slice(open.body, Math.max(open.body, at - 1)).replace(/\r\n?/g, '\n').trim()
      if (open.lang && source !== '') blocks.push({ lang: open.lang, start: open.start, end: at + line.length, source })
      open = null
    }
    at = next
  }
  return blocks
}

// Drawn figures by fence, so a streaming reply draws only the fence that changed;
// least recently used first out, within a count and a byte budget.
const CACHE_LIMIT = 200
const CACHE_BYTES = 16 * 1024 * 1024
type Drawing = { layouts: Layouts } | { math: MathPicture | { error: string } }
const figures = new Map<string, { drawing: Drawing; bytes: number }>()
let cachedBytes = 0

export const fenceKindOf = (block: FenceBlock): string => (block.lang === 'math' ? 'math' : kindOf(block.source))

const WIDE = 'wider than the room'

// Neither drawing depends on the room: a diagram's layouts are kept by source and
// chosen for the room after the lookup, and a formula is drawn once at the widest
// an Image takes; either one wider than the room keeps its fence. A measured verdict
// reads the cache but never fills it, and lays a formula out without filling a pixel.
const verdictOf = (block: FenceBlock, columns: number, ink: Ink, measure: boolean, target: Target = 'terminal'): FenceVerdict => {
  const kind = fenceKindOf(block)
  if (target === 'svg') return svgVerdictOf(block, kind, columns)
  if (measure && block.lang === 'math' && !figures.has(keyOf(block, ink))) {
    const layout = mathLayoutOf(block.source, MAX_CELLS)
    if ('error' in layout) return { kind, drawn: false, reason: layout.error }
    return layout.columns <= columns ? { kind, drawn: true } : { kind, drawn: false, reason: WIDE, cells: layout.columns }
  }
  const drawing = cachedDrawingOf(block, ink, !measure)
  if ('layouts' in drawing) {
    const art = chosenOf(drawing.layouts, columns)
    if ('error' in art) return { kind, drawn: false, reason: art.error }
    const { lines } = art
    return fitsIn(art, columns) ? { kind, drawn: true, piece: { diagram: { lines } } } : { kind, drawn: false, reason: WIDE, cells: widthOf(lines) }
  }
  if ('error' in drawing.math) return { kind, drawn: false, reason: drawing.math.error }
  return drawing.math.columns <= columns
    ? { kind, drawn: true, piece: { math: drawing.math } }
    : { kind, drawn: false, reason: WIDE, cells: drawing.math.columns }
}

const OVER_SVG = `an SVG over the ${MAX_SVG_CHARS}-character source limit of an Svg element`

// SVG figures by fence and room, least recently used first out
const svgs = new Map<string, FenceVerdict>()

// A fence's verdict for an `Svg` element: a diagram takes the layout the terminal would
// at this room and draws its cells as SVG; a formula takes MathJax's own SVG within the
// same bounds. Either one past the element's source limit keeps its fence.
const svgVerdictOf = (block: FenceBlock, kind: string, columns: number): FenceVerdict => {
  const key = [block.lang, columns, block.source].join('\u0000')
  const hit = svgs.get(key)
  if (hit) {
    svgs.delete(key)
    svgs.set(key, hit)
    return hit
  }
  let verdict: FenceVerdict
  if (block.lang === 'mermaid') {
    const drawing = cachedDrawingOf(block, INK.either, true)
    const art = 'layouts' in drawing ? chosenOf(drawing.layouts, columns) : { error: 'nothing to draw' }
    if ('error' in art) verdict = { kind, drawn: false, reason: art.error }
    else {
      const { lines } = art
      verdict = fitsIn(art, columns) ? svgPieceOf(kind, gridSvgOf(lines, block.source)) : { kind, drawn: false, reason: WIDE, cells: widthOf(lines) }
    }
  } else {
    const svg = mathSvgOf(block.source, MAX_CELLS)
    if ('error' in svg) verdict = { kind, drawn: false, reason: svg.error }
    else if (svg.columns > columns) verdict = { kind, drawn: false, reason: WIDE, cells: svg.columns }
    else verdict = svgPieceOf(kind, { source: svg.source, width: svg.width, height: svg.height, alt: block.source })
  }
  svgs.set(key, verdict)
  while (svgs.size > CACHE_LIMIT) svgs.delete(svgs.keys().next().value!)
  return verdict
}

const svgPieceOf = (kind: string, picture: SvgPicture): FenceVerdict =>
  picture.source.length > MAX_SVG_CHARS ? { kind, drawn: false, reason: OVER_SVG } : { kind, drawn: true, piece: { svg: picture } }

const keyOf = (block: FenceBlock, ink: Ink): string =>
  (block.lang === 'mermaid' ? [block.lang, block.source] : [block.lang, ink.join(','), block.source]).join('\u0000')

// the figures held for the drawing, for a test to read
export const cached = () => ({ count: figures.size, bytes: cachedBytes })

const cachedDrawingOf = (block: FenceBlock, ink: Ink, store: boolean): Drawing => {
  const key = keyOf(block, ink)
  const hit = figures.get(key)
  if (hit) {
    figures.delete(key)
    figures.set(key, hit)
    return hit.drawing
  }
  let drawing: Drawing
  if (block.lang === 'mermaid') drawing = { layouts: layoutsOf(block.source) }
  else {
    const art = mathOf(block.source, MAX_CELLS, ink)
    drawing = { math: 'rgba' in art ? { ...art, rgba: art.rgba.toBase64(), tex: block.source } : { error: art.error } }
  }
  if (!store) return drawing
  const bytes = 'math' in drawing && 'rgba' in drawing.math ? drawing.math.rgba.length : 0
  figures.set(key, { drawing, bytes })
  cachedBytes += bytes
  while (figures.size > CACHE_LIMIT || cachedBytes > CACHE_BYTES) {
    const [oldest, entry] = figures.entries().next().value!
    figures.delete(oldest)
    cachedBytes -= entry.bytes
  }
  return drawing
}

const pushMarkdown = (pieces: Piece[], text: string) => {
  if (text.trim() !== '') pieces.push({ markdown: text.replace(/^\n+/, '').replace(/\n+$/, '') })
}

const handable = (markdown: string): boolean => markdown.length <= MAX_MARKDOWN_CHARS && DRAWABLE.test(markdown)

const PROSE_UNHANDABLE = `the prose around the fences holds a control character or a run over ${MAX_MARKDOWN_CHARS} characters`
const JOINED_UNHANDABLE = `an undrawn fence's source joined to the prose beside it holds a control character or a run over ${MAX_MARKDOWN_CHARS} characters`

// What keeps a whole reply as written before any figure is weighed: a definition its
// pieces would lose, or prose between the fences that cannot be handed to Markdown.
const heldOf = (text: string, blocks: readonly FenceBlock[]): string | null => {
  if (DEFINITION.test(text)) return 'the reply holds a link reference or footnote definition'
  let gap = 0
  for (const block of blocks) {
    if (!handable(text.slice(gap, block.start).trim())) return PROSE_UNHANDABLE
    gap = block.end
  }
  return handable(text.slice(gap).trim()) ? null : PROSE_UNHANDABLE
}

// The reply's verdict: each fence's own verdict, always, so a reason that keeps the
// whole reply as written is reported beside a fence's reason and never in its place;
// then the markdown between the drawn fences, an undrawn fence staying in it as
// written. The pieces are null when nothing draws, the reply is held, or `measure`
// asks for verdicts alone; `fences` takes the reply's fences already found.
export const verdictsOf = (reply: string, columns: number, ink: Ink = INK.either, fences?: readonly FenceBlock[], measure = false, target: Target = 'terminal'): ReplyVerdict => {
  const text = reply.replace(/\r\n?/g, '\n')
  const blocks = fences ?? fencesOf(text)
  if (blocks.length === 0) return { fences: [], held: null, pieces: null }
  const verdicts = blocks.map(block => verdictOf(block, columns, ink, measure, target))
  const held = heldOf(text, blocks)
  if (held !== null) return { fences: verdicts, held, pieces: null }
  if (!verdicts.some(v => v.drawn)) return { fences: verdicts, held: null, pieces: null }
  const runs: string[] = []
  let pending = ''
  let cursor = 0
  blocks.forEach((block, i) => {
    if (!verdicts[i]!.drawn) return
    runs.push(pending + text.slice(cursor, block.start))
    pending = ''
    cursor = block.end
  })
  runs.push(pending + text.slice(cursor))
  const trimmed = runs.map(r => r.replace(/^\n+/, '').replace(/\n+$/, ''))
  if (trimmed.some(r => r.trim() !== '' && !handable(r))) return { fences: verdicts, held: JOINED_UNHANDABLE, pieces: null }
  if (measure) return { fences: verdicts, held: null, pieces: null }
  const pieces: Piece[] = []
  let r = 0
  pushMarkdown(pieces, runs[r++]!)
  for (const v of verdicts) {
    if (!v.drawn) continue
    pieces.push(v.piece!)
    pushMarkdown(pieces, runs[r++]!)
  }
  return { fences: verdicts, held: null, pieces }
}

// The reply as pieces, as its verdict draws it; a held reply is left before any
// figure is drawn. Given `fences`, a fence left out of them stays in the prose as
// written.
export const piecesOf = (reply: string, columns: number, ink: Ink = INK.either, fences?: readonly FenceBlock[], target: Target = 'terminal'): Piece[] | null => {
  const text = reply.replace(/\r\n?/g, '\n')
  const blocks = fences ?? fencesOf(text)
  if (blocks.length === 0 || heldOf(text, blocks) !== null) return null
  return verdictsOf(text, columns, ink, blocks, false, target).pieces
}
