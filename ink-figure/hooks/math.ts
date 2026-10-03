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
export const MAX_CELLS = 255

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

// translate, scale and rotate, the operations MathJax writes; any other throws
const transformOf = (value: string | null | undefined): Matrix => {
  let m = IDENTITY
  const text = value ?? ''
  if (text.replace(/(translate|scale|rotate)\([^)]*\)/g, '').trim() !== '') throw new Error(`transform ${text}`)
  for (const [, op, args] of text.matchAll(/(translate|scale|rotate)\(([^)]*)\)/g)) {
    const n = args!.split(/[\s,]+/).filter(Boolean).map(Number)
    if (n.some(v => !Number.isFinite(v))) throw new Error(`transform ${text}`)
    if (op === 'translate') m = times(m, [1, 0, 0, 1, n[0] ?? 0, n[1] ?? 0])
    else if (op === 'scale') m = times(m, [n[0] ?? 1, 0, 0, n[1] ?? n[0] ?? 1, 0, 0])
    else {
      const a = ((n[0] ?? 0) * Math.PI) / 180, cx = n[1] ?? 0, cy = n[2] ?? 0
      const cos = Math.cos(a), sin = Math.sin(a)
      m = times(m, [1, 0, 0, 1, cx, cy])
      m = times(m, [cos, sin, -sin, cos, 0, 0])
      m = times(m, [1, 0, 0, 1, -cx, -cy])
    }
  }
  return m
}

const QUAD_STEPS = 8
const CUBIC_STEPS = 10

// an SVG path's outline as closed rings of points, curves flattened to segments
export const ringsOf = (d: string): Point[][] => {
  const tokens = d.match(/[MLHVQTCSZAmlhvqtcsza]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? []
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
    if (/^[A-Za-z]$/.test(tokens[i]!)) command = tokens[i++]!
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
        command = ''
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

// the elements the fill draws; any other throws, so the fence stays
const DRAWN = new Set(['svg', 'g', 'path', 'rect', 'line'])
// the width MathJax's stylesheet gives a table's rules and frame
const TABLE_RULE = 70

// The fill paints every outline in one ink, fully opaque. A presentation it cannot
// honour — a style (the root's vertical-align aside), hiding, transparency, a colour
// or a background — is named so the fence stays. MathJax writes \rule as a black
// background rect on an mspace, which is the ink; a background on any other node
// is a background.
const OPAQUE = new Set(['opacity', 'fill-opacity', 'stroke-opacity'])
const unhonouredOf = (node: LiteNode, kind: string, root: boolean, parent: LiteNode | null): string | null => {
  const rule =
    kind === 'rect' &&
    adaptor.getAttribute(node, 'fill') === 'black' &&
    parent !== null &&
    adaptor.getAttribute(parent, 'data-mml-node') === 'mspace'
  for (const { name, value } of adaptor.allAttributes(node)) {
    const v = String(value).trim()
    if (name === 'style' && v !== '' && !(root && /^vertical-align:[^;]*;?$/.test(v))) return `style="${v}"`
    if (name === 'display' || name === 'visibility' || name === 'data-background' || (name === 'data-bgcolor' && !rule)) return `${name}="${v}"`
    if (OPAQUE.has(name) && Number(v) !== 1) return `${name}="${v}"`
    if ((name === 'fill' || name === 'stroke') && v !== 'currentColor' && v !== 'none' && !(rule && name === 'fill')) return `${name}="${v}"`
  }
  return null
}

// An axis-aligned clip, [left, top, right, bottom], in the coordinates of the
// outlines it clips; null draws everywhere.
type Clip = readonly [number, number, number, number] | null
// one element's outlines, filled together under its clip
export type Shape = { rings: Point[][]; clip: Clip }

const box = (x0: number, y0: number, x1: number, y1: number, reverse = false): Point[] =>
  reverse ? [[x0, y0], [x0, y1], [x1, y1], [x1, y0]] : [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]

type Paint = { fill: string; stroke: string; strokeWidth: number }

const meet = (a: Clip, b: Clip): Clip =>
  a === null ? b : b === null ? a : [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])]

