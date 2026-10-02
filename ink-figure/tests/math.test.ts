import { expect, test } from 'claude-code/testing'
import { CELL_PX, INK, inkOf, mathOf, outlinesOf, ringsOf, type MathArt } from '../hooks/math.ts'
import { adaptor, texToSvg, type LiteNode } from '../hooks/vendor/math/mathjax.js'
import { piecesOf } from '../hooks/figures.ts'

const ENGINE = { type: 'Text', props: {}, children: ['drawn by Claude Code'] }

const message = (text: string, surface: 'terminal' | 'desktop' = 'terminal') => ({
  plugin: 'ink-figure',
  component: 'AssistantMessage',
  requestId: 'msg-1',
  surface,
  viewport: { columns: 140, rows: 40 },
  props: { text, isFirstOfReply: true },
})

const FRACTION = '\\frac{a+b}{c} = \\sqrt{x^2 + y^2}'
const MATRIX = '\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}'

const art = (tex: string, columns = 134): MathArt => {
  const out = mathOf(tex, columns, INK.dark)
  if ('error' in out) throw new Error(out.error)
  return out
}

const inked = (a: MathArt): number => {
  let n = 0
  for (let p = 3; p < a.rgba.length; p += 4) if (a.rgba[p]! > 0) n++
  return n
}

test('a fraction and a matrix fill pixels on a box of whole cells', () => {
  for (const tex of [FRACTION, MATRIX]) {
    const a = art(tex)
    expect(inked(a)).toBeGreaterThan(100)
    expect(a.width).toBe(a.columns * CELL_PX.width)
    expect(a.height).toBe(a.rows * CELL_PX.height)
    expect(a.rgba.length).toBe(a.width * a.height * 4)
    expect(a.rows).toBeGreaterThan(1)
  }
})

test('a fraction stands taller than one text row, a flat sum fits in one or two', () => {
  expect(art('\\frac{1}{2}').rows).toBeGreaterThan(1)
  expect(art('a + b').rows).toBeLessThanOrEqual(2)
})

test('malformed TeX, an empty fence, or a formula wider than the room keeps its fence', () => {
  expect('error' in mathOf('\\frac{1}{\\undefinedmacro}', 134, INK.dark)).toBe(true)
  expect('error' in mathOf('\\frac{1}{', 134, INK.dark)).toBe(true)
  expect('error' in mathOf('   ', 134, INK.dark)).toBe(true)
  expect('error' in mathOf(FRACTION, 4, INK.dark)).toBe(true)
})

test('a $$ or \\[ wrapper around the TeX is unwrapped', () => {
  expect(inked(art(`$$${FRACTION}$$`))).toBe(inked(art(FRACTION)))
  expect(inked(art(`\\[${FRACTION}\\]`))).toBe(inked(art(FRACTION)))
})

test('ink follows the theme: dark on light, light on dark, a middle grey otherwise', () => {
  expect(inkOf('light')).toEqual(INK.light)
  expect(inkOf('light-daltonized')).toEqual(INK.light)
  expect(inkOf('dark-ansi')).toEqual(INK.dark)
  expect(inkOf('auto')).toEqual(INK.either)
  expect(inkOf(undefined)).toEqual(INK.either)
})

test('a math fence is drawn as an Image in the fence place, its TeX the alt text', async ($, on) => {
  on('ui.render', () => ENGINE)
  const ui = await $.ui.mount(message(`Before.\n\n\`\`\`math\n${FRACTION}\n\`\`\`\n\nAfter.`))
  const image = await ui.find({ type: 'Image' })
  expect(image).toBeDefined()
  expect(image!.props.alt).toBe(FRACTION)
  expect(await ui.find({ type: 'Markdown', text: 'Before.' })).toBeDefined()
  expect(await ui.find({ type: 'Markdown', text: 'After.' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'drawn by Claude Code' })).toBeUndefined()
})

test('a reply with a mermaid diagram and a formula draws both', async ($, on) => {
  on('ui.render', () => ENGINE)
  const text = ['Flow:', '', '```mermaid\ngraph LR\n  P[plan] --> Q[ship]\n```', '', 'Cost:', '', `\`\`\`math\n${MATRIX}\n\`\`\``].join('\n')
  const ui = await $.ui.mount(message(text))
  expect(await ui.find({ type: 'Text', text: 'ship' })).toBeDefined()
  expect(await ui.find({ type: 'Image' })).toBeDefined()
})

