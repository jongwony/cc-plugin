import { adaptor, texToSvg, type LiteNode } from './vendor/math/mathjax.js'

// Pure functions over ```math fences: TeX to MathJax's SVG lite DOM, its glyph
// outlines and rules filled into RGBA pixels, sized to a box of terminal cells.
// No `$`, so the tests drive these directly.

export type Ink = readonly [number, number, number]
export type MathArt = { rgba: Uint8Array; width: number; height: number; columns: number; rows: number }
export type MathRendered = MathArt | { error: string }

// the terminal cell the picture is sized against, in pixels: an assumption, since a
// mod cannot read the terminal's font metrics
export const CELL_PX = { width: 9, height: 18 } as const
// pixels per em, so a formula's letters stand about as tall as the transcript's
export const EM_PX = 16
export const MAX_TEX_CHARS = 2_000
// the Image element's bounds: 2048 pixels a side, 2 MiB of decoded pixels, 255 cells
const MAX_SIDE_PX = 2048
const MAX_BYTES = 2 * 1024 * 1024
const MAX_CELLS = 255

type Matrix = readonly [number, number, number, number, number, number]
type Point = readonly [number, number]

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]

const times = (p: Matrix, q: Matrix): Matrix => [
  p[0] * q[0] + p[2] * q[1],
  p[1] * q[0] + p[3] * q[1],
  p[0] * q[2] + p[2] * q[3],
  p[1] * q[2] + p[3] * q[3],
  p[0] * q[4] + p[2] * q[5] + p[4],
  p[1] * q[4] + p[3] * q[5] + p[5],
]

const at = (m: Matrix, x: number, y: number): Point => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]

// MathJax writes only translate and scale
const transformOf = (value: string | null | undefined): Matrix => {
  let m = IDENTITY
  for (const [, op, args] of (value ?? '').matchAll(/(translate|scale)\(([^)]*)\)/g)) {
    const n = args!.split(/[\s,]+/).filter(Boolean).map(Number)
    m = times(m, op === 'translate' ? [1, 0, 0, 1, n[0] ?? 0, n[1] ?? 0] : [n[0] ?? 1, 0, 0, n[1] ?? n[0] ?? 1, 0, 0])
  }
  return m
}

const QUAD_STEPS = 8
const CUBIC_STEPS = 10

// an SVG path's outline as closed rings of points, curves flattened to segments
export const ringsOf = (d: string): Point[][] => {
  const tokens = d.match(/[MLHVQTCSZmlhvqtcsz]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? []
  const rings: Point[][] = []
  let ring: Point[] = []
  let i = 0
  let command = ''
  let x = 0, y = 0, startX = 0, startY = 0, controlX = 0, controlY = 0
  let previous = ''
  const num = (): number => {
    const value = Number(tokens[i++])
    if (!Number.isFinite(value)) throw new Error('malformed path')
    return value
  }
  const quad = (x1: number, y1: number, x2: number, y2: number) => {
    for (let s = 1; s <= QUAD_STEPS; s++) {
      const t = s / QUAD_STEPS, u = 1 - t
      ring.push([u * u * x + 2 * u * t * x1 + t * t * x2, u * u * y + 2 * u * t * y1 + t * t * y2])
    }
  }
  const cubic = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) => {
    for (let s = 1; s <= CUBIC_STEPS; s++) {
      const t = s / CUBIC_STEPS, u = 1 - t
      ring.push([
        u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
        u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
      ])
    }
  }
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i]!)) command = tokens[i++]!
    const relative = command !== command.toUpperCase()
    const ox = relative ? x : 0, oy = relative ? y : 0
    switch (command.toUpperCase()) {
      case 'M':
        if (ring.length > 0) rings.push(ring)
        x = ox + num(); y = oy + num(); startX = x; startY = y
        ring = [[x, y]]
        command = relative ? 'l' : 'L'
        previous = 'M'
        break
      case 'L': x = ox + num(); y = oy + num(); ring.push([x, y]); previous = 'L'; break
      case 'H': x = ox + num(); ring.push([x, y]); previous = 'L'; break
      case 'V': y = oy + num(); ring.push([x, y]); previous = 'L'; break
      case 'Q': {
        const x1 = ox + num(), y1 = oy + num(), x2 = ox + num(), y2 = oy + num()
        quad(x1, y1, x2, y2)
        controlX = x1; controlY = y1; x = x2; y = y2; previous = 'Q'
        break
      }
      case 'T': {
        const x1 = previous === 'Q' ? 2 * x - controlX : x, y1 = previous === 'Q' ? 2 * y - controlY : y
        const x2 = ox + num(), y2 = oy + num()
        quad(x1, y1, x2, y2)
        controlX = x1; controlY = y1; x = x2; y = y2; previous = 'Q'
        break
      }
      case 'C': {
        const x1 = ox + num(), y1 = oy + num(), x2 = ox + num(), y2 = oy + num(), x3 = ox + num(), y3 = oy + num()
        cubic(x1, y1, x2, y2, x3, y3)
        controlX = x2; controlY = y2; x = x3; y = y3; previous = 'C'
        break
      }
      case 'S': {
        const x1 = previous === 'C' ? 2 * x - controlX : x, y1 = previous === 'C' ? 2 * y - controlY : y
        const x2 = ox + num(), y2 = oy + num(), x3 = ox + num(), y3 = oy + num()
        cubic(x1, y1, x2, y2, x3, y3)
        controlX = x2; controlY = y2; x = x3; y = y3; previous = 'C'
        break
      }
      case 'Z':
        if (ring.length > 0) rings.push(ring)
        ring = []
        x = startX; y = startY; previous = 'Z'
        break
      default:
        throw new Error(`path command ${command || tokens[i]}`)
    }
  }
  if (ring.length > 0) rings.push(ring)
  return rings
}

