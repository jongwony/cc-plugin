import { atom, read } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { PrdiffDiff, PrdiffList, PrdiffView } from '../types'
import { listPrs, loadDiff, type DiffData, type Run } from './git.ts'
import { clean, hunkSource } from './parse.ts'
import { clampTop, fileAt, fileLabel, jump, layout, windowOf, type Layout, type Row } from './rows.ts'

export const PANE = 'prdiff'

const viewRef = { plugin: 'prdiff', key: 'view' } as const
const listRef = { plugin: 'prdiff', key: 'list' } as const
const diffRef = { plugin: 'prdiff', key: 'diff' } as const
const topRef = { plugin: 'prdiff', key: 'top' } as const
const view = atom(viewRef, { kind: 'list' } as PrdiffView)
const list = atom(listRef, { status: 'idle', gen: 0, items: [] } as PrdiffList)
const diff = atom(diffRef, { status: 'idle', gen: 0, number: 0 } as PrdiffDiff)
const top = atom(topRef, 0)

/** Rows a wheel tick moves the body. */
const TICK = 3

function runner($: EngineInterface): Run {
  return async (argv, timeoutMs) => {
    const r = await $.process.run(argv, timeoutMs === undefined ? undefined : { timeoutMs })
    return { exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr, isStdoutTruncated: r.isStdoutTruncated }
  }
}

function message(err: unknown): string {
  return clean(err instanceof Error ? err.message : String(err))
}

// The newest load of each kind; an older one that finishes later is dropped.
let listGen = 0
let diffGen = 0
// The parsed diff lives here, under the generation that loaded it; `$.state`
// carries the status and that generation. A hot reload empties it, and the
// pane then offers to load again.
let held: { gen: number; data: DiffData; layout: Layout } | undefined

type Held = NonNullable<typeof held>

/** Rows the diff view draws above the body: title, refs line, notes, controls, file line. */
function headRows(data: DiffData): number {
  return 4 + data.notes.length
}

/** The body's window for a pane `paneRows` tall; every surface and event derives its own. */
function windowRows(paneRows: number, data: DiffData): number {
  return Math.max(3, paneRows - headRows(data))
}

/** The diff on screen, only while the load it came from is the one ready for the PR in view. */
async function ready($: EngineInterface): Promise<Held | undefined> {
  const [v, d] = await Promise.all([read($, view), read($, diff)])
  if (v.kind !== 'diff' || d.status !== 'ready' || d.number !== v.number) return undefined
  return held && held.gen === d.gen ? held : undefined
}

async function loadList($: EngineInterface): Promise<void> {
  listGen += 1
  const gen = listGen
  const prev = await read($, list)
  await $.state.set(listRef, { ...prev, status: 'loading', gen, error: undefined })
  try {
    const got = await listPrs(runner($))
    if (gen !== listGen) return
    await $.state.set(listRef, { status: 'ready', gen, repo: got.repo, current: got.current, items: got.items })
  } catch (err) {
    if (gen !== listGen) return
    await $.state.set(listRef, { status: 'error', gen, items: prev.items, error: message(err) })
  }
}

