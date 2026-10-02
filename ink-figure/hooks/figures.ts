import { drawn, fitLines, mermaidBlocksOf, type Fitted } from './diagrams.ts'

// One pass over a reply: every mermaid fence, in order, with the prose between
// them kept as Markdown.

export type Piece = { markdown: string } | { diagram: Fitted }

// Markdown element limit per chunk
export const MAX_MARKDOWN_CHARS = 10_000

type Found = { start: number; end: number; piece: () => Piece | null }

// Markdown takes tab and newline as its only control characters
const DRAWABLE = /^[^\x00-\x08\x0b-\x1f\x7f]*$/

const pushMarkdown = (pieces: Piece[], text: string) => {
  if (text.trim() !== '') pieces.push({ markdown: text.replace(/^\n+/, '').replace(/\n+$/, '') })
}

// The reply as pieces: markdown between the fences, a figure for each fence that
// draws; a fence that does not draw stays in the markdown as written. Null when
// nothing draws or a piece cannot be handed to Markdown, in which case the caller
// leaves the message to Claude Code untouched.
export const piecesOf = (text: string, columns: number): Piece[] | null => {
  const found: Found[] = [
    ...mermaidBlocksOf(text).map(b => ({
      start: b.start,
      end: b.end,
      piece: () => {
        const art = drawn(b.source, columns)
        return 'lines' in art ? { diagram: fitLines(art.lines, columns) } : null
      },
    })),
  ].sort((a, b) => a.start - b.start)

  const pieces: Piece[] = []
  let pending = ''
  let cursor = 0
  let figures = 0
  for (const f of found) {
    if (f.start < cursor) continue
    const piece = f.piece()
    if (!piece) continue
    pending += text.slice(cursor, f.start)
    pushMarkdown(pieces, pending)
    pieces.push(piece)
    pending = ''
    cursor = f.end
    figures++
  }
  pending += text.slice(cursor)
  pushMarkdown(pieces, pending)
  if (figures === 0) return null
  for (const p of pieces)
    if ('markdown' in p && (p.markdown.length > MAX_MARKDOWN_CHARS || !DRAWABLE.test(p.markdown))) return null
  return pieces
}