test('off the terminal, or with malformed TeX, the reply goes to Claude Code untouched', async ($, on) => {
  on('ui.render', () => ENGINE)
  const desktop = await $.ui.mount(message(`\`\`\`math\n${FRACTION}\n\`\`\``, 'desktop'))
  expect(await desktop.find({ type: 'Text', text: 'drawn by Claude Code' })).toBeDefined()
  const broken = await $.ui.mount(message('```math\n\\frac{1}{\\nope}\n```'))
  expect(await broken.find({ type: 'Text', text: 'drawn by Claude Code' })).toBeDefined()
  expect(piecesOf('```math\n\\frac{1}{\\nope}\n```', 134)).toBe(null)
})

// pixels with ink, as [x, y], and the box around them
const inkAt = (a: MathArt, x: number, y: number): boolean => a.rgba[(y * a.width + x) * 4 + 3]! > 64
const inkBox = (a: MathArt) => {
  let x0 = a.width, y0 = a.height, x1 = -1, y1 = -1
  for (let y = 0; y < a.height; y++)
    for (let x = 0; x < a.width; x++)
      if (inkAt(a, x, y)) {
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y)
      }
  return { x0, y0, x1, y1 }
}

test('a boxed formula draws its frame as a line around the content, not a filled block', () => {
  for (const tex of ['\\boxed{x+1}', '\\fbox{$x$}']) {
    const a = art(tex)
    const { x0, y0, x1, y1 } = inkBox(a)
    let blank = 0, inked = 0
    for (let y = y0 + 3; y <= y1 - 3; y++) for (let x = x0 + 3; x <= x1 - 3; x++) inkAt(a, x, y) ? inked++ : blank++
    expect(inked).toBeGreaterThan(10)
    expect(blank).toBeGreaterThan(inked)
  }
})

test('an array draws its rules: a separator row across it and a separator column down it', () => {
  const a = art('\\begin{array}{c|c}1&2\\\\\\hline 3&4\\end{array}')
  const { x0, y0, x1, y1 } = inkBox(a)
  const run = (n: number, at: (k: number) => boolean) => {
    let k = 0
    while (k < n && at(k)) k++
    return k
  }
  let row = false, column = false
  for (let y = y0; y <= y1; y++) if (run(x1 - x0 + 1, k => inkAt(a, x0 + k, y)) >= 0.9 * (x1 - x0 + 1)) row = true
  for (let x = x0; x <= x1; x++) {
    let longest = 0, current = 0
    for (let y = y0; y <= y1; y++) longest = Math.max(longest, (current = inkAt(a, x, y) ? current + 1 : 0))
    if (longest >= 0.9 * (y1 - y0 + 1)) column = true
  }
  expect(row).toBe(true)
  expect(column).toBe(true)
})

test('a stretched arrow is one connected piece, its shaft meeting its head', () => {
  const a = art('\\overrightarrow{ABC}')
  const seen = new Uint8Array(a.width * a.height)
  const { x0, y0, x1 } = inkBox(a)
  let start = -1
  for (let x = x0; x <= x1 && start < 0; x++) if (inkAt(a, x, y0)) start = y0 * a.width + x
  const stack = [start]
  let left = a.width, right = -1
  seen[start] = 1
  while (stack.length > 0) {
    const p = stack.pop()!
    const x = p % a.width, y = Math.floor(p / a.width)
    left = Math.min(left, x); right = Math.max(right, x)
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= a.width || ny >= a.height) continue
        const q = ny * a.width + nx
        if (!seen[q] && inkAt(a, nx, ny)) {
          seen[q] = 1
          stack.push(q)
        }
      }
  }
  expect(right - left).toBeGreaterThan(0.8 * (x1 - x0))
})

test('a large matrix fills within a bounded time, or keeps its fence at once', () => {
  const big = '\\begin{matrix}' + Array.from({ length: 24 }, () => Array(24).fill('x').join('&')).join('\\\\') + '\\end{matrix}'
  const started = performance.now()
  mathOf(big, 255, INK.dark)
  expect(performance.now() - started).toBeLessThan(1000)
})

