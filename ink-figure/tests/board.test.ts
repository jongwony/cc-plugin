import { expect, mock, test } from 'claude-code/testing'
import { BOARD_SECTION_ID, boardSectionOf } from '../hooks/board.ts'

const BASE = [{ id: 'intro', text: 'intro', scope: 'shared' as const }]
const DEFERRED = 'The Artifact tool is deferred'

// the engine beneath the plugin: the prompt it composes and the tools it lists
const engine = (on: any, listed: string[] = ['Read']) => {
  on('prompt.compose', () => ({ sections: BASE }))
  on('tool.list', () => ({ value: listed.map(name => ({ name, description: '', mcp: false })) }))
}

// the facts a system prompt is composed from, as the engine resolves them
type Facts = { tools?: string[]; traits?: string[]; surfaces?: string[] }
const facts = ({ tools = ['Artifact'], traits = [], surfaces = ['terminal'] }: Facts = {}) =>
  ({ model: 'claude-test', promptModel: 'claude-test', surfaces, tools, outputStyle: null, traits }) as any

const boardOf = (sections: readonly { id: string }[]) => sections.find(s => s.id === BOARD_SECTION_ID) as { text: string; scope: string } | undefined
const ON = { options: { figureBoard: true } }

test('the instruction names the drawn fences, the content, the order, the timing, the medium and the link it keeps', () => {
  const text = boardSectionOf()
  expect(text).toContain('```mermaid')
  expect(text).toContain('```math')
  expect(text).toContain('one place the person can open away from the terminal')
  expect(text).toContain('paragraph that leads into it')
  expect(text).toContain('newest first')
  expect(text).toContain('before writing the reply\'s final text')
  expect(text).toContain('A fence shown as an example or as syntax is not a drawn figure.')
  expect(text).toContain('unless the person named a medium')
  expect(text).toContain('same place for the whole session, updating it at the link it already has')
  expect(text).not.toContain('.html')
  expect(text).not.toContain(DEFERRED)
  expect(boardSectionOf(true)).toContain(`${DEFERRED}: load it through ToolSearch first.`)
})

test('with the board on and the Artifact tool offered, the section is appended after the engine\'s', ON, async ($, on) => {
  engine(on)
  const { sections } = await $.prompt.compose(facts({ tools: ['Read', 'Artifact'] }))
  expect(sections.slice(0, BASE.length)).toEqual(BASE)
  const board = boardOf(sections)
  expect(board?.scope).toBe('session')
  expect(board?.text).toBe(boardSectionOf())
  expect(sections.at(-1)?.id).toBe(BOARD_SECTION_ID)
})

test('an Artifact tool behind ToolSearch still gets the section, which says to load it first', ON, async ($, on) => {
  engine(on, ['Read', 'Artifact'])
  expect(boardOf((await $.prompt.compose(facts({ tools: ['Read', 'ToolSearch'] }))).sections)?.text).toContain(DEFERRED)
})

test('without the Artifact tool, offered or listed, no section is added', ON, async ($, on) => {
  engine(on, ['Read'])
  expect(boardOf((await $.prompt.compose(facts({ tools: ['Read'] }))).sections)).toBe(undefined)
})

test('a teammate\'s render, a headless run, and a session with no surface go without the section', ON, async ($, on) => {
  engine(on)
  mock.env(on, {})
  expect(boardOf((await $.prompt.compose(facts({ traits: ['teammate'] }))).sections)).toBe(undefined)
  expect(boardOf((await $.prompt.compose(facts({ traits: ['print'] }))).sections)).toBe(undefined)
  expect(boardOf((await $.prompt.compose(facts({ surfaces: [] }))).sections)).toBe(undefined)
})

test('a cloud session a person attends gets the section with no surface, headless trait or not', ON, async ($, on) => {
  engine(on)
  mock.env(on, { CLAUDE_CODE_REMOTE: 'true', CLAUDE_CODE_SESSION_ATTENDED: '1' })
  expect(boardOf((await $.prompt.compose(facts({ surfaces: [] }))).sections)?.text).toBe(boardSectionOf())
  expect(boardOf((await $.prompt.compose(facts({ surfaces: [], traits: ['print'] }))).sections)?.text).toBe(boardSectionOf())
  expect(boardOf((await $.prompt.compose(facts({ surfaces: [], traits: ['teammate'] }))).sections)).toBe(undefined)
})

test('a cloud session no person attends goes without the section', ON, async ($, on) => {
  engine(on)
  mock.env(on, { CLAUDE_CODE_REMOTE: 'true' })
  expect(boardOf((await $.prompt.compose(facts({ surfaces: [] }))).sections)).toBe(undefined)
})

test('a local headless run (-p, no surface, not remote) goes without the section', ON, async ($, on) => {
  engine(on)
  mock.env(on, {})
  expect(boardOf((await $.prompt.compose(facts({ surfaces: [], traits: ['print'] }))).sections)).toBe(undefined)
})

test('a terminal session still gets the section', ON, async ($, on) => {
  engine(on)
  mock.env(on, {})
  expect(boardOf((await $.prompt.compose(facts({ surfaces: ['terminal'] }))).sections)?.text).toBe(boardSectionOf())
})

test('with the board off (the default), no section is added', async ($, on) => {
  engine(on)
  const { sections } = await $.prompt.compose(facts())
  expect(boardOf(sections)).toBe(undefined)
  expect(sections).toEqual(BASE)
})
