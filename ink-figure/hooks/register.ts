import type { ApiContentBlock, EngineInterface, Register } from 'claude-code'
import { SERIES_COLOURS, type Role, type Segment } from './diagrams.ts'
import { fencesOf, piecesOf, type MathPicture } from './figures.ts'
import { INK, inkOf, type Ink } from './math.ts'
import { DEFAULT_COLUMNS, INLINE_MARGIN, reportOf } from './report.ts'
import { boardOf, entriesOf, htmlOf, mergedOf, publishBoard, type Board, type ToolAnswer } from './board.ts'

// Every ```mermaid and ```math fence Claude writes is drawn where the fence was, on
// the terminal: a diagram or chart as box art built from Text elements, a formula as
// an Image. AssistantMessage is the finest site a mod gets, so a reply holding a
// figure is redrawn as a column of its own: Markdown for the prose around each
// fence, the figure in the fence's place. A fence that will not draw stays as
// written; a reply with nothing to draw, or another surface, goes to Claude Code
// untouched. When a turn ends, a fence of its reply that would not draw is reported to
// the model in a row it reads and the person does not see as typed, so the figures it
// writes later fit what draws. With the `figureBoard` option on, the same turn's
// fences also go to the session's figure board, a private Artifact page republished
// at one URL (board.ts), which the Claude apps open where they draw no fence.

// colour by role through element styles: the engine refuses escape sequences in text
const STYLE: Record<Role, { color?: string; dimColor?: boolean }> = {
  text: {},
  border: { color: 'cyan' },
  junction: { color: 'cyan' },
  line: { dimColor: true },
  corner: { dimColor: true },
  arrow: { color: 'yellow' },
  accent: { color: 'magenta' },
}

// the math ink for the current theme: read when the session starts, kept in step by
// config.set on `theme` (the path /config and /theme both save through), and read on
// demand only while still unknown; a read that fails settles on the ink that reads on
// either theme. A read answers only while no theme change landed after it began:
// `themeSet` counts those changes.
let themeInk: Ink | null = null
let themeSet = 0

// the columns of the last terminal that drew a reply, and the main loop's response
// text this turn, in order
let terminalColumns: number | null = null
let replyTexts: string[] = []

const textsOf = (content: readonly ApiContentBlock[]): string[] => content.flatMap(b => (b.type === 'text' && typeof b.text === 'string' ? [b.text] : []))

const readTheme = async ($: EngineInterface): Promise<Ink> => {
  const began = themeSet
  let ink: Ink
  try {
    ink = inkOf((await $.config.list()).find(row => row.key === 'theme')?.value)
  } catch {
    ink = INK.either
  }
  if (themeSet === began) themeInk = ink
  return themeInk ?? ink
}

// The figure board's life in a session: what the store keeps for it (`board:<session
// id>`, so a resumed session finds its board again, the BOARDS most recently updated
// kept), where its page is written (under the Claude configuration directory, outside
// any repository), and the Artifact calls that publish it. Updates run one after
// another, after the turn that asked; a failure goes to the debug log alone.
const BOARDS = 30
let boardQueue: Promise<void> = Promise.resolve()
let boardAnnounced: string | null = null

const boardPathOf = async ($: EngineInterface, id: string): Promise<string> => {
  const dir = (await $.env.get('CLAUDE_CONFIG_DIR'))?.replace(/\/+$/, '') || `${(await $.env.get('HOME')) ?? ''}/.claude`
  return `${dir}/ink-figure/boards/${id}.html`
}

const boardNameOf = async ($: EngineInterface, id: string): Promise<string> => {
  let root = ''
  try {
    root = await $.session.root()
  } catch {}
  return `${root.split('/').filter(Boolean).at(-1) ?? 'session'} · ${id.slice(0, 8)}`
}

const keepBoard = async ($: EngineInterface, id: string, at: string) => {
  const raw = await $.store.get('boards')
  const rows = (Array.isArray(raw) ? raw : []).filter((r): r is { id: string; at: string } => typeof r?.id === 'string' && typeof r?.at === 'string' && r.id !== id)
  rows.unshift({ id, at })
  for (const old of rows.splice(BOARDS)) await $.store.delete(`board:${old.id}`)
  await $.store.set('boards', rows)
}