test('a label is drawn again at another width: each conversion starts afresh', () => {
  const tex = '\\frac{a}{b}\\label{eq:r}'
  expect('error' in mathOf(tex, 134, INK.dark)).toBe(false)
  expect('error' in mathOf(tex, 120, INK.dark)).toBe(false)
})

test('a path with numbers after Z, or an arc, is refused rather than read wrongly', () => {
  expect(() => ringsOf('M0 0 L1 1 Z 5 5')).toThrow()
  expect(() => ringsOf('M0 0 A1 1 0 0 1 5 5')).toThrow()
})

test('a line break MathJax draws as a space keeps the fence; a table row break draws', () => {
  for (const tex of ['x = 1 \\\\ y = 2', 'x = 1 \\newline y = 2', '\\begin{equation} a = b \\\\ c = d \\end{equation}'])
    expect('error' in mathOf(tex, 134, INK.dark)).toBe(true)
  for (const tex of [
    MATRIX,
    '\\begin{aligned} a &= b \\\\ c &= d \\end{aligned}',
    'f(x) = \\begin{cases} 1 & x > 0 \\\\ 0 & x \\le 0 \\end{cases}',
    '\\sum_{\\substack{i<n \\\\ j<m}} a_{ij}',
  ])
    expect('error' in mathOf(tex, 134, INK.dark)).toBe(false)
})

test('no definition reaches the next fence, not even from one that failed', () => {
  const before = art('\\sin x')
  expect('error' in mathOf('\\DeclareMathOperator{\\sin}{bad}\\nope', 134, INK.dark)).toBe(true)
  expect('error' in mathOf('\\DeclareMathOperator{\\foo}{foo}\\foo x', 134, INK.dark)).toBe(true)
  const after = art('\\sin x')
  expect(after.width).toBe(before.width)
  expect([...after.rgba]).toEqual([...before.rgba])
  expect('error' in mathOf('\\foo x', 134, INK.dark)).toBe(true)
})

test('an outline drawn past the formula box is drawn, not cut away', () => {
  const smashed = art('\\frac{\\smash{\\dfrac{1}{2}}}{3}')
  const phantom = art('\\frac{\\phantom{1}}{3}')
  expect(inked(smashed)).toBeGreaterThan(inked(phantom))
})

test('overlapping elements add up: a glyph over a rule leaves no hole', () => {
  const a = art('\\frac{\\rlap{\\rule{1em}{1em}}X}{y}')
  const rule = art('\\frac{\\rlap{\\rule{1em}{1em}}\\phantom{X}}{y}')
  // every pixel the rule alone fills fully stays filled once X is drawn over it
  expect(a.width).toBe(rule.width)
  let holes = 0
  for (let p = 3; p < rule.rgba.length; p += 4) if (rule.rgba[p] === 255 && a.rgba[p]! < 255) holes++
  expect(holes).toBe(0)
})

test('a formula drawn once is kept for any room it fits, and refused where it does not', () => {
  const fence = `\`\`\`math\n${FRACTION}\n\`\`\``
  const wide = piecesOf(fence, 134, INK.dark)
  expect(wide?.some(p => 'math' in p)).toBe(true)
  expect(piecesOf(fence, 4, INK.dark)).toBe(null)
  expect(piecesOf(fence, 120, INK.dark)?.some(p => 'math' in p)).toBe(true)
})

test('a presentation the fill cannot honour keeps the fence; ordinary formulas still draw', () => {
  expect('error' in mathOf('\\frac{\\mmlToken{mi}[style="display:none"]{x}}{y}', 134, INK.dark)).toBe(true)
  expect('error' in mathOf('\\frac{\\mmlToken{mi}[mathbackground="black"]{x}}{y}', 134, INK.dark)).toBe(true)
  expect('error' in mathOf('\\frac{\\mmlToken{mi}[mathcolor="none"]{x}}{y}', 134, INK.dark)).toBe(true)
  for (const tex of [
    '\\rule{1em}{1em}',
    FRACTION,
    MATRIX,
    '\\boxed{x+1}',
    '\\begin{array}{|c|c|}\\hline a & b\\\\ \\hline\\end{array}',
    '\\overrightarrow{ABC}',
    '\\frac{\\rlap{\\rule{1em}{1em}}X}{y}',
  ])
    expect(inked(art(tex))).toBeGreaterThan(0)
})

