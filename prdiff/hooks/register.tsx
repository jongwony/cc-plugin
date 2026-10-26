import { atom, read } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { PrdiffDiff } from '../types'
import { loadDiff, type DiffData, type Run } from './git.ts'
import { clean, hunkSource } from './parse.ts'
import { clampTop, clip as clipText, fileAt, fileLabel, fit, jump, layout, scrolled, windowOf, windowRows as bodyWindow, type Layout, type Row } from './rows.ts'

export const PANE = 'prdiff'

const diffRef = { plugin: 'prdiff', key: 'diff' } as const
const topRef = { plugin: 'prdiff', key: 'top' } as const
const diff = atom(diffRef, { status: 'idle', gen: 0, number: 0 } as PrdiffDiff)
const top = atom(topRef, 0)

function runner($: EngineInterface): Run {
  return async (argv, timeoutMs, env) => {
    const r = await $.process.run(argv, { ...(timeoutMs === undefined ? {} : { timeoutMs }), ...(env === undefined ? {} : { env }) })
    return { exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr, isStdoutTruncated: r.isStdoutTruncated }
  }
}

function message(err: unknown): string {
  return clean(err instanceof Error ? err.message : String(err))
}

// The newest load; an older one that finishes later is dropped. Starts at the clock: above any gen an earlier instance of this module wrote.
let diffGen = Date.now()
// The parsed diff lives here, under the generation that loaded it; `$.state`
// carries the status and that generation. A hot reload empties it, and the
// pane then offers to load again.
let held: { gen: number; data: DiffData; layout: Layout } | undefined

type Held = NonNullable<typeof held>

/**
 * Rows the diff view keeps out of the body: title, refs line, notes, controls,
 * file line, and one left empty so a full drawing is never `bodyRows` tall.
 */
function headRows(data: DiffData): number {
  return 5 + data.notes.length
}

/** The body's window for a pane `paneRows` tall; every surface and event derives its own. */
function windowRows(paneRows: number, data: DiffData): number {
  return bodyWindow(paneRows, headRows(data))
}

/** The diff on screen, only while the load it came from is the one ready for the PR in view. */
async function ready($: EngineInterface): Promise<Held | undefined> {
  const d = await read($, diff)
  return d.status === 'ready' && held && held.gen === d.gen ? held : undefined
}

async function openDiff($: EngineInterface, number: number): Promise<void> {
  diffGen += 1
  const gen = diffGen
  await $.state.set(topRef, 0)
  await $.state.set(diffRef, { status: 'loading', gen, number })
  try {
    const ownSsh = (await Promise.all([$.env.get('GIT_SSH_COMMAND'), $.env.get('GIT_SSH')])).some(v => v !== undefined)
    const data = await loadDiff(runner($), number, { ownSsh })
    if (gen !== diffGen) return
    held = { gen, data, layout: layout(data.files) }
    await $.state.set(diffRef, { status: 'ready', gen, number })
  } catch (err) {
    if (gen !== diffGen) return
    await $.state.set(diffRef, { status: 'error', gen, number, error: message(err) })
  }
}

