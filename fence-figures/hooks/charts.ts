// Pure chart part of fence-figures: find ```heatmap / ```bars fences in a reply,
// parse their small DSL, and lay each out as Raster cells plus the text that
// sits beside them. No mods API here, so the tests can call it directly.
//
// Two rules from the output style this serves shape every drawing:
// a drawn length answers to a measured quantity, and every drawing states the
// quantity one cell stands for — so lengths round to whole cells and nothing
// finer than a cell is implied.

export type FenceKind = 'heatmap' | 'bars'

export type Fence = {
  kind: FenceKind
  start: number
  end: number
  body: string
}

export type BarsChart = {
  kind: 'bars'
  labels: string[]
  labelWidth: number
  values: string[]
  valueWidth: number
  columns: number
  rows: number
  cells: string
  scale: string
}

export type HeatmapChart = {
  kind: 'heatmap'
  labels: string[]
  labelWidth: number
  cellWidth: number
  header: string
  key: string
  columns: number
  rows: number
  cells: string
  legendColumns: number
  legendCells: string
  scale: string
}

export type Chart = BarsChart | HeatmapChart

// Raster limits from the element's contract
export const MAX_RASTER_COLUMNS = 512
export const MAX_RASTER_ROWS = 256
// Markdown element limit per chunk
export const MAX_MARKDOWN_CHARS = 10_000
// Labels wider than this are truncated by their Text, not by the cells
export const MAX_LABEL_WIDTH = 24
// Longest bar drawn, so a short series is not stretched across a wide terminal
export const MAX_BAR_CELLS = 60

const DEFAULT_COLOR = 0x01000000
const FULL_BLOCK = 0x2588
const SPACE = 0x20
const BAR_COLOR = 0x4c78a8
// viridis, eight stops: ordered in lightness and readable with colour-vision deficiency
export const SHADES = [0x440154, 0x46327e, 0x365c8d, 0x277f8e, 0x1fa187, 0x4ac16d, 0xa0da39, 0xfde725]