test('TeX whose expansion has no bound keeps the fence at once, any alignat included; aligned draws', () => {
  const started = performance.now()
  for (const tex of [
    '\\pmb{x}',
    '\\pmb{'.repeat(8) + 'x'.repeat(200) + '}'.repeat(8),
    '\\begin{alignat}{100000000} x&=y\\end{alignat}',
    '\\begin{alignedat}[t]{100000000}x&=y\\end{alignedat}',
    '\\begin{alignedat}[{]}]{' + '9'.repeat(309) + '}x&=y\\end{alignedat}',
    '\\begin {xxalignat}{2} a&=b\\end{xxalignat}',
    '\\begin{alignedat}{2} a&=b & c&=d\\end{alignedat}',
  ])
    expect('error' in mathOf(tex, 134, INK.dark)).toBe(true)
  expect(performance.now() - started).toBeLessThan(100)
  expect(inked(art('\\begin{aligned} a&=b \\\\ c&=d\\end{aligned}'))).toBeGreaterThan(0)
})

test('a fraction bar thinner than a subsample row still leaves its ink', () => {
  const alpha = (a: MathArt): number => {
    let n = 0
    for (let p = 3; p < a.rgba.length; p += 4) n += a.rgba[p]!
    return n
  }
  const none = alpha(art('{1\\atop 2}'))
  const thin = alpha(art('{1\\above 0.1pt 2}'))
  const thicker = alpha(art('{1\\above 0.2pt 2}'))
  expect(thin).toBeGreaterThan(none)
  expect(thicker).toBeGreaterThan(thin)
})

test('a declared operator keeps the fence before MathJax runs, a chain of them at once; \\operatorname draws', () => {
  const names = 'abcdefghijklmn'.split('').map(c => `\\${c}${c}`)
  let chain = `\\DeclareMathOperator{${names[0]}}{x}`
  for (let i = 1; i < names.length; i++) chain += `\\DeclareMathOperator{${names[i]}}{${names[i - 1]}${names[i - 1]}}`
  chain += names[names.length - 1]
  const started = performance.now()
  expect('error' in mathOf(chain, 134, INK.dark)).toBe(true)
  expect(performance.now() - started).toBeLessThan(100)
  expect(inked(art('\\operatorname{argmax}_x f'))).toBeGreaterThan(0)
})

test('a path whose inherited stroke is drawn keeps the fence; glyphs inherit a zero stroke width', () => {
  const svg = texToSvg('x')
  expect(() => outlinesOf(svg)).not.toThrow()
  const paths: LiteNode[] = []
  const find = (node: LiteNode) => {
    if (adaptor.kind(node) === 'path') paths.push(node)
    for (const child of adaptor.childNodes(node)) find(child)
  }
  find(svg)
  expect(paths.length).toBeGreaterThan(0)
  // the root group sets stroke="currentColor" stroke-width="0"; a positive width on the way down draws the stroke
  adaptor.setAttribute(paths[0]!, 'stroke-width', '40')
  expect(() => outlinesOf(svg)).toThrow('a stroked path')
})

test('only a fence that is one display wrapper is unwrapped; two keep the fence', () => {
  for (const tex of ['$$a$$\n$$b$$', '$$x=1$$ and $$y=2$$']) expect('error' in mathOf(tex, 134, INK.dark)).toBe(true)
  expect(inked(art('$$\\frac{a}{b}$$'))).toBeGreaterThan(0)
  expect(inked(art('\\[ \\begin{aligned} a &= b \\\\[2pt] c &= d \\end{aligned} \\]'))).toBeGreaterThan(0)
})

test('a number in exponent form is a coordinate, not a path command', () => {
  expect(ringsOf('M0 0L1 1 2e-3 5Z')).toEqual([[[0, 0], [1, 1], [0.002, 5]]])
  expect(ringsOf('M0 0L1E1 1Z')[0]!.length).toBe(2)
})