// Every outline under the root svg, in its coordinates, one shape per element:
// glyph paths and filled rules as they are, a stroked rect as its frame and a line
// as a quad of its stroke width. A nested svg maps its viewBox onto its viewport
// and clips to it, unless the stylesheet leaves it visible (a table cell's). Throws
// on an error node, an element or attribute the fill cannot draw (a dashed rule, a
// rounded frame, a stroked path), so the fence stays.
export const outlinesOf = (svg: LiteNode): Shape[] => {
  const shapes: Shape[] = []
  const attr = (node: LiteNode, name: string) => adaptor.getAttribute(node, name)
  const number = (node: LiteNode, name: string, fallback = 0): number => {
    const value = attr(node, name)
    const n = value == null ? fallback : Number(String(value).replace(/px$/, ''))
    if (!Number.isFinite(n)) throw new Error(`${name}="${value}"`)
    return n
  }
  // `fill`, `stroke` and `stroke-width` arrive inherited from the ancestors, as SVG paints them
  const walk = (node: LiteNode, outer: Matrix, clip: Clip, parent: LiteNode | null, grandparent: LiteNode | null, inherited: Paint) => {
    const kind = adaptor.kind(node)
    if (kind === '#text' || kind === '#comment') return
    if (!DRAWN.has(kind)) throw new Error(`cannot fill <${kind}>`)
    if (attr(node, 'data-mml-node') === 'merror') throw new Error('TeX error')
    const unhonoured = unhonouredOf(node, kind, node === svg, parent)
    if (unhonoured) throw new Error(`cannot honour ${unhonoured}`)
    if (/\bmjx-(dashed|dotted)\b/.test(attr(node, 'class') ?? '') || attr(node, 'stroke-dasharray') != null) throw new Error('a dashed rule')
    const paint: Paint = {
      fill: String(attr(node, 'fill') ?? inherited.fill).trim(),
      stroke: String(attr(node, 'stroke') ?? inherited.stroke).trim(),
      strokeWidth: number(node, 'stroke-width', inherited.strokeWidth),
    }
    let m = times(outer, transformOf(attr(node, 'transform')))
    let shape: Shape | null = null
    const put = (ring: Point[]) => {
      if (!shape) shapes.push((shape = { rings: [], clip }))
      shape.rings.push(ring.map(([px, py]) => at(m, px, py)))
    }
    if (kind === 'svg' && node !== svg) {
      const x = number(node, 'x'), y = number(node, 'y'), w = number(node, 'width'), h = number(node, 'height')
      const view = attr(node, 'viewBox')
      let inner: Matrix = [1, 0, 0, 1, x, y]
      if (view != null) {
        const [vx, vy, vw, vh] = view.trim().split(/[\s,]+/).map(Number) as [number, number, number, number]
        if (![vx, vy, vw, vh].every(Number.isFinite) || vw <= 0 || vh <= 0) throw new Error(`viewBox="${view}"`)
        const aspect = (attr(node, 'preserveAspectRatio') ?? 'xMidYMid meet').trim()
        let sx = w / vw, sy = h / vh, tx = x, ty = y
        if (aspect !== 'none') {
          if (!/^xMidYMid( meet)?$/.test(aspect)) throw new Error(`preserveAspectRatio="${aspect}"`)
          sx = sy = Math.min(sx, sy)
          tx += (w - vw * sx) / 2
          ty += (h - vh * sy) / 2
        }
        inner = [sx, 0, 0, sy, tx - vx * sx, ty - vy * sy]
      }
      const visible = attr(node, 'overflow') === 'visible' || (grandparent !== null && attr(grandparent, 'data-mml-node') === 'mtable')
      if (!visible) {
        if (m[1] !== 0 || m[2] !== 0) throw new Error('a turned viewport')
        const [ax, ay] = at(m, x, y), [bx, by] = at(m, x + w, y + h)
        clip = meet(clip, [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)])
      }
      m = times(m, inner)
    } else if (kind === 'path') {
      if (paint.fill === 'none') throw new Error('an unfilled path')
      if (paint.stroke !== 'none' && paint.strokeWidth > 0) throw new Error('a stroked path')
      for (const ring of ringsOf(attr(node, 'd') ?? '')) put(ring)
    } else if (kind === 'rect') {
      if (number(node, 'rx') !== 0 || number(node, 'ry') !== 0) throw new Error('a rounded frame')
      const x = number(node, 'x'), y = number(node, 'y'), w = number(node, 'width'), h = number(node, 'height')
      const framed = attr(node, 'data-frame') === 'true'
      if (paint.fill !== 'none' && !framed) put(box(x, y, x + w, y + h))
      else {
        if (paint.stroke === 'none') throw new Error('an unstroked frame')
        const t = number(node, 'stroke-width', framed ? TABLE_RULE : NaN) / 2
        put(box(x - t, y - t, x + w + t, y + h + t))
        if (w > 2 * t && h > 2 * t) put(box(x + t, y + t, x + w - t, y + h - t, true))
      }
    } else if (kind === 'line') {
      if (paint.stroke === 'none') throw new Error('an unstroked rule')
      const x1 = number(node, 'x1'), y1 = number(node, 'y1'), x2 = number(node, 'x2'), y2 = number(node, 'y2')
      const t = number(node, 'stroke-width', attr(node, 'data-line') != null ? TABLE_RULE : NaN) / 2
      const length = Math.hypot(x2 - x1, y2 - y1)
      if (length > 0) {
        const nx = (-(y2 - y1) / length) * t, ny = ((x2 - x1) / length) * t
        put([[x1 + nx, y1 + ny], [x2 + nx, y2 + ny], [x2 - nx, y2 - ny], [x1 - nx, y1 - ny]])
      }
    }
    for (const child of adaptor.childNodes(node)) walk(child, m, clip, node, parent, paint)
  }
  walk(svg, IDENTITY, null, null, null, { fill: 'currentColor', stroke: 'none', strokeWidth: 1 })
  return shapes
}