const FENCE = /^([ \t]*)(`{3,}|~{3,})[ \t]*(heatmap|bars)[ \t]*\n([\s\S]*?)\n[ \t]*\2[ \t]*$/gim
const NUMBER = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i
const UNIT = /^unit[ \t]*:[ \t]*(.*)$/i

export const fencesOf = (text: string): Fence[] => {
  const out: Fence[] = []
  for (const m of text.matchAll(FENCE)) {
    const indent = m[1]
    const body = m[4]
      .split('\n')
      .map(line => (line.startsWith(indent) ? line.slice(indent.length) : line))
      .join('\n')
    out.push({ kind: m[3].toLowerCase() as FenceKind, start: m.index!, end: m.index! + m[0].length, body })
  }
  return out
}

// Terminal width of a string: East Asian wide and fullwidth forms take two
// columns, combining marks none. Enough for labels; cells never hold these.
export const displayWidth = (s: string): number => {
  let w = 0
  for (const ch of s) {
    const c = ch.codePointAt(0)!
    if ((c >= 0x0300 && c <= 0x036f) || c === 0x200d || (c >= 0xfe00 && c <= 0xfe0f)) continue
    w += isWide(c) ? 2 : 1
  }
  return w
}

const isWide = (c: number): boolean =>
  (c >= 0x1100 && c <= 0x115f) ||
  (c >= 0x2e80 && c <= 0x303e) ||
  (c >= 0x3041 && c <= 0x33ff) ||
  (c >= 0x3400 && c <= 0x4dbf) ||
  (c >= 0x4e00 && c <= 0x9fff) ||
  (c >= 0xa960 && c <= 0xa97f) ||
  (c >= 0xac00 && c <= 0xd7a3) ||
  (c >= 0xf900 && c <= 0xfaff) ||
  (c >= 0xfe30 && c <= 0xfe4f) ||
  (c >= 0xff00 && c <= 0xff60) ||
  (c >= 0xffe0 && c <= 0xffe6) ||
  (c >= 0x1f300 && c <= 0x1faff) ||
  (c >= 0x20000 && c <= 0x3fffd)

// Smallest 1/2/2.5/5 × 10^k at or above `raw`
export const niceStep = (raw: number): number => {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1
  const exp = Math.pow(10, Math.floor(Math.log10(raw)))
  for (const m of [1, 2, 2.5, 5, 10]) if (m * exp >= raw * (1 - 1e-9)) return m * exp
  return 10 * exp
}

const nextNice = (step: number): number => niceStep(step * 1.000001 + Number.EPSILON)

export const fmt = (x: number): string => {
  const n = Number(x.toPrecision(4))
  return Object.is(n, -0) ? '0' : String(n)
}

const withUnit = (s: string, unit: string) => (unit ? `${s} ${unit}` : s)

// Standard padded base64 of little-endian u32 [codePoint, fg, bg] triplets
export const packCells = (triplets: readonly number[]): string => {
  const bytes = new Uint8Array(triplets.length * 4)
  const view = new DataView(bytes.buffer)
  triplets.forEach((n, i) => view.setUint32(i * 4, n >>> 0, true))
  return base64(bytes)
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const base64 = (bytes: Uint8Array): string => {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0
    const n = (a << 16) | (b << 8) | c
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63]
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '='
    out += i + 2 < bytes.length ? B64[n & 63] : '='
  }
  return out
}

const parseNumber = (tok: string): number | null => (NUMBER.test(tok) ? Number(tok) : null)

const contentLines = (body: string) => body.split('\n').map(l => l.trim()).filter(l => l !== '')

// ```bars
// unit: GB
// label: value
export const barsOf = (body: string, columns: number): BarsChart | null => {
  let unit = ''
  const labels: string[] = []
  const nums: number[] = []
  for (const line of contentLines(body)) {
    const u = UNIT.exec(line)
    if (u) {
      unit = u[1].trim()
      continue
    }
    const at = line.lastIndexOf(':')
    if (at <= 0) return null
    const label = line.slice(0, at).trim()
    const v = parseNumber(line.slice(at + 1).trim())
    if (!label || v === null || v < 0) return null
    labels.push(label)
    nums.push(v)
  }
  if (labels.length === 0 || labels.length > MAX_RASTER_ROWS) return null
  const labelWidth = Math.min(MAX_LABEL_WIDTH, Math.max(...labels.map(displayWidth)))
  const values = nums.map(v => withUnit(fmt(v), unit))
  const valueWidth = Math.max(...values.map(displayWidth))
  const room = Math.min(MAX_BAR_CELLS, MAX_RASTER_COLUMNS, columns - labelWidth - valueWidth - 2)
  if (room < 4) return null
  const max = Math.max(...nums)
  const step = niceStep(max / room)
  const lengths = nums.map(v => Math.round(v / step))
  const width = Math.max(1, ...lengths)
  const triplets: number[] = []
  for (const len of lengths)
    for (let x = 0; x < width; x++)
      x < len ? triplets.push(FULL_BLOCK, BAR_COLOR, DEFAULT_COLOR) : triplets.push(SPACE, DEFAULT_COLOR, DEFAULT_COLOR)
  return {
    kind: 'bars',
    labels,
    labelWidth,
    values,
    valueWidth,
    columns: width,
    rows: labels.length,
    cells: packCells(triplets),
    scale: `1 cell ~ ${withUnit(fmt(step), unit)} · lengths rounded to whole cells`,
  }
}

const splitRow = (line: string): string[] => {
  if (!line.includes('|')) return line.split(/\s+/)
  const parts = line.split('|').map(s => s.trim())
  if (parts[0] === '') parts.shift()
  if (parts.length > 0 && parts[parts.length - 1] === '') parts.pop()
  return parts
}

type Grid = { names: string[]; labels: string[]; values: (number | null)[][] }

// Each row ends in `n` value tokens; whatever precedes them is the label
const gridOf = (names: string[], rows: string[][], piped: boolean): Grid | null => {
  const n = names.length
  if (n === 0) return null
  const labels: string[] = []
  const values: (number | null)[][] = []
  for (const toks of rows) {
    if (toks.length < n + 1 || (piped && toks.length !== n + 1)) return null
    const label = toks.slice(0, toks.length - n).join(' ').trim()
    const row: (number | null)[] = []
    for (const tok of toks.slice(toks.length - n)) {
      if (tok === '-') {
        row.push(null)
        continue
      }
      const v = parseNumber(tok)
      if (v === null) return null
      row.push(v)
    }
    if (!label) return null
    labels.push(label)
    values.push(row)
  }
  return { names, labels, values }
}

// ```heatmap
// unit: ms
//         col1 col2 col3      (or a | piped | header |)
// row-a   1    2    3
export const heatmapOf = (body: string, columns: number): HeatmapChart | null => {
  let unit = ''
  const lines: string[] = []
  for (const line of contentLines(body)) {
    const u = UNIT.exec(line)
    if (u) unit = u[1].trim()
    else if (!/^\|?[\s|:-]+\|?$/.test(line) || !line.includes('-')) lines.push(line) // drop a markdown |---| rule
  }
  if (lines.length < 2) return null
  const piped = lines.some(l => l.includes('|'))
  const header = splitRow(lines[0])
  const rows = lines.slice(1).map(splitRow)
  // the header may or may not carry a corner cell above the labels
  const grid = gridOf(header, rows, piped) ?? gridOf(header.slice(1), rows, piped)
  if (!grid || grid.labels.length > MAX_RASTER_ROWS) return null
  const n = grid.names.length
  const cellWidth = n < 10 ? 2 : 3
  const labelWidth = Math.min(MAX_LABEL_WIDTH, Math.max(...grid.labels.map(displayWidth)))
  const width = n * cellWidth
  if (width > MAX_RASTER_COLUMNS || width > columns - labelWidth - 1) return null
  const finite = grid.values.flat().filter((v): v is number => v !== null)
  if (finite.length === 0) return null
  const min = Math.min(...finite)
  const max = Math.max(...finite)
  let step = niceStep((max - min) / SHADES.length || Math.abs(max) || 1)
  let lo = Math.floor(min / step) * step
  let count = Math.floor((max - lo) / step + 1e-9) + 1
  while (count > SHADES.length) {
    step = nextNice(step)
    lo = Math.floor(min / step) * step
    count = Math.floor((max - lo) / step + 1e-9) + 1
  }
  const colorOf = (i: number) => SHADES[count === 1 ? SHADES.length - 1 : Math.round((i * (SHADES.length - 1)) / (count - 1))]
  const shadeOf = (v: number) => Math.min(count - 1, Math.max(0, Math.floor((v - lo) / step + 1e-9)))
  const triplets: number[] = []
  for (const row of grid.values)
    for (const v of row)
      for (let k = 0; k < cellWidth; k++)
        v === null ? triplets.push(SPACE, DEFAULT_COLOR, DEFAULT_COLOR) : triplets.push(FULL_BLOCK, colorOf(shadeOf(v)), DEFAULT_COLOR)
  const legend: number[] = []
  for (let i = 0; i < count; i++) for (let k = 0; k < 2; k++) legend.push(FULL_BLOCK, colorOf(i), DEFAULT_COLOR)
  const hi = lo + count * step
  return {
    kind: 'heatmap',
    labels: grid.labels,
    labelWidth,
    cellWidth,
    header: grid.names.map((_, i) => String(i + 1).padEnd(cellWidth)).join(''),
    key: 'columns: ' + grid.names.map((name, i) => `${i + 1} ${name}`).join(' · '),
    columns: width,
    rows: grid.labels.length,
    cells: packCells(triplets),
    legendColumns: count * 2,
    legendCells: packCells(legend),
    scale: `1 shade ~ ${withUnit(fmt(step), unit)} · ${fmt(lo)} to ${withUnit(fmt(hi), unit)}${count === 1 ? '' : `, ${count} shades`}${finite.length < grid.values.flat().length ? ' · blank = no value' : ''}`,
  }
}

export const chartOf = (fence: Fence, columns: number): Chart | null =>
  fence.kind === 'bars' ? barsOf(fence.body, columns) : heatmapOf(fence.body, columns)
