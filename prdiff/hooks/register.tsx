import { atom, read } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { PrdiffDiff } from '../types'
import { loadDiff, type DiffData, type Run } from './git.ts'
import { clean, summaryOf, type FileDiff } from './parse.ts'
import { Budget, CHAR_BUDGET, LIST_BUDGET, clip, drawn, fileLabel, listed, targetIndex, type Target } from './rows.ts'

export const PANE = 'prdiff'

const diffRef = { plugin: 'prdiff', key: 'diff' } as const
/** The diff state before any load. */
const IDLE: PrdiffDiff = { status: 'idle', gen: 0, number: 0 }
const diff = atom(diffRef, IDLE)

function runner($: EngineInterface): Run {
  return async (argv, timeoutMs, env) => {
    const r = await $.process.run(argv, { ...(timeoutMs === undefined ? {} : { timeoutMs }), ...(env === undefined ? {} : { env }) })
    return { exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr, isStdoutTruncated: r.isStdoutTruncated }
  }
}

function message(err: unknown): string {
  return clean(err instanceof Error ? err.message : String(err))
}

// This module instance; a state another instance wrote (before a hot reload) is not loaded here.
const self = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
// The PR's inventory and the files read so far live here, under the load that
// read them; `$.state` carries the status. A hot reload empties it, and the
// pane then offers to load again.
// A file's entry is its read: in flight until `got` is set; a failed read leaves no entry.
let held: { gen: number; data: DiffData; files: Map<number, { read: Promise<void>; got?: { file: FileDiff; isCut: boolean } }> } | undefined

/**
 * Rewrites the stored diff state with `fn(now)`, written with ifVersion over
 * the `now` it was computed from and computed again on a miss. When `fn`
 * returns undefined nothing is written and undefined is returned.
 */
async function update($: EngineInterface, fn: (now: PrdiffDiff) => PrdiffDiff | undefined): Promise<PrdiffDiff | undefined> {
  for (;;) {
    const now = await $.state.get(diffRef)
    const next = fn(now.value ?? IDLE)
    if (next === undefined) return undefined
    if ((await $.state.set(diffRef, next, { ifVersion: now.version })).isSet) return next
  }
}

/** Writes the diff state for load `gen` while the stored state is still that load's. */
function putFor($: EngineInterface, gen: number, value: PrdiffDiff): Promise<PrdiffDiff | undefined> {
  return update($, now => (now.gen === gen ? value : undefined))
}

/**
 * Starts what a command or a press asks for. Its failures land in the load's
 * or pick's own state; one that cannot (a state write that itself failed)
 * goes to the transcript as a notice.
 */
function start($: EngineInterface, task: Promise<void>): Promise<void> {
  return task.catch(err => $.ui.log(`prdiff: ${message(err)}`))
}

/** Loads PR #number and opens its first file. */
async function openDiff($: EngineInterface, number: number): Promise<void> {
  let gen = 0
  let data: DiffData
  try {
    // A load's gen is one past the stored one, taken in the same write that stores it.
    const started = await update($, now => ({ status: 'loading', gen: now.gen + 1, number, owner: self }))
    gen = started?.gen ?? 0
    const ownSsh = (await Promise.all([$.env.get('GIT_SSH_COMMAND'), $.env.get('GIT_SSH')])).some(v => v !== undefined)
    data = await loadDiff(runner($), number, { ownSsh })
    if ((await $.state.get(diffRef)).value?.gen !== gen) return
    held = { gen, data, files: new Map() }
    if ((await putFor($, gen, { status: 'ready', gen, number, owner: self })) === undefined) return
  } catch (err) {
    // A failure before this load had a state of its own goes to start()'s notice.
    if (gen === 0) throw err
    await putFor($, gen, { status: 'error', gen, number, owner: self, error: message(err) })
    return
  }
  if (data.entries.length > 0) await openFile($, 0)
}