const SUBSAMPLES = 4
// edge crossings one fill may compute before the formula counts as too complex
const MAX_WORK = 20_000_000

type Edge = { x0: number; y0: number; x1: number; y1: number; dir: number }

// a shape that is one axis-aligned rectangle, as [left, top, right, bottom]
const boxOf = (rings: readonly Point[][]): [number, number, number, number] | null => {
  if (rings.length !== 1 || rings[0]!.length !== 4) return null
  const ring = rings[0]!
  for (let k = 0; k < 4; k++) {
    const a = ring[k]!, b = ring[(k + 1) % 4]!
    if (a[0] !== b[0] && a[1] !== b[1]) return null
  }
  const xs = ring.map(p => p[0]), ys = ring.map(p => p[1])
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

// Nonzero-winding scanline fill with SUBSAMPLES rows per pixel and exact horizontal
// coverage; an axis-aligned rectangle (a rule, a fraction bar) is covered exactly in
// both directions, so one thinner than a subsample row still leaves its ink. Each
// shape (one element) is filled on its own, within its clip and its bounding box,
// and coverages add up to full: independent elements never cancel, and pieces that
// abut leave no seam. The rings and clips are already in pixels. Throws past
// MAX_WORK crossings.
const filled = (shapes: readonly Shape[], width: number, height: number, ink: Ink): Uint8Array => {
  const cover = new Float32Array(width * height)
  let own = new Float32Array(0)
  let work = 0
  for (const { rings, clip } of shapes) {
    const rect = boxOf(rings)
    if (rect) {
      const [cl, ct, cr, cb] = clip ?? [0, 0, width, height]
      const l = Math.max(0, cl, rect[0]), r = Math.min(width, cr, rect[2])
      const t = Math.max(0, ct, rect[1]), b = Math.min(height, cb, rect[3])
      if (r <= l || b <= t) continue
      for (let row = Math.floor(t); row < Math.ceil(b); row++) {
        const v = Math.min(b, row + 1) - Math.max(t, row)
        for (let c = Math.floor(l); c < Math.ceil(r); c++) {
          const h = Math.min(r, c + 1) - Math.max(l, c)
          cover[row * width + c] = Math.min(1, cover[row * width + c]! + v * h)
        }
        work += Math.ceil(r) - Math.floor(l)
        if (work > MAX_WORK) throw new Error('too complex to draw')
      }
      continue
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const ring of rings)
      for (const [x, y] of ring) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    const [cl, ct, cr, cb] = clip ?? [0, 0, width, height]
    const left0 = Math.max(0, cl, minX), right0 = Math.min(width, cr, maxX)
    const top0 = Math.max(0, ct, minY), bottom0 = Math.min(height, cb, maxY)
    if (right0 <= left0 || bottom0 <= top0) continue
    const bx = Math.floor(left0), bw = Math.ceil(right0) - bx
    const firstRow = Math.floor(top0), lastRow = Math.ceil(bottom0)
    const size = bw * (lastRow - firstRow)
    if (own.length < size) own = new Float32Array(size)
    else own.fill(0, 0, size)
    const edges: Edge[] = []
    for (const ring of rings)
      for (let k = 0; k < ring.length; k++) {
        const a = ring[k]!, b = ring[(k + 1) % ring.length]!
        if (a[1] === b[1]) continue
        edges.push(a[1] < b[1] ? { x0: a[0], y0: a[1], x1: b[0], y1: b[1], dir: 1 } : { x0: b[0], y0: b[1], x1: a[0], y1: a[1], dir: -1 })
      }
    edges.sort((p, q) => p.y0 - q.y0)
    const active: Edge[] = []
    const crossings: [number, number][] = []
    let next = 0
    for (let row = firstRow; row < lastRow; row++)
      for (let s = 0; s < SUBSAMPLES; s++) {
        const sy = row + (s + 0.5) / SUBSAMPLES
        if (sy < top0 || sy >= bottom0) continue
        while (next < edges.length && edges[next]!.y0 <= sy) active.push(edges[next++]!)
        let kept = 0
        for (const e of active) if (e.y1 > sy) active[kept++] = e
        active.length = kept
        if (kept === 0) continue
        work += kept
        if (work > MAX_WORK) throw new Error('too complex to draw')
        crossings.length = 0
        for (const e of active) crossings.push([e.x0 + ((sy - e.y0) * (e.x1 - e.x0)) / (e.y1 - e.y0), e.dir])
        crossings.sort((p, q) => p[0] - q[0])
        let winding = 0
        const base = (row - firstRow) * bw - bx
        for (let k = 0; k < crossings.length - 1; k++) {
          winding += crossings[k]![1]
          if (winding === 0) continue
          const left = Math.max(left0, crossings[k]![0]), right = Math.min(right0, crossings[k + 1]![0])
          if (right <= left) continue
          const li = Math.floor(left), ri = Math.floor(right)
          if (li === ri) {
            own[base + li]! += (right - left) / SUBSAMPLES
            continue
          }
          own[base + li]! += (li + 1 - left) / SUBSAMPLES
          for (let c = li + 1; c < ri; c++) own[base + c]! += 1 / SUBSAMPLES
          if (ri < bx + bw) own[base + ri]! += (right - ri) / SUBSAMPLES
        }
      }
    for (let row = firstRow; row < lastRow; row++) {
      const from = (row - firstRow) * bw, to = row * width + bx
      for (let c = 0; c < bw; c++) {
        const v = own[from + c]!
        if (v > 0) cover[to + c] = Math.min(1, cover[to + c]! + v)
      }
    }
  }
  const rgba = new Uint8Array(width * height * 4)
  for (let p = 0; p < width * height; p++) {
    rgba[p * 4] = ink[0]
    rgba[p * 4 + 1] = ink[1]
    rgba[p * 4 + 2] = ink[2]
    rgba[p * 4 + 3] = Math.round(cover[p]! * 255)
  }
  return rgba
}

// a fence that is exactly one display wrapper keeps only the TeX inside it
const unwrapped = (tex: string): string => {
  const t = tex.trim()
  const wrapped = /^\$\$((?:(?!\$\$)[\s\S])*)\$\$$/.exec(t) ?? /^\\\[((?:(?!(?<!\\)\\[[\]])[\s\S])*)\\\]$/.exec(t)
  return (wrapped ? wrapped[1]! : t).trim()
}

// What MathJax would build before any bound here can stop it: \pmb sets its
// argument twice, so its outlines double per nesting; an operator \DeclareMathOperator
// defines may use earlier ones any number of times, so a chain grows the same way;
// and an alignat environment allocates the column count its argument gives.
const PMB = /\\pmb(?![a-zA-Z])/
const DECLARE = /\\DeclareMathOperator(?![a-zA-Z])/
const ALIGNAT = /\\begin\s*\{\s*(?:x{0,2}alignat\*?|alignedat)\s*\}/
const unboundedOf = (tex: string): string | null => {
  if (PMB.test(tex)) return '\\pmb'
  if (DECLARE.test(tex)) return '\\DeclareMathOperator'
  if (ALIGNAT.test(tex)) return 'an alignat environment'
  return null
}

// the extent of the outlines, each within its clip, as [left, top, right, bottom]
const extentOf = (shapes: readonly Shape[]): [number, number, number, number] | null => {
  let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity
  for (const { rings, clip } of shapes) {
    let sl = Infinity, st = Infinity, sr = -Infinity, sb = -Infinity
    for (const ring of rings)
      for (const [x, y] of ring) {
        if (x < sl) sl = x
        if (x > sr) sr = x
        if (y < st) st = y
        if (y > sb) sb = y
      }
    if (clip) [sl, st, sr, sb] = [Math.max(sl, clip[0]), Math.max(st, clip[1]), Math.min(sr, clip[2]), Math.min(sb, clip[3])]
    if (sr <= sl || sb <= st) continue
    l = Math.min(l, sl); t = Math.min(t, st); r = Math.max(r, sr); b = Math.max(b, sb)
  }
  return r > l && b > t ? [l, t, r, b] : null
}

const inked = (rgba: Uint8Array): boolean => {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i]! > 0) return true
  return false
}

