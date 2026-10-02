import { drawn, fitLines, type Fitted } from './diagrams.ts'
import { INK, mathOf, type Ink } from './math.ts'

// One pass over a reply: every ```mermaid and ```math fence, in order, with the
// prose between them kept as Markdown.

export type MathPicture = { rgba: string; width: number; height: number; columns: number; rows: number; tex: string }
export type Piece = { markdown: string } | { diagram: Fitted } | { math: MathPicture }
export type FenceBlock = { lang: 'mermaid' | 'math'; start: number; end: number; source: string }

// Markdown element limit per chunk
export const MAX_MARKDOWN_CHARS = 10_000

// Markdown takes tab and newline as its only control characters
const DRAWABLE = /^[^\x00-\x08\x0b-\x1f\x7f]*$/
// a link reference or footnote definition, which applies across the whole reply
const DEFINITION = /^ {0,3}\[[^\]\n]+\]:[ \t]*\S/m

const FENCE_LINE = /^ {0,3}(`{3,}|~{3,})(.*)$/
const LANG = /^[ \t]*(mermaid|math)(?![\w-])/i

// Fenced code blocks as CommonMark reads them: a fence line is indented at most
// three spaces, and closes on the same character, at least as long, with nothing
// after it. Only a mermaid or math fence that opens while no other fence is open is
// a figure; one inside another block is that block's text.
export const fencesOf = (text: string): FenceBlock[] => {
  const blocks: FenceBlock[] = []
  let open: { mark: string; start: number; body: number; lang: FenceBlock['lang'] | null } | null = null
  let at = 0
  for (const line of text.split('\n')) {
    const next = at + line.length + 1
    const fence = FENCE_LINE.exec(line)
    if (open === null) {
      if (fence && !(fence[1]!.startsWith('`') && fence[2]!.includes('`'))) {
        const lang = LANG.exec(fence[2]!)?.[1]?.toLowerCase() as FenceBlock['lang'] | undefined
        open = { mark: fence[1]!, start: at, body: next, lang: lang ?? null }
      }
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
const figures = new Map<string, { piece: Piece | null; bytes: number }>()
let cachedBytes = 0

const figureOf = (block: FenceBlock, columns: number, ink: Ink): Piece | null => {
  const key = [block.lang, columns, block.lang === 'math' ? ink.join(',') : '', block.source].join('\u0000')
  const hit = figures.get(key)
  if (hit) {
    figures.delete(key)
    figures.set(key, hit)
    return hit.piece
  }
  let piece: Piece | null = null
  if (block.lang === 'mermaid') {
    const art = drawn(block.source, columns)
    if ('lines' in art) piece = { diagram: fitLines(art.lines, columns) }
  } else {
    const art = mathOf(block.source, columns, ink)
    if ('rgba' in art) piece = { math: { ...art, rgba: art.rgba.toBase64(), tex: block.source } }
  }
  const bytes = piece && 'math' in piece ? piece.math.rgba.length : 0
  figures.set(key, { piece, bytes })
  cachedBytes += bytes
  while (figures.size > CACHE_LIMIT || cachedBytes > CACHE_BYTES) {
    const [oldest, entry] = figures.entries().next().value!
    figures.delete(oldest)
    cachedBytes -= entry.bytes
  }
  return piece
}

const pushMarkdown = (pieces: Piece[], text: string) => {
  if (text.trim() !== '') pieces.push({ markdown: text.replace(/^\n+/, '').replace(/\n+$/, '') })
}

// The reply as pieces: markdown between the fences, a figure for each fence that
// draws; a fence that does not draw stays in the markdown as written. Null when
// nothing draws, a piece cannot be handed to Markdown, or the reply holds a
// definition its pieces would lose, in which case the caller leaves the message to
// Claude Code untouched.
export const piecesOf = (reply: string, columns: number, ink: Ink = INK.either): Piece[] | null => {
  const text = reply.replace(/\r\n?/g, '\n')
  const pieces: Piece[] = []
  let pending = ''
  let cursor = 0
  let drawnCount = 0
  for (const block of fencesOf(text)) {
    const piece = figureOf(block, columns, ink)
    if (!piece) continue
    pending += text.slice(cursor, block.start)
    pushMarkdown(pieces, pending)
    pieces.push(piece)
    pending = ''
    cursor = block.end
    drawnCount++
  }
  pending += text.slice(cursor)
  pushMarkdown(pieces, pending)
  if (drawnCount === 0 || DEFINITION.test(text)) return null
  for (const p of pieces)
    if ('markdown' in p && (p.markdown.length > MAX_MARKDOWN_CHARS || !DRAWABLE.test(p.markdown))) return null
  return pieces
}