async function moveTop($: EngineInterface, paneRows: number, to: (now: number, l: Layout) => number): Promise<void> {
  const h = await ready($)
  if (!h) return
  const l = h.layout
  const rows = windowRows(paneRows, h.data)
  const now = clampTop(await read($, top), l.rows.length, rows, l.fileRows)
  if (h.gen !== diffGen) return
  await $.state.set(topRef, clampTop(to(now, l), l.rows.length, rows, l.fileRows))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'prdiff',
      description: "Browse a pull request's cumulative diff (merge-base of its base branch to its head) in a pane",
      argumentHint: '[PR number]',
    })
    return next(e)
  })

  on('command.run', { command: 'prdiff' }, async ($, e) => {
    const arg = /^#?(\d+)$/.exec(e.args.trim())?.[1]
    const n = arg === undefined ? 0 : Number(arg)
    if (n === 0) return { text: 'Usage: /prdiff <PR number>' }
    await $.ui.open({ id: PANE, title: 'PR diff', focus: true })
    void openDiff($, n)
    return { text: `PR diff pane opened on #${n}.` }
  })

  on('ui.scroll', { requestId: PANE }, async ($, e, next) => {
    const h = await ready($)
    if (!h) return next(e)
    const rows = windowRows(e.bodyRows, h.data)
    await moveTop($, e.bodyRows, (now, l) => scrolled(now, e, rows, l.rows.length))
    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Code } = $.ui.resolve(e)
    const cols = Math.max(20, e.props.bodyColumns)
    const line = (text: string, props: { dimColor?: boolean; bold?: boolean; color?: string } = {}) => (
      <Text wrap="truncate-end" {...props}>
        {clean(text)}
      </Text>
    )

    const d = await read($, diff)
    const paneRows = e.props.scroll.bodyRows
    const half = (data: Held | undefined) => Math.max(1, Math.floor((data ? windowRows(paneRows, data.data) : 3) / 2))
    const controls = (
      <Box flexDirection="row" gap={1}>
        <Button key="next" plain hotkey="j" label="next file" onPress={() => void moveTop($, paneRows, (t, l) => jump(l.fileRows, t, 1))} />
        <Button key="prev" plain hotkey="k" label="prev" onPress={() => void moveTop($, paneRows, (t, l) => jump(l.fileRows, t, -1))} />
        <Button key="down" plain hotkey="d" label="down" onPress={() => void moveTop($, paneRows, t => t + half(held))} />
        <Button key="up" plain hotkey="u" label="up" onPress={() => void moveTop($, paneRows, t => t - half(held))} />
        <Button key="reload" plain hotkey="r" label="reload" onPress={() => void openDiff($, d.number)} />
      </Box>
    )
    const data = held && held.gen === d.gen && d.status === 'ready' ? held : undefined
    if (!data) {
      const status =
        d.status === 'loading'
          ? line(`Loading #${d.number}…`, { dimColor: true })
          : d.status === 'error'
            ? line(`#${d.number}: ${d.error ?? ''}`, { color: 'error' })
            : d.number > 0
              ? line(`#${d.number} is not loaded. Press r to load it.`, { dimColor: true })
              : line('Run /prdiff <PR number> to open one.', { dimColor: true })
      return (
        <Box flexDirection="column">
          {controls}
          {status}
        </Box>
      )
    }

    const { data: dd, layout: lay } = data
    const added = dd.files.reduce((n, f) => n + f.added, 0)
    const deleted = dd.files.reduce((n, f) => n + f.deleted, 0)
    const head = [
      line(`#${dd.number} ${dd.title}`, { bold: true }),
      line(
        `${dd.baseRefName} ← ${dd.headRefName} · ${dd.files.length} files +${added} −${deleted} · base ${dd.mergeBase.slice(0, 7)}`,
        { dimColor: true },
      ),
      ...dd.notes.map(n => line(n, { color: 'warning' })),
      controls,
    ]
    const bodyRows = windowRows(paneRows, dd)
    // The file line names the file at the window's own clamped top.
    const t = clampTop(await read($, top), lay.rows.length, bodyRows, lay.fileRows)
    const at = fileAt(lay.fileRows, t)
    head.push(line(at < 0 ? 'files' : `file ${at + 1}/${dd.files.length} · ${dd.files[at]?.path ?? ''}`, { dimColor: true }))
    const clip = cols + 8
    const textOf = (row: Exclude<Row, { kind: 'line' }>): string => {
      switch (row.kind) {
        case 'goto':
        case 'file': {
          const f = dd.files[row.file]
          return f ? fileLabel(f) : ''
        }
        case 'note':
          return `  ${row.text}`
        case 'hunk': {
          const h = dd.files[row.file]?.hunks[row.hunk]
          return h ? `${h.header} ${h.section}` : ''
        }
        case 'rule':
          return '─'.repeat(Math.min(cols, 80))
      }
    }
    const win = windowOf(dd.files, lay.rows, t, bodyRows, clip, textOf)
    const body = win.pieces.map(p => {
      if (p.kind === 'code') {
        const source = hunkSource(p.lines)
        return source === '' ? null : <Code source={source} format="diff" path={dd.files[p.file]?.path} wrap="truncate-end" />
      }
      const row = p.row
      const text = clipText(textOf(row), clip)
      switch (row.kind) {
        case 'goto':
          return (
            <Button key={`goto:${row.file}`} plain onPress={() => void moveTop($, paneRows, (_, l) => l.fileRows[row.file] ?? 0)}>
              {fit(clean(textOf(row)), cols)}
            </Button>
          )
        case 'file':
          return (
            <Box key={`file:${row.file}`}>
              <Text bold wrap="truncate-end">
                {clean(text)}
              </Text>
            </Box>
          )
        case 'rule':
          return line(text, { dimColor: true })
        case 'note':
          return line(text, { dimColor: true })
        case 'hunk':
          return line(text, { color: 'subtle' })
      }
    })
    if (win.isCut) body.push(line('… the rest of this screen is over the drawing budget; scroll on', { dimColor: true }))
    return (
      <Box flexDirection="column">
        {head}
        {body}
      </Box>
    )
  })
}
