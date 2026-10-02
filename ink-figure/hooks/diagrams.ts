import { renderMermaidAscii } from './vendor/mermaid-ascii.js'

// Pure functions over mermaid blocks: finding them in a reply's markdown, drawing
// them as role-tagged box art with East Asian labels measured in screen cells, and
// fitting the art to a width. No `$`, so the tests drive these directly.
// Fence detection, kind table, LR flip, pseudo-state trim and the sentinel-colour
// role recovery are adapted from claude-mermaid (Gal Elmalah, MIT).

export type MermaidBlock = { start: number; end: number; source: string }
export type Role = 'text' | 'border' | 'line' | 'arrow' | 'corner' | 'junction' | 'accent'
export type Segment = { text: string; role: Role | null }
export type Rendered = { lines: Segment[][] } | { error: string }
export type Fitted = { lines: Segment[][]; width: number; overflow: number }

export const SPACING = { paddingX: 3, paddingY: 1, boxBorderPadding: 1 } as const

const FENCE_LINE = /^[ \t]*(`{3,}|~{3,})(.*)$/
const MERMAID_INFO = /^[ \t]*mermaid(?![\w-])/i

// Fenced code blocks as CommonMark closes them: a fence closes on the same
// character, at least as long, with nothing after it. Only a mermaid fence that
// opens while no other fence is open is a figure; one inside another block is
// that block's text.
export const mermaidBlocksOf = (text: string): MermaidBlock[] => {
  const blocks: MermaidBlock[] = []
  let open: { mark: string; start: number; body: number; mermaid: boolean } | null = null
  let at = 0
  for (const line of text.split('\n')) {
    const next = at + line.length + 1
    const fence = FENCE_LINE.exec(line)
    if (open === null) {
      if (fence && !(fence[1]!.startsWith('`') && fence[2]!.includes('`')))
        open = { mark: fence[1]!, start: at, body: next, mermaid: MERMAID_INFO.test(fence[2]!) }
    } else if (fence && fence[1]![0] === open.mark[0] && fence[1]!.length >= open.mark.length && fence[2]!.trim() === '') {
      const source = text.slice(open.body, Math.max(open.body, at - 1)).replace(/\r\n?/g, '\n').trim()
      if (open.mermaid && source !== '') blocks.push({ start: open.start, end: at + line.length, source })
      open = null
    }
    at = next
  }
  return blocks
}

const KINDS: [RegExp, string][] = [
  [/^(flowchart|graph)\b/i, 'flowchart'],
  [/^sequenceDiagram/i, 'sequence'],
  [/^classDiagram/i, 'class'],
  [/^stateDiagram/i, 'state'],
  [/^erDiagram/i, 'er'],
]

export const DRAWN_KINDS: ReadonlySet<string> = new Set(KINDS.map(([, kind]) => kind))

const headerOf = (source: string): string => {
  const lines = source.split('\n').map(line => line.trim())
  let i = 0
  if (lines[0] === '---') {
    i = lines.indexOf('---', 1) + 1
    if (i === 0) i = lines.length
  }
  return lines.slice(i).find(line => line !== '' && !line.startsWith('%%')) ?? ''
}

export const kindOf = (source: string): string => KINDS.find(([pattern]) => pattern.test(headerOf(source)))?.[1] ?? 'diagram'

export const MAX_SOURCE_CHARS = 12_000

export const withoutPseudoStates = (source: string): string => {
  if (kindOf(source) !== 'state') return source
  const kept = source.split('\n').filter(line => !line.includes('[*]'))
  return kept.some(line => line.includes('-->')) ? kept.join('\n') : source
}

export const leftToRightOf = (source: string): string | null => {
  const kind = kindOf(source)
  if (kind === 'flowchart') {
    const header = /^(\s*(?:flowchart|graph))(?:\s+(TD|TB|BT|LR|RL))?\b([^\n]*)$/im.exec(source)
    if (!header || header[2] === 'LR' || header[2] === 'RL') return null
    return source.replace(header[0], `${header[1]} LR${header[3]}`)
  }
  if (kind === 'state') {
    if (/^\s*direction\s+/im.test(source)) return null
    return source.replace(/^([^\n]*stateDiagram[^\n]*)$/im, '$1\n  direction LR')
  }
  return null
}

// East Asian Wide and Fullwidth ranges (UAX #11), the ones labels meet in practice,
// and emoji drawn as pictures by default. Ambiguous-width characters, box-drawing
// included, stay one cell.
const EMOJI = /\p{Emoji_Presentation}/u
export const isWide = (cp: number): boolean =>
  (cp >= 0x1100 && cp <= 0x115f) ||
  (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) ||
  (cp >= 0xac00 && cp <= 0xd7a3) ||
  (cp >= 0xf900 && cp <= 0xfaff) ||
  (cp >= 0xfe30 && cp <= 0xfe4f) ||
  (cp >= 0xff00 && cp <= 0xff60) ||
  (cp >= 0xffe0 && cp <= 0xffe6) ||
  (cp >= 0x20000 && cp <= 0x3fffd) ||
  EMOJI.test(String.fromCodePoint(cp))

export const cellsOf = (cp: number): number => (isWide(cp) ? 2 : 1)

export const displayWidth = (s: string): number => {
  let n = 0
  for (const c of s) n += cellsOf(c.codePointAt(0)!)
  return n
}

// The renderer lays out one UTF-16 unit per grid cell, so a code point takes as
// many cells as it has units. A wide character in the Basic Multilingual Plane
// goes in followed by a private-use placeholder, so the layout counts it as the
// two cells the terminal gives it; the placeholder comes out of the art again.
// An astral character already has two units. A code point the terminal draws in
// fewer cells than its units — a combining mark, a joiner, a modifier or flag
// half that merges with its neighbour — cannot be laid out, and neither can a
// source that already holds the placeholder.
const CELL = '\uE000'
const UNPLACEABLE = /[\p{M}\p{Cf}\u1160-\u11ff\u{1f1e6}-\u{1f1ff}\u{1f3fb}-\u{1f3ff}\uE000]/u
const widened = (source: string): string => {
  let out = ''
  for (const c of source) {
    const cp = c.codePointAt(0)!
    out += cp <= 0xffff && isWide(cp) ? c + CELL : c
  }
  return out
}

const ROLES: readonly Role[] = ['text', 'border', 'line', 'arrow', 'corner', 'junction', 'accent']
const sentinel = (role: Role) => `#00000${ROLES.indexOf(role) + 1}`
const ROLE_THEME = {
  fg: sentinel('text'),
  border: sentinel('border'),
  line: sentinel('line'),
  arrow: sentinel('arrow'),
  corner: sentinel('corner'),
  junction: sentinel('junction'),
  accent: sentinel('accent'),
  bg: '#000000',
}

// the renderer emits colour only as SGR escapes; a theme of sentinel colours turns
// each escape back into the role it stood for, and no escape leaves this module
const SGR = /\x1b\[([0-9;]*)m/g
const SENTINEL_SGR = /^38;2;0;0;(\d)$/

const segmentsOf = (line: string): Segment[] => {
  const out: Segment[] = []
  const push = (text: string, role: Role | null) => {
    text = text.replaceAll(CELL, '')
    if (text === '') return
    const last = out[out.length - 1]
    if (last && last.role === role) last.text += text
    else out.push({ text, role })
  }
  let role: Role | null = null
  let cursor = 0
  for (const match of line.matchAll(SGR)) {
    const at = match.index ?? 0
    push(line.slice(cursor, at), role)
    const params = match[1] ?? ''
    const found = SENTINEL_SGR.exec(params)
    role = found ? (ROLES[Number(found[1]) - 1] ?? null) : params === '0' || params === '' ? null : role
    cursor = at + match[0].length
  }
  push(line.slice(cursor), role)
  // spaces between the words of one label keep the label one span
  const joined: Segment[] = []
  for (const seg of out) {
    const prev = joined[joined.length - 1]
    const before = joined[joined.length - 2]
    if (seg.role === 'text' && prev && prev.role === null && /^ +$/.test(prev.text) && before?.role === 'text') {
      joined.pop()
      before.text += prev.text + seg.text
    } else joined.push({ ...seg })
  }
  return joined
}

export const plainOf = (line: readonly Segment[]): string => line.map(s => s.text).join('')

const trimEnd = (line: Segment[]): Segment[] => {
  const out = line.map(s => ({ ...s }))
  while (out.length > 0) {
    const last = out[out.length - 1]!
    last.text = last.text.replace(/ +$/, '')
    if (last.text !== '') break
    out.pop()
  }
  return out
}

export const renderOf = (source: string, useAscii = false): Rendered => {
  const kind = kindOf(source)
  if (!DRAWN_KINDS.has(kind)) return { error: `${kind} diagrams are not drawn` }
  if (source.length > MAX_SOURCE_CHARS) return { error: `too big to draw (${source.length} characters)` }
  const composed = source.normalize('NFC')
  const unplaceable = UNPLACEABLE.exec(composed)
  if (unplaceable) return { error: `U+${unplaceable[0].codePointAt(0)!.toString(16).toUpperCase()} cannot be laid out in cells` }
  try {
    const art = renderMermaidAscii(widened(composed), { useAscii, ...SPACING, colorMode: 'truecolor', theme: ROLE_THEME })
    const lines = art.split('\n').map(line => trimEnd(segmentsOf(line)))
    while (lines.length > 0 && lines[lines.length - 1]!.length === 0) lines.pop()
    while (lines.length > 0 && lines[0]!.length === 0) lines.shift()
    return lines.length === 0 || lines.every(l => plainOf(l).trim() === '') ? { error: 'nothing to draw' } : { lines }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export const widthOf = (lines: readonly (readonly Segment[])[]): number =>
  lines.reduce((max, line) => Math.max(max, displayWidth(plainOf(line))), 0)

const tokensOf = (lines: readonly (readonly Segment[])[]): Map<string, number> => {
  const out = new Map<string, number>()
  for (const line of lines) for (const token of plainOf(line).match(/[\p{L}\p{N}_+#-]+/gu) ?? []) out.set(token, (out.get(token) ?? 0) + 1)
  return out
}

// the sideways layout wins when every word of the original survives and it fits,
// or is at least no wider than the original
export const pickLayout = (base: Rendered, sideways: Rendered, columns: number): Rendered => {
  if (!('lines' in base) || !('lines' in sideways)) return base
  const have = tokensOf(sideways.lines)
  for (const [token, count] of tokensOf(base.lines)) if ((have.get(token) ?? 0) < count) return base
  const width = widthOf(sideways.lines)
  return width <= columns || width <= widthOf(base.lines) ? sideways : base
}

// lines wider than `columns` are cut at a cell boundary with an ellipsis
export const fitLines = (lines: readonly (readonly Segment[])[], columns: number): Fitted => {
  const width = widthOf(lines)
  const room = Math.max(1, columns)
  if (width <= room) return { lines: lines.map(line => [...line]), width, overflow: 0 }
  const fitted = lines.map(line => {
    if (displayWidth(plainOf(line)) <= room) return [...line]
    const out: Segment[] = []
    let left = room - 1
    for (const segment of line) {
      let text = ''
      for (const c of segment.text) {
        const w = cellsOf(c.codePointAt(0)!)
        if (w > left) break
        text += c
        left -= w
      }
      if (text !== '') out.push({ text, role: segment.role })
      if (text.length < segment.text.length) break
    }
    out.push({ text: '…', role: null })
    return out
  })
  return { lines: fitted, width, overflow: width - room }
}

export const drawn = (source: string, columns: number): Rendered => {
  const prepared = withoutPseudoStates(source)
  const base = renderOf(prepared)
  const sideways = leftToRightOf(prepared)
  return sideways ? pickLayout(base, renderOf(sideways), columns) : base
}