// the ink a theme reads: dark on a light theme, light on a dark one, and a middle
// grey that reads on either when the theme does not say (`auto` follows the terminal)
export const INK = { light: [0x26, 0x26, 0x26], dark: [0xe4, 0xe4, 0xe4], either: [0x8a, 0x93, 0x9e] } as const satisfies Record<string, Ink>

export const inkOf = (theme: unknown): Ink =>
  typeof theme === 'string' && theme.startsWith('light') ? INK.light : typeof theme === 'string' && theme.startsWith('dark') ? INK.dark : INK.either

const UNDRAWN = new Set(['text', 'use', 'image', 'foreignObject'])

// every filled outline under the root svg, in its coordinates; throws on an error
// node or an element the fill cannot draw, so the fence stays
const outlinesOf = (svg: LiteNode): Point[][] => {
  const rings: Point[][] = []
  const number = (node: LiteNode, name: string): number => Number(adaptor.getAttribute(node, name) ?? 0)
  const walk = (node: LiteNode, outer: Matrix) => {
    const kind = adaptor.kind(node)
    if (kind === '#text' || kind === '#comment') return
    if (UNDRAWN.has(kind)) throw new Error(`cannot fill <${kind}>`)
    if (adaptor.getAttribute(node, 'data-mml-node') === 'merror') throw new Error('TeX error')
    let m = times(outer, transformOf(adaptor.getAttribute(node, 'transform')))
    if (kind === 'svg' && node !== svg) m = times(m, [1, 0, 0, 1, number(node, 'x'), number(node, 'y')])
    if (kind === 'path') for (const ring of ringsOf(adaptor.getAttribute(node, 'd') ?? '')) rings.push(ring.map(([px, py]) => at(m, px, py)))
    else if (kind === 'rect') {
      const x = number(node, 'x'), y = number(node, 'y'), w = number(node, 'width'), h = number(node, 'height')
      rings.push(([[x, y], [x + w, y], [x + w, y + h], [x, y + h]] as const).map(([px, py]) => at(m, px, py)))
    }
    for (const child of adaptor.childNodes(node)) walk(child, m)
  }
  walk(svg, IDENTITY)
  return rings
}

const SUBSAMPLES = 4