/**
 * Opens a file of the newest load and brings the pane to its top, where the
 * file is drawn. The target is resolved against the stored pick; a pick of
 * the file already open or being read changes nothing. Whatever the pick
 * ends in, its read's error or its scroll's rejection included, is written
 * to that pick's stored file state.
 */
async function openFile($: EngineInterface, target: Target): Promise<void> {
  const cur = held
  if (!cur) return
  const gen = cur.gen
  const count = cur.data.entries.length
  let index = -1
  let pick: number | undefined
  // What the pick ends in is shown only while it is still the stored pick.
  const settle = (change: Partial<NonNullable<PrdiffDiff['file']>>) =>
    update($, now => {
      const f = now.file
      return now.gen === gen && f !== undefined && pick !== undefined && f.pick === pick ? { ...now, file: { ...f, ...change } } : undefined
    })
  try {
    const started = await update($, now => {
      if (now.gen !== gen || now.status !== 'ready') return undefined
      index = targetIndex(now.file?.index, target, count)
      if (index < 0 || index >= count) return undefined
      if (now.file?.index === index && now.file.status !== 'error' && cur.files.has(index)) return undefined
      return { ...now, file: { index, pick: (now.file?.pick ?? 0) + 1, status: cur.files.get(index)?.got ? 'ready' : 'loading' } }
    })
    pick = started?.file?.pick
    const e = cur.data.entries[index]
    if (pick === undefined || !e) return
    let entry = cur.files.get(index)
    if (!entry) {
      const made: { read: Promise<void>; got?: { file: FileDiff; isCut: boolean } } = {
        read: cur.data.readFile(e).then(
          got => {
            made.got = got
          },
          err => {
            cur.files.delete(index)
            throw err
          },
        ),
      }
      cur.files.set(index, made)
      entry = made
    }
    const reading = entry
    const read = async () => {
      try {
        await reading.read
        await settle({ status: 'ready' })
      } catch (err) {
        await settle({ status: 'error', error: message(err) })
      }
    }
    // An impossible scroll is answered `{ deny }` and leaves the pick as drawn; a rejected one is the pick's fault.
    const scroll = () => $.ui.scroll({ in: PANE, to: 'start' }).then(
      () => undefined,
      err => settle({ fault: message(err) }),
    )
    await Promise.all([read(), scroll()])
  } catch (err) {
    // A failure before this pick was stored goes to start()'s notice.
    if (pick === undefined) throw err
    await settle({ fault: message(err) })
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'prdiff',
      description: "Browse a pull request's cumulative diff (merge-base of its base branch to its head) in a pane",
      argumentHint: '<PR number>',
    })
    return next(e)
  })

  on('command.run', { command: 'prdiff' }, async ($, e) => {
    const arg = /^#?(\d+)$/.exec(e.args.trim())?.[1]
    const n = arg === undefined ? 0 : Number(arg)
    if (n === 0) return { text: 'Usage: /prdiff <PR number>' }
    await $.ui.open({ id: PANE, title: 'PR diff', focus: true })
    void start($, openDiff($, n))
    return { text: `PR diff pane opened on #${n}.` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Code } = $.ui.resolve(e)
    const cols = Math.max(20, e.props.bodyColumns)
    // Every string drawn is clipped to the row and charged to one budget, in the order it is drawn.
    const b = new Budget(CHAR_BUDGET)
    const width = cols + 1
    const line = (text: string, props: { dimColor?: boolean; bold?: boolean; color?: string } = {}) => {
      const shown = clip(clean(text), width)
      return b.take(shown) ? (
        <Text wrap="truncate-end" {...props}>
          {shown}
        </Text>
      ) : null
    }
    // An error wraps, so its diagnostics stay readable; it is cut only where the budget, less the list's share, ends.
    const problem = (text: string) => {
      const shown = clip(clean(text), Math.max(0, b.left - LIST_BUDGET))
      return shown !== '' && b.take(shown) ? (
        <Text wrap="wrap" color="error">
          {shown}
        </Text>
      ) : null
    }
    const button = (key: string, hotkey: string, label: string, press: () => Promise<void>) =>
      b.take(label) ? <Button key={key} plain hotkey={hotkey} label={label} onPress={() => start($, press())} /> : null
    const d = await read($, diff)
    const isMine = d.owner === self
    const cur = isMine && d.status === 'ready' && held?.gen === d.gen ? held : undefined
    const f = cur ? d.file : undefined
    const at = f?.index ?? -1
    const count = cur?.data.entries.length ?? 0
    const head = cur
      ? [
          line(`#${cur.data.number} ${cur.data.title}`, { bold: true }),
          line(
            `${cur.data.baseRefName} ← ${cur.data.headRefName} · ${count} files +${cur.data.entries.reduce((n, e) => n + e.added, 0)} −${cur.data.entries.reduce((n, e) => n + e.deleted, 0)} · base ${cur.data.mergeBase.slice(0, 7)}`,
            { dimColor: true },
          ),
          ...cur.data.notes.map(n => line(n, { color: 'warning' })),
        ]
      : []
    const controls = (
      <Box flexDirection="row" gap={1}>
        {count > 0 && button('next', 'j', 'next file', () => openFile($, { step: 1 }))}
        {count > 0 && button('prev', 'k', 'prev', () => openFile($, { step: -1 }))}
        {d.number > 0 && button('reload', 'r', 'reload', () => openDiff($, d.number))}
      </Box>
    )
    if (!cur) {
      const status =
        isMine && d.status === 'loading'
          ? line(`Loading #${d.number}…`, { dimColor: true })
          : isMine && d.status === 'error'
            ? problem(`#${d.number}: ${d.error ?? ''}`)
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

    const summaries = cur.data.entries.map(summaryOf)
    const got = at >= 0 ? cur.files.get(at)?.got : undefined
    const shown = got?.file ?? (at >= 0 ? summaries[at] : undefined)
    const opened = [
      shown && line(`${at + 1}/${count} ${fileLabel(shown)}`, { bold: true }),
      ...(shown?.notes ?? []).map(n => line(`  ${n}`, { dimColor: true })),
      f?.status === 'loading' && line('Loading…', { dimColor: true }),
      f?.status === 'error' && problem(f.error ?? ''),
      f?.fault !== undefined && problem(f.fault),
      got?.isCut === true && line('  patch over 4 MiB: only its start was read', { dimColor: true }),
    ]
    const body = got ? drawn(got.file, width, b, LIST_BUDGET) : undefined
    // drawn() produced and charged each hunk's title and source; they are drawn as given.
    const hunks = (body?.runs ?? []).map(r => [
      <Text wrap="truncate-end" color="subtle">
        {r.title}
      </Text>,
      <Code source={r.source} format="diff" path={shown?.path} wrap="truncate-end" />,
    ])
    const rest = body?.note !== undefined && (
      <Text wrap="truncate-end" dimColor>
        {body.note}
      </Text>
    )
    const rule = line('─'.repeat(Math.min(cols, 80)), { dimColor: true })
    const shownList = listed(
      summaries.map((s, i) => clip(clean(`${i === at ? '▸ ' : '  '}${fileLabel(s)}`), width)),
      b,
    )
    const list = shownList.labels.map((label, i) => (
      <Button key={`goto:${i}`} plain onPress={() => start($, openFile($, i))}>
        {label}
      </Button>
    ))
    const more = shownList.note !== undefined && (
      <Text wrap="truncate-end" dimColor>
        {shownList.note}
      </Text>
    )
    return (
      <Box flexDirection="column">
        {head}
        {controls}
        {opened}
        {hunks}
        {rest}
        {rule}
        {list}
        {more}
      </Box>
    )
  })
}
