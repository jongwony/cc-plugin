import { chosenOf, kindOf, layoutsOf, widthOf, type Layouts, type Segment } from './diagrams.ts'
import { INK, MAX_CELLS, mathOf, type Ink } from './math.ts'

// One pass over a reply: every ```mermaid and ```math fence, in order, with the
// prose between them kept as Markdown.

export type MathPicture = { rgba: string; width: number; height: number; columns: number; rows: number; tex: string }
export type Piece = { markdown: string } | { diagram: { lines: Segment[][] } } | { math: MathPicture }
export type FenceBlock = { lang: 'mermaid' | 'math'; start: number; end: number; source: string }
// Why a fence was or was not drawn: its kind (a mermaid diagram's header kind, or
// `math`), the figure it drew, or the reason it stays as written and, for a figure
// that drew too wide, its width in cells.
export type FenceVerdict = { kind: string; drawn: Piece } | { kind: string; reason: string; cells?: number }
// The reply's verdict: one per fence in order, and the pieces the reply is drawn as,
// null when the caller leaves the message untouched.
export type ReplyVerdict = { fences: FenceVerdict[]; pieces: Piece[] | null }

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

// Neither drawing depends on the room: a diagram's layouts are kept by source and
// chosen for the room after the lookup, and a formula is drawn once at the widest
// an Image takes; either one wider than the room keeps its fence.
const verdictOf = (block: FenceBlock, columns: number, ink: Ink): FenceVerdict => {
  const drawing = cachedDrawingOf(block, ink)
  if ('layouts' in drawing) {
    const kind = kindOf(block.source)
    const art = chosenOf(drawing.layouts, columns)
    if ('error' in art) return { kind, reason: art.error }
    const cells = widthOf(art.lines)
    return cells <= columns ? { kind, drawn: { diagram: { lines: art.lines } } } : { kind, reason: 'wider than the room', cells }
  }
  if ('error' in drawing.math) return { kind: 'math', reason: drawing.math.error }
  return drawing.math.columns <= columns
    ? { kind: 'math', drawn: { math: drawing.math } }
    : { kind: 'math', reason: 'wider than the room', cells: drawing.math.columns }
}

const cachedDrawingOf = (block: FenceBlock, ink: Ink): Drawing => {
  const key = (block.lang === 'mermaid' ? [block.lang, block.source] : [block.lang, ink.join(','), block.source]).join('\u0000')
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

const PROSE_UNHANDABLE = `the prose around the fences holds a control character or a run over ${MAX_MARKDOWN_CHARS} characters`
const handable = (markdown: string): boolean => markdown.length <= MAX_MARKDOWN_CHARS && DRAWABLE.test(markdown)

// The reply's verdict: markdown between the fences, a figure for each fence that
// draws; a fence that does not draw stays in the markdown as written, its reason in
// its verdict. The pieces are null when nothing draws, a piece cannot be handed to
// Markdown, or the reply holds a definition its pieces would lose, in which case the
// caller leaves the message to Claude Code untouched and every fence carries that
// reason. Those whole-reply checks run on the prose between the fences before any
// figure is drawn; `fences` takes the reply's fences already found.
export const verdictsOf = (reply: string, columns: number, ink: Ink = INK.either, fences?: readonly FenceBlock[]): ReplyVerdict => {
  const text = reply.replace(/\r\n?/g, '\n')
  const blocks = fences ?? fencesOf(text)
  const untouched = (reason: string): ReplyVerdict => ({ fences: blocks.map(b => ({ kind: b.lang === 'math' ? 'math' : kindOf(b.source), reason })), pieces: null })
  if (blocks.length === 0) return { fences: [], pieces: null }
  if (DEFINITION.test(text)) return untouched('the reply holds a link reference or footnote definition')
  let gap = 0
  for (const block of blocks) {
    if (!handable(text.slice(gap, block.start).trim())) return untouched(PROSE_UNHANDABLE)
    gap = block.end
  }
  if (!handable(text.slice(gap).trim())) return untouched(PROSE_UNHANDABLE)
  const verdicts = blocks.map(block => verdictOf(block, columns, ink))
  const pieces: Piece[] = []
  let pending = ''
  let cursor = 0
  blocks.forEach((block, i) => {
    const verdict = verdicts[i]!
    if (!('drawn' in verdict)) return
    pending += text.slice(cursor, block.start)
    pushMarkdown(pieces, pending)
    pieces.push(verdict.drawn)
    pending = ''
    cursor = block.end
  })
  pending += text.slice(cursor)
  pushMarkdown(pieces, pending)
  if (!verdicts.some(v => 'drawn' in v)) return { fences: verdicts, pieces: null }
  for (const p of pieces) if ('markdown' in p && !handable(p.markdown)) return untouched(PROSE_UNHANDABLE)
  return { fences: verdicts, pieces }
}

// The reply as pieces, as its verdict draws it.
export const piecesOf = (reply: string, columns: number, ink: Ink = INK.either, fences?: readonly FenceBlock[]): Piece[] | null =>
  verdictsOf(reply, columns, ink, fences).pieces