// nonzero-winding scanline fill with SUBSAMPLES rows per pixel and exact horizontal
// coverage; the rings are already in pixels
const filled = (rings: readonly (readonly Point[])[], width: number, height: number, ink: Ink): Uint8Array => {
  const cover = new Float32Array(width * height)
  const edges: [number, number, number, number, number][] = []
  for (const ring of rings)
    for (let k = 0; k < ring.length; k++) {
      const a = ring[k]!, b = ring[(k + 1) % ring.length]!
      if (a[1] === b[1]) continue
      edges.push(a[1] < b[1] ? [a[0], a[1], b[0], b[1], 1] : [b[0], b[1], a[0], a[1], -1])
    }
  const crossings: [number, number][] = []
  for (let row = 0; row < height; row++)
    for (let s = 0; s < SUBSAMPLES; s++) {
      const sy = row + (s + 0.5) / SUBSAMPLES
      crossings.length = 0
      for (const [x0, y0, x1, y1, dir] of edges) if (sy >= y0 && sy < y1) crossings.push([x0 + ((sy - y0) * (x1 - x0)) / (y1 - y0), dir])
      if (crossings.length === 0) continue
      crossings.sort((p, q) => p[0] - q[0])
      let winding = 0
      for (let k = 0; k < crossings.length - 1; k++) {
        winding += crossings[k]![1]
        if (winding === 0) continue
        const left = Math.max(0, crossings[k]![0]), right = Math.min(width, crossings[k + 1]![0])
        if (right <= left) continue
        const li = Math.floor(left), ri = Math.floor(right)
        const base = row * width
        if (li === ri) {
          cover[base + li]! += (right - left) / SUBSAMPLES
          continue
        }
        cover[base + li]! += (li + 1 - left) / SUBSAMPLES
        for (let c = li + 1; c < ri; c++) cover[base + c]! += 1 / SUBSAMPLES
        if (ri < width) cover[base + ri]! += (right - ri) / SUBSAMPLES
      }
    }
  const rgba = new Uint8Array(width * height * 4)
  for (let p = 0; p < width * height; p++) {
    rgba[p * 4] = ink[0]
    rgba[p * 4 + 1] = ink[1]
    rgba[p * 4 + 2] = ink[2]
    rgba[p * 4 + 3] = Math.round(Math.min(1, cover[p]!) * 255)
  }
  return rgba
}

// a fence holding a display wrapper as well keeps only the TeX inside it
const unwrapped = (tex: string): string => {
  const t = tex.trim()
  const wrapped = /^\$\$([\s\S]*)\$\$$/.exec(t) ?? /^\\\[([\s\S]*)\\\]$/.exec(t)
  return (wrapped ? wrapped[1]! : t).trim()
}

// The formula as pixels on a box of whole cells, the box no wider than `columns`:
// the bitmap is padded to columns × rows cells of CELL_PX so the terminal scales it
// without distortion, the formula at the left and centred top to bottom.
export const mathOf = (source: string, columns: number, ink: Ink): MathRendered => {
  const tex = unwrapped(source)
  if (tex === '') return { error: 'nothing to draw' }
  if (tex.length > MAX_TEX_CHARS) return { error: `too big to draw (${tex.length} characters)` }
  try {
    const svg = texToSvg(tex)
    const box = (adaptor.getAttribute(svg, 'viewBox') ?? '').split(/\s+/).map(Number)
    if (box.length !== 4 || box.some(n => !Number.isFinite(n)) || box[2]! <= 0 || box[3]! <= 0) return { error: 'no picture' }
    const [vx, vy, vw, vh] = box as [number, number, number, number]
    const scale = EM_PX / 1000
    const inkWidth = vw * scale, inkHeight = vh * scale
    const cols = Math.ceil(inkWidth / CELL_PX.width)
    const rows = Math.ceil(inkHeight / CELL_PX.height)
    if (cols > Math.min(MAX_CELLS, columns)) return { error: `${cols} columns wide` }
    if (rows > MAX_CELLS) return { error: `${rows} rows tall` }
    const width = cols * CELL_PX.width, height = rows * CELL_PX.height
    if (width > MAX_SIDE_PX || height > MAX_SIDE_PX || width * height * 4 > MAX_BYTES) return { error: `${width}×${height} pixels` }
    const top = (height - inkHeight) / 2
    const rings = outlinesOf(svg).map(ring => ring.map(([x, y]): Point => [(x - vx) * scale, (y - vy) * scale + top]))
    return { rgba: filled(rings, width, height, ink), width, height, columns: cols, rows }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}
