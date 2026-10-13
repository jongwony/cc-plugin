import { expect, test } from 'claude-code/testing'
import { BOARD_SECTION_ID, boardPathOf, boardSectionOf } from '../hooks/board.ts'

const SID = '0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b'
const BASE = [{ id: 'intro', text: 'intro', scope: 'shared' as const }]

// the engine beneath the plugin: the prompt it composes, the session id, the environment
const engine = (on: any, env: Record<string, string> = { HOME: '/home/test' }) => {
  on('prompt.compose', () => ({ sections: BASE }))
  on('session.id', () => ({ value: SID }))
  on('env.get', (_$: any, e: any) => ({ value: env[e.name] }))
}

// the facts a system prompt is composed from, as the engine resolves them
const facts = (tools: string[]) => ({ model: 'claude-test', promptModel: 'claude-test', surfaces: ['terminal' as const], tools, outputStyle: null, traits: [] })

const boardOf = (sections: readonly { id: string }[]) => sections.find(s => s.id === BOARD_SECTION_ID) as { text: string; scope: string } | undefined

test('the page file sits under the config directory, named by the session id', () => {
  expect(boardPathOf('/home/test/.claude/', SID)).toBe(`/home/test/.claude/ink-figure/boards/${SID}.html`)
})

test('the instruction names the fences, the context line, the order, the file and the republish', () => {
  const text = boardSectionOf('/x/board.html')
  expect(text).toContain('```mermaid')
  expect(text).toContain('```math')
  expect(text).toContain('paragraph that led into the figure')
  expect(text).toContain('newest first')
  expect(text).toContain('`/x/board.html`')
  expect(text).toContain('republish that same file')
})

test('with the board on and the Artifact tool offered, the section is appended after the engine\'s', { options: { figureBoard: true } }, async ($, on) => {
  engine(on)
  const { sections } = await $.prompt.compose(facts(['Read', 'Artifact']))
  expect(sections.slice(0, BASE.length)).toEqual(BASE)
  const board = boardOf(sections)
  expect(board?.scope).toBe('session')
  expect(board?.text).toContain(`/home/test/.claude/ink-figure/boards/${SID}.html`)
  expect(sections.at(-1)?.id).toBe(BOARD_SECTION_ID)
})

test('CLAUDE_CONFIG_DIR, when set, places the page file', { options: { figureBoard: true } }, async ($, on) => {
  engine(on, { HOME: '/home/test', CLAUDE_CONFIG_DIR: '/cfg' })
  const { sections } = await $.prompt.compose(facts(['Artifact']))
  expect(boardOf(sections)?.text).toContain(`/cfg/ink-figure/boards/${SID}.html`)
})

test('without the Artifact tool in the request, no section is added', { options: { figureBoard: true } }, async ($, on) => {
  engine(on)
  const { sections } = await $.prompt.compose(facts(['Read']))
  expect(boardOf(sections)).toBe(undefined)
})

test('with the board off (the default), no section is added', async ($, on) => {
  engine(on)
  const { sections } = await $.prompt.compose(facts(['Artifact']))
  expect(boardOf(sections)).toBe(undefined)
  expect(sections).toEqual(BASE)
})
