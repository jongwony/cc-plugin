import { expect, test } from 'claude-code/testing'
import { BOARD_SECTION_ID, boardPathOf, boardSectionOf, configDirOf } from '../hooks/board.ts'

const SID = '0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b'
const BASE = [{ id: 'intro', text: 'intro', scope: 'shared' as const }]
const DEFERRED = 'The Artifact tool is deferred'

// the engine beneath the plugin: the prompt it composes, the session id, the
// environment, the tools it lists, and what reaches the debug log; counts its reads
type Engine = { env?: Record<string, string>; listed?: string[] }
const engine = (on: any, { env = { HOME: '/home/test' }, listed = ['Read'] }: Engine = {}) => {
  const reads = { env: 0, session: 0 }
  const logs: string[] = []
  on('prompt.compose', () => ({ sections: BASE }))
  on('session.id', () => (reads.session++, { value: SID }))
  on('env.get', (_$: any, e: any) => (reads.env++, { value: env[e.name] }))
  on('tool.list', () => ({ value: listed.map(name => ({ name, description: '', mcp: false })) }))
  on('ui.log', (_$: any, e: any) => (logs.push(e.text), { value: undefined }))
  return { reads, logs }
}

// the facts a system prompt is composed from, as the engine resolves them
type Facts = { tools?: string[]; traits?: string[]; surfaces?: string[] }
const facts = ({ tools = ['Artifact'], traits = [], surfaces = ['terminal'] }: Facts = {}) =>
  ({ model: 'claude-test', promptModel: 'claude-test', surfaces, tools, outputStyle: null, traits }) as any

const boardOf = (sections: readonly { id: string }[]) => sections.find(s => s.id === BOARD_SECTION_ID) as { text: string; scope: string } | undefined
const ON = { options: { figureBoard: true } }

test('the config directory is CLAUDE_CONFIG_DIR, else .claude under HOME, then USERPROFILE; never a relative path', () => {
  expect(configDirOf({ claudeConfigDir: '/cfg', home: '/home/test' })).toBe('/cfg')
  expect(configDirOf({ home: '/home/test/' })).toBe('/home/test/.claude')
  expect(configDirOf({ userProfile: 'C:\\Users\\test' })).toBe('C:\\Users\\test/.claude')
  expect(configDirOf({ claudeConfigDir: 'relative', home: '~' })).toBe(null)
  expect(configDirOf({})).toBe(null)
})

test('the page file sits under the config directory, named by the session id', () => {
  expect(boardPathOf('/home/test/.claude/', SID)).toBe(`/home/test/.claude/ink-figure/boards/${SID}.html`)
})

test('the instruction names the drawn fences, the content, the order, the timing, the medium and the anchor file', () => {
  const text = boardSectionOf('/x/board.html')
  expect(text).toContain('```mermaid')
  expect(text).toContain('```math')
  expect(text).toContain('one place the person can open away from the terminal')
  expect(text).toContain('paragraph that leads into it')
  expect(text).toContain('newest first')
  expect(text).toContain('before writing the reply\'s final text')
  expect(text).toContain('A fence shown as an example or as syntax is not a drawn figure.')
  expect(text).toContain('unless the person named a medium')
  expect(text).toContain('same place for the whole session')
  expect(text).toContain('A page published from a file uses `/x/board.html` and is republished from that same file.')
  expect(text).not.toContain(DEFERRED)
  expect(boardSectionOf('/x/board.html', true)).toContain(`${DEFERRED}: load it through ToolSearch first.`)
})

test('with the board on and the Artifact tool offered, the section is appended after the engine\'s', ON, async ($, on) => {
  engine(on)
  const { sections } = await $.prompt.compose(facts({ tools: ['Read', 'Artifact'] }))
  expect(sections.slice(0, BASE.length)).toEqual(BASE)
  const board = boardOf(sections)
  expect(board?.scope).toBe('session')
  expect(board?.text).toContain(`/home/test/.claude/ink-figure/boards/${SID}.html`)
  expect(board?.text).not.toContain(DEFERRED)
  expect(sections.at(-1)?.id).toBe(BOARD_SECTION_ID)
})

test('CLAUDE_CONFIG_DIR, when set, places the page file', ON, async ($, on) => {
  engine(on, { env: { HOME: '/home/test', CLAUDE_CONFIG_DIR: '/cfg' } })
  expect(boardOf((await $.prompt.compose(facts())).sections)?.text).toContain(`/cfg/ink-figure/boards/${SID}.html`)
})

test('an Artifact tool behind ToolSearch still gets the section, which says to load it first', ON, async ($, on) => {
  engine(on, { listed: ['Read', 'Artifact'] })
  expect(boardOf((await $.prompt.compose(facts({ tools: ['Read', 'ToolSearch'] }))).sections)?.text).toContain(DEFERRED)
})

test('without the Artifact tool, offered or listed, no section is added', ON, async ($, on) => {
  engine(on, { listed: ['Read'] })
  expect(boardOf((await $.prompt.compose(facts({ tools: ['Read'] }))).sections)).toBe(undefined)
})

test('a teammate\'s render, a headless run, and a session with no surface go without the section', ON, async ($, on) => {
  engine(on)
  expect(boardOf((await $.prompt.compose(facts({ traits: ['teammate'] }))).sections)).toBe(undefined)
  expect(boardOf((await $.prompt.compose(facts({ traits: ['print'] }))).sections)).toBe(undefined)
  expect(boardOf((await $.prompt.compose(facts({ surfaces: [] }))).sections)).toBe(undefined)
})

test('with no absolute home or config directory, the section is left out and the debug log says so once', ON, async ($, on) => {
  const io = engine(on, { env: {} })
  expect(boardOf((await $.prompt.compose(facts())).sections)).toBe(undefined)
  expect(boardOf((await $.prompt.compose(facts())).sections)).toBe(undefined)
  expect(io.logs.filter(l => l.includes('no absolute config directory')).length).toBe(1)
})

test('the environment and the session id are read once across composes', ON, async ($, on) => {
  const io = engine(on)
  await $.prompt.compose(facts())
  const first = { ...io.reads }
  await $.prompt.compose(facts())
  await $.prompt.compose(facts())
  expect(io.reads).toEqual(first)
  expect(first.session).toBe(1)
})

test('with the board off (the default), no section is added', async ($, on) => {
  engine(on)
  const { sections } = await $.prompt.compose(facts())
  expect(boardOf(sections)).toBe(undefined)
  expect(sections).toEqual(BASE)
})
