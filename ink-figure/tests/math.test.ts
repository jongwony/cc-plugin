import { expect, test } from 'claude-code/testing'
import { CELL_PX, INK, inkOf, mathOf, type MathArt } from '../hooks/math.ts'
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