// The formula as pixels on a box of whole cells, the box no wider than `columns`:
// the bitmap is padded to columns × rows cells of CELL_PX so the terminal scales it
// without distortion, the formula at the left and centred top to bottom. The box
// covers the viewBox and any outline drawn past it (a \smash, an \rlap).
export const mathOf = (source: string, columns: number, ink: Ink): MathRendered => {
  const tex = unwrapped(source)
  if (tex === '') return { error: 'nothing to draw' }
  if (tex.length > MAX_TEX_CHARS) return { error: `too big to draw (${tex.length} characters)` }
  if (tex.includes('$$')) return { error: 'more than one display formula' }
  const unbounded = unboundedOf(tex)
  if (unbounded) return { error: `${unbounded} cannot be drawn within bounds` }
  try {
    const svg = texToSvg(tex)
    const view = (adaptor.getAttribute(svg, 'viewBox') ?? '').split(/\s+/).map(Number)
    if (view.length !== 4 || view.some(n => !Number.isFinite(n)) || view[2]! <= 0 || view[3]! <= 0) return { error: 'no picture' }
    const outlines = outlinesOf(svg)
    const extent = extentOf(outlines)
    if (!extent) return { error: 'nothing to draw' }
    let [vx, vy, vw, vh] = view as [number, number, number, number]
    const right = Math.max(vx + vw, extent[2]), bottom = Math.max(vy + vh, extent[3])
    vx = Math.min(vx, extent[0]); vy = Math.min(vy, extent[1])
    vw = right - vx; vh = bottom - vy
    const scale = EM_PX / 1000
    const inkWidth = vw * scale, inkHeight = vh * scale
    const cols = Math.ceil(inkWidth / CELL_PX.width)
    const rows = Math.ceil(inkHeight / CELL_PX.height)
    if (cols > Math.min(MAX_CELLS, columns)) return { error: `${cols} columns wide` }
    if (rows > MAX_CELLS) return { error: `${rows} rows tall` }
    const width = cols * CELL_PX.width, height = rows * CELL_PX.height
    if (width > MAX_SIDE_PX || height > MAX_SIDE_PX || width * height * 4 > MAX_BYTES) return { error: `${width}×${height} pixels` }
    const top = (height - inkHeight) / 2
    const px = ([x, y]: Point): Point => [(x - vx) * scale, (y - vy) * scale + top]
    const shapes = outlines.map(({ rings, clip }): Shape => {
      if (clip === null) return { rings: rings.map(ring => ring.map(px)), clip }
      const [l, t] = px([clip[0], clip[1]]), [r, b] = px([clip[2], clip[3]])
      return { rings: rings.map(ring => ring.map(px)), clip: [l, t, r, b] }
    })
    const rgba = filled(shapes, width, height, ink)
    if (!inked(rgba)) return { error: 'nothing to draw' }
    return { rgba, width, height, columns: cols, rows }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}
