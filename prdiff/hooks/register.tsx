import { atom, read } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { PrdiffDiff } from '../types'
import { loadDiff, type DiffData, type Run } from './git.ts'
import { clean, summaryOf, type FileDiff } from './parse.ts'
import { Budget, CHAR_BUDGET, LIST_BUDGET, clip, drawn, fileLabel } from './rows.ts'

export const PANE = 'prdiff'

const diffRef = { plugin: 'prdiff', key: 'diff' } as const
const diff = atom(diffRef, { status: 'idle', gen: 0, number: 0 } as PrdiffDiff)

function runner($: EngineInterface): Run {
  return async (argv, timeoutMs, env) => {
    const r = await $.process.run(argv, { ...(timeoutMs === undefined ? {} : { timeoutMs }), ...(env === undefined ? {} : { env }) })
    return { exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr, isStdoutTruncated: r.isStdoutTruncated }
  }
}

function message(err: unknown): string {
  return clean(err instanceof Error ? err.message : String(err))
}

// The newest load; an older one that finishes later is dropped. Starts at the
// clock: above any gen an earlier instance of this module wrote.
let diffGen = Date.now()
// The PR's inventory and the files read so far live here, under the load that
// read them; `$.state` carries the status. A hot reload empties it, and the
// pane then offers to load again.
// A file's entry is its read: in flight until `got` is set; a failed read leaves no entry.
let held: { gen: number; data: DiffData; files: Map<number, { read: Promise<void>; got?: { file: FileDiff; isCut: boolean } }> } | undefined

/**
 * Rewrites the stored diff state with `fn(now)`, only over the `now` it was
 * computed from (`ifVersion`); a write another one beat is computed again on
 * what that one stored. `fn` returns undefined to write nothing.
 */
async function update($: EngineInterface, fn: (now: PrdiffDiff) => PrdiffDiff | undefined): Promise<PrdiffDiff | undefined> {
  for (;;) {
    const now = await $.state.get(diffRef)
    const next = fn(now.value ?? { status: 'idle', gen: 0, number: 0 })
    if (next === undefined) return undefined
    if ((await $.state.set(diffRef, next, { ifVersion: now.version })).isSet) return next
  }
}

/** Writes the diff state for load `gen` while the stored state is still that load's. */
function putFor($: EngineInterface, gen: number, value: PrdiffDiff): Promise<PrdiffDiff | undefined> {
  return update($, now => (now.gen === gen ? value : undefined))
}

/** Loads PR #number and opens its first file. */
async function openDiff($: EngineInterface, number: number): Promise<void> {
  diffGen += 1
  const gen = diffGen
  // A load's first write replaces any older load's state, never a newer one's.
  if ((await update($, now => (now.gen > gen ? undefined : { status: 'loading', gen, number }))) === undefined) return
  let data: DiffData
  try {
    const ownSsh = (await Promise.all([$.env.get('GIT_SSH_COMMAND'), $.env.get('GIT_SSH')])).some(v => v !== undefined)
    data = await loadDiff(runner($), number, { ownSsh })
    if (gen !== diffGen) return
    held = { gen, data, files: new Map() }
    if ((await putFor($, gen, { status: 'ready', gen, number })) === undefined) return
  } catch (err) {
    await putFor($, gen, { status: 'error', gen, number, error: message(err) })
    return
  }
  if (data.entries.length > 0) await openFile($, 0)
}

/**
 * Opens a file of the newest load and brings the pane to its top, where the
 * file is drawn. A pick of the file already open or being read changes
 * nothing.
 */
async function openFile($: EngineInterface, index: number): Promise<void> {
  const cur = held
  const e = cur?.data.entries[index]
  if (!cur || cur.gen !== diffGen || !e) return
  const gen = cur.gen
  const started = await update($, now => {
    if (now.gen !== gen || now.status !== 'ready') return undefined
    if (now.file?.index === index && now.file.status !== 'error' && cur.files.has(index)) return undefined
    return { ...now, file: { index, pick: (now.file?.pick ?? 0) + 1, status: cur.files.get(index)?.got ? 'ready' : 'loading' } }
  })
  const pick = started?.file?.pick
  if (pick === undefined) return
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
  // What the pick's read and scroll end in is shown only while its pick is still the stored one.
  const settle = (change: Partial<NonNullable<PrdiffDiff['file']>>) =>
    update($, now => (now.gen === gen && now.file?.pick === pick ? { ...now, file: { ...now.file, ...change } } : undefined))
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
    void openDiff($, n)
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
    const button = (key: string, hotkey: string, label: string, press: () => Promise<void>) =>
      b.take(label) ? <Button key={key} plain hotkey={hotkey} label={label} onPress={press} /> : null
    const d = await read($, diff)
    // A state this module instance did not write is not loaded.
    const isMine = d.gen === diffGen
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
        {count > 0 && button('next', 'j', 'next file', () => openFile($, Math.min(count - 1, at + 1)))}
        {count > 0 && button('prev', 'k', 'prev', () => openFile($, Math.max(0, at - 1)))}
        {d.number > 0 && button('reload', 'r', 'reload', () => openDiff($, d.number))}
      </Box>
    )
    if (!cur) {
      const status =
        isMine && d.status === 'loading'
          ? line(`Loading #${d.number}…`, { dimColor: true })
          : isMine && d.status === 'error'
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

    const summaries = cur.data.entries.map(summaryOf)
    const got = at >= 0 ? cur.files.get(at)?.got : undefined
    const shown = got?.file ?? (at >= 0 ? summaries[at] : undefined)
    const opened = [
      shown && line(`${at + 1}/${count} ${fileLabel(shown)}`, { bold: true }),
      ...(shown?.notes ?? []).map(n => line(`  ${n}`, { dimColor: true })),
      f?.status === 'loading' && line('Loading…', { dimColor: true }),
      f?.status === 'error' && line(f.error ?? '', { color: 'error' }),
      f?.fault !== undefined && line(f.fault, { color: 'error' }),
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
    const moreNote = (n: number) => `${n} more files; j and k reach them`
    const keep = moreNote(summaries.length).length
    const list = []
    for (const [i, s] of summaries.entries()) {
      const label = clip(clean(`${i === at ? '▸ ' : '  '}${fileLabel(s)}`), width)
      if (b.left - label.length < keep || !b.take(label)) break
      list.push(
        <Button key={`goto:${i}`} plain onPress={() => openFile($, i)}>
          {label}
        </Button>,
      )
    }
    const more = list.length < summaries.length && line(moreNote(summaries.length - list.length), { dimColor: true })
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