async function openDiff($: EngineInterface, number: number): Promise<void> {
  diffGen += 1
  const gen = diffGen
  await $.state.set(viewRef, { kind: 'diff', number })
  await $.state.set(topRef, 0)
  await $.state.set(diffRef, { status: 'loading', gen, number })
  try {
    const l = await read($, list)
    const data = await loadDiff(runner($), number, { repo: l.status === 'ready' ? l.repo : undefined })
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
  const now = await read($, top)
  await $.state.set(topRef, clampTop(to(now, l), l.rows.length, windowRows(paneRows, h.data)))
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
    await $.ui.open({ id: PANE, title: 'PR diff', focus: true })
    const n = Number.parseInt(e.args.trim().replace(/^#/, ''), 10)
    if (Number.isInteger(n) && n > 0) {
      void loadList($)
      await openDiff($, n)
      return { text: `PR diff pane opened on #${n}.` }
    }
    await $.state.set(viewRef, { kind: 'list' })
    await loadList($)
    return { text: 'PR diff pane opened.' }
  })

  on('ui.scroll', { requestId: PANE }, async ($, e, next) => {
    const h = await ready($)
    if (!h) return next(e)
    const by = e.by
    const rows = windowRows(e.bodyRows, h.data)
    const step = Math.abs(by) >= e.bodyRows ? Math.max(1, rows - 2) * Math.sign(by) : by * TICK
    await moveTop($, e.bodyRows, now => now + step)
    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Code } = $.ui.resolve(e)
    const cols = Math.max(20, e.props.bodyColumns)
    const v = await read($, view)
    const line = (text: string, props: { dimColor?: boolean; bold?: boolean; color?: string } = {}) => (
      <Text wrap="truncate-end" {...props}>
        {clean(text)}
      </Text>
    )

    if (v.kind === 'list') {
      const l = await read($, list)
      return (
        <Box flexDirection="column">
          <Box flexDirection="row">
            <Text bold wrap="truncate-end">
              Pull requests{l.repo ? ` · ${l.repo}` : ''}{' '}
            </Text>
            <Button key="reload" plain hotkey="r" label="refresh" onPress={() => void loadList($)} />
          </Box>
          {l.status === 'loading' && line('Loading…', { dimColor: true })}
          {l.status === 'error' && line(`Could not list PRs: ${l.error ?? ''}`, { color: 'error' })}
          {l.status === 'ready' && l.items.length === 0 && line('No open pull requests.', { dimColor: true })}
          {l.items.map((p, i) => (
            <Button
              key={`pr:${p.number}`}
              plain
              hotkey={i < 9 ? String(i + 1) : undefined}
              onPress={() => void openDiff($, p.number)}
            >
              {clean(`${p.number === l.current ? '● ' : '  '}#${p.number} ${p.title}`)}
              <Text dimColor>{clean(`  ${p.baseRefName} ← ${p.headRefName} · ${p.author}${p.isDraft ? ' · draft' : ''}`)}</Text>
            </Button>
          ))}
        </Box>
      )
    }

    const d = await read($, diff)
    const paneRows = e.props.scroll.bodyRows
    const half = (data: Held | undefined) => Math.max(1, Math.floor((data ? windowRows(paneRows, data.data) : 3) / 2))
    const controls = (
      <Box flexDirection="row" gap={1}>
        <Button key="next" plain hotkey="j" label="next file" onPress={() => void moveTop($, paneRows, (t, l) => jump(l.fileRows, t, 1))} />
        <Button key="prev" plain hotkey="k" label="prev" onPress={() => void moveTop($, paneRows, (t, l) => jump(l.fileRows, t, -1))} />
        <Button key="down" plain hotkey="d" label="down" onPress={() => void moveTop($, paneRows, t => t + half(held))} />
        <Button key="up" plain hotkey="u" label="up" onPress={() => void moveTop($, paneRows, t => t - half(held))} />
        <Button key="back" plain hotkey="b" label="PRs" onPress={() => void $.state.set(viewRef, { kind: 'list' })} />
        <Button key="reload" plain hotkey="r" label="reload" onPress={() => void openDiff($, v.number)} />
      </Box>
    )
    const data = held && held.gen === d.gen && d.status === 'ready' ? held : undefined
    if (!data) {
      const status =
        d.status === 'loading' && d.number === v.number
          ? line(`Loading #${v.number}…`, { dimColor: true })
          : d.status === 'error' && d.number === v.number
            ? line(`#${v.number}: ${d.error ?? ''}`, { color: 'error' })
            : line(`#${v.number} is not loaded. Press r to load it.`, { dimColor: true })
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
        `${dd.baseRefName} ← ${dd.headRefName} · ${dd.mode} · ${dd.files.length} files +${added} −${deleted} · base ${dd.mergeBase.slice(0, 7)}`,
        { dimColor: true },
      ),
      ...dd.notes.map(n => line(n, { color: 'warning' })),
      controls,
    ]
    const bodyRows = windowRows(paneRows, dd)
    // The file line names the file at the window's own clamped top.
    const t = clampTop(await read($, top), lay.rows.length, bodyRows)
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
      const text = textOf(row).slice(0, clip)
      switch (row.kind) {
        case 'goto':
          return (
            <Button key={`goto:${row.file}`} plain onPress={() => void moveTop($, paneRows, (_, l) => l.fileRows[row.file] ?? 0)}>
              {clean(text)}
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