const boardUpdate = async ($: EngineInterface, texts: readonly string[]) => {
  if (!texts.some(t => t.includes('```') || t.includes('~~~'))) return
  const at = new Date(await $.clock.now()).toISOString()
  const fresh = entriesOf(texts, at)
  if (fresh.length === 0) return
  if (!(await $.tool.list()).some(t => t.name === 'Artifact')) {
    $.ui.log('figure board: the Artifact tool is not available in this session; nothing published', { to: 'debug' })
    return
  }
  const id = await $.session.id()
  const stored = boardOf(await $.store.get(`board:${id}`))
  const board: Board = { name: stored?.name ?? (await boardNameOf($, id)), url: stored?.url ?? null, updatedAt: at, entries: mergedOf(stored?.entries ?? [], fresh) }
  const path = await boardPathOf($, id)
  await $.fs.write(path, htmlOf(board))
  const outcome = await publishBoard(input => $.tool.call(input as never) as Promise<ToolAnswer>, path, board.url)
  for (const line of outcome.log) $.ui.log(`figure board: ${line}`, { to: 'debug' })
  if (outcome.url !== null) board.url = outcome.url
  await $.store.set(`board:${id}`, board)
  await keepBoard($, id, at)
  if (outcome.url !== null && outcome.url !== boardAnnounced) {
    boardAnnounced = outcome.url
    $.ui.toast(`Figure board: ${outcome.url}`, { timeoutMs: 8000 })
  }
}

const updateBoard = ($: EngineInterface, texts: readonly string[]): Promise<void> => {
  boardQueue = boardQueue
    .then(() => boardUpdate($, texts))
    .catch(err => $.ui.log(`figure board: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' }))
  return boardQueue
}

const boardLinkOf = async ($: EngineInterface): Promise<string> => {
  const board = boardOf(await $.store.get(`board:${await $.session.id()}`))
  if (board?.url) return `Figure board (${board.entries.length} figure${board.entries.length === 1 ? '' : 's'}): ${board.url}`
  return 'No figure board in this session yet: it is published when a reply holds a ```mermaid or ```math fence.'
}

export const register: Register = (on, options) => {
  const board = options?.figureBoard === true

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    void readTheme($)
    if (board) {
      try {
        await $.command.register({ name: 'figure-board', description: "Shows the link to this session's figure board." })
      } catch (err) {
        $.ui.log(`figure board: /figure-board not registered: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' })
      }
    }
    return result
  })

  if (board) on('command.run', { command: 'figure-board' }, async $ => ({ text: await boardLinkOf($) }))

  on('config.set', { key: 'theme' }, async ($, e, next) => {
    const result = await next(e)
    if (result.deny === undefined) {
      const ink = inkOf(result.value)
      themeSet++
      if (ink !== themeInk) {
        themeInk = ink
        $.ui.invalidate('ui.render')
      }
    }
    return result
  })

  on('session.append', { door: 'response' }, async ($, e, next) => {
    const result = await next(e)
    // observing only: once next stored the row, nothing here may fail the hook
    try {
      if (e.agentId === undefined && result.message?.type === 'assistant') replyTexts.push(...textsOf(result.message.content))
    } catch {}
    return result
  })

  on('turn.start', async ($, e, next) => {
    replyTexts = []
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) return result
    const texts = replyTexts
    replyTexts = []
    if (e.reason !== 'answer') return result
    if (board) void updateBoard($, texts)
    const text = reportOf(texts, terminalColumns, themeInk ?? INK.either)
    if (text !== null) {
      // a plugin above refuses the row by resolving { deny }; the bottom refuses a run
      // no plugin may shape by rejecting. The reply stands either way; the debug log
      // keeps why the report did not reach the model.
      try {
        const stored = await $.session.append({ message: { type: 'user', content: [{ type: 'text', text }] } })
        if (stored.deny !== undefined) $.ui.log(`undrawn-figure report refused: ${stored.deny}`, { to: 'debug' })
      } catch (err) {
        $.ui.log(`undrawn-figure report refused: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' })
      }
    }
    return result
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    // the figures are terminal drawings; elsewhere the fence stays as Claude wrote it
    if (e.surface !== 'terminal') return next(e)
    const columns = e.viewport?.columns ?? DEFAULT_COLUMNS
    terminalColumns = columns
    const text = e.props.text.replace(/\r\n?/g, '\n')
    const fences = fencesOf(text)
    if (fences.length === 0) return next(e)
    const math = fences.some(f => f.lang === 'math')
    const ink = themeInk ?? (math ? await readTheme($) : INK.either)
    const pieces = piecesOf(text, columns - INLINE_MARGIN, ink, fences)
    if (!pieces) return next(e)
    const { Box, Text, Markdown, Image } = $.ui.resolve(e)

    const spanOf = ({ text, role, series }: Segment) =>
      Text({ ...STYLE[role ?? 'text'], ...(series ? { color: SERIES_COLOURS[series - 1] } : {}), children: [text] })
    const diagram = ({ lines }: { lines: Segment[][] }) =>
      Box({
        flexDirection: 'column',
        children: lines.map(line => (line.length === 0 ? Text({ children: [' '] }) : Box({ flexDirection: 'row', children: line.map(spanOf) }))),
      })
    const formula = ({ rgba, width, height, columns, rows, tex }: MathPicture) =>
      Image({ source: { rgba, width, height }, columns, rows, alt: tex })

    return Box({
      flexDirection: 'column',
      rowGap: 1,
      children: pieces.map(p => ('diagram' in p ? diagram(p.diagram) : 'math' in p ? formula(p.math) : Markdown({ text: p.markdown }))),
    })
  })
}
