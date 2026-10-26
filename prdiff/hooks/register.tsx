import { atom, read } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { PrdiffDiff } from '../types'
import { loadDiff, type DiffData, type Run } from './git.ts'
import { clean, summaryOf, type FileDiff } from './parse.ts'
import { CHAR_BUDGET, LIST_BUDGET, clip, drawn, fileLabel, fitting } from './rows.ts'

export const PANE = 'prdiff'

const diffRef = { plugin: 'prdiff', key: 'diff' } as const
const failureRef = { plugin: 'prdiff', key: 'failure' } as const
const diff = atom(diffRef, { status: 'idle', gen: 0, number: 0 } as PrdiffDiff)
const failure = atom(failureRef, '')

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
// The file last picked, under the load it belongs to; a read for any other is not shown.
let picked: { gen: number; index: number } | undefined
// The PR's inventory and the files read so far live here, under the load that
// read them; `$.state` carries the status. A hot reload empties it, and the
// pane then offers to load again.
// A file's entry is its read: in flight until `got` is set; a failed read leaves no entry.
let held: { gen: number; data: DiffData; files: Map<number, { read: Promise<void>; got?: { file: FileDiff; isCut: boolean } }> } | undefined

/** Runs what a command or a press asks for; its failure, whatever step it came from, is drawn in the pane. */
async function act($: EngineInterface, fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
  } catch (err) {
    await $.state.set(failureRef, message(err))
  }
}

async function openDiff($: EngineInterface, number: number): Promise<void> {
  diffGen += 1
  const gen = diffGen
  await $.state.set(failureRef, '')
  await $.state.set(diffRef, { status: 'loading', gen, number })
  try {
    const ownSsh = (await Promise.all([$.env.get('GIT_SSH_COMMAND'), $.env.get('GIT_SSH')])).some(v => v !== undefined)
    const data = await loadDiff(runner($), number, { ownSsh })
    if (gen !== diffGen) return
    held = { gen, data, files: new Map() }
    await $.state.set(diffRef, { status: 'ready', gen, number })
    if (data.entries.length > 0) await openFile($, 0)
  } catch (err) {
    if (gen !== diffGen) return
    await $.state.set(diffRef, { status: 'error', gen, number, error: message(err) })
  }
}

/**
 * Opens a file of the newest load. A pick of the file already open or being
 * read does nothing; a person's pick that changes it also brings the pane to
 * its top, where the file is drawn.
 */
async function openFile($: EngineInterface, index: number, byPerson = false): Promise<void> {
  const cur = held
  const e = cur?.data.entries[index]
  if (!cur || cur.gen !== diffGen || !e) return
  const gen = cur.gen
  if (picked?.gen === gen && picked.index === index && cur.files.has(index)) return
  picked = { gen, index }
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
  const show = async (file: NonNullable<PrdiffDiff['file']>) => {
    if (diffGen !== gen || picked?.gen !== gen || picked.index !== index) return
    await $.state.set(diffRef, { status: 'ready', gen, number: cur.data.number, file })
  }
  const read = async () => {
    if (reading.got) return show({ index, status: 'ready' })
    await show({ index, status: 'loading' })
    try {
      await reading.read
      await show({ index, status: 'ready' })
    } catch (err) {
      await show({ index, status: 'error', error: message(err) })
    }
  }
  await Promise.all([read(), byPerson ? $.ui.scroll({ in: PANE, to: 'start' }) : undefined])
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
    void act($, () => openDiff($, n))
    return { text: `PR diff pane opened on #${n}.` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Code } = $.ui.resolve(e)
    const cols = Math.max(20, e.props.bodyColumns)
    const line = (text: string, props: { dimColor?: boolean; bold?: boolean; color?: string } = {}) => (
      <Text wrap="truncate-end" {...props}>
        {clean(text)}
      </Text>
    )
    const [d, failed] = await Promise.all([read($, diff), read($, failure)])
    const problem = failed !== '' && line(failed, { color: 'error' })
    // A state this module instance did not write (a hot reload empties `held`) is not loaded.
    const isMine = d.gen === diffGen
    const cur = isMine && d.status === 'ready' && held?.gen === d.gen ? held : undefined
    const f = cur ? d.file : undefined
    const at = f?.index ?? -1
    const count = cur?.data.entries.length ?? 0
    const reload = d.number > 0 && <Button key="reload" plain hotkey="r" label="reload" onPress={() => act($, () => openDiff($, d.number))} />
    const controls = (
      <Box flexDirection="row" gap={1}>
        {count > 0 && <Button key="next" plain hotkey="j" label="next file" onPress={() => act($, () => openFile($, Math.min(count - 1, at + 1), true))} />}
        {count > 0 && <Button key="prev" plain hotkey="k" label="prev" onPress={() => act($, () => openFile($, Math.max(0, at - 1), true))} />}
        {reload}
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
          {problem}
          {status}
        </Box>
      )
    }

    const dd = cur.data
    const summaries = dd.entries.map(summaryOf)
    const added = summaries.reduce((n, s) => n + s.added, 0)
    const deleted = summaries.reduce((n, s) => n + s.deleted, 0)
    const labels = summaries.map((s, i) => `${i === at ? '▸ ' : '  '}${clip(fileLabel(s), cols + 8)}`)
    const listed = fitting(labels, LIST_BUDGET)
    const got = at >= 0 ? cur.files.get(at)?.got : undefined
    const shown = got?.file ?? (at >= 0 ? summaries[at] : undefined)
    const body = got ? drawn(got.file, cols + 8, CHAR_BUDGET - LIST_BUDGET) : undefined
    return (
      <Box flexDirection="column">
        {line(`#${dd.number} ${dd.title}`, { bold: true })}
        {line(`${dd.baseRefName} ← ${dd.headRefName} · ${dd.entries.length} files +${added} −${deleted} · base ${dd.mergeBase.slice(0, 7)}`, {
          dimColor: true,
        })}
        {dd.notes.map(n => line(n, { color: 'warning' }))}
        {controls}
        {problem}
        {shown && line(`${at + 1}/${count} ${fileLabel(shown)}`, { bold: true })}
        {shown?.notes.map(n => line(`  ${n}`, { dimColor: true }))}
        {f?.status === 'loading' && line('Loading…', { dimColor: true })}
        {f?.status === 'error' && line(f.error ?? '', { color: 'error' })}
        {got?.isCut === true && line('  patch over 4 MiB: only its start was read', { dimColor: true })}
        {body?.runs.map(r => [
          line(r.title, { color: 'subtle' }),
          <Code source={r.source} format="diff" path={shown?.path} wrap="truncate-end" />,
        ])}
        {body !== undefined && body.left > 0 && line(`  ${body.left} more lines of this file are not drawn`, { dimColor: true })}
        {line('─'.repeat(Math.min(cols, 80)), { dimColor: true })}
        {labels.slice(0, listed).map((label, i) => (
          <Button key={`goto:${i}`} plain onPress={() => act($, () => openFile($, i, true))}>
            {clean(label)}
          </Button>
        ))}
        {listed < labels.length && line(`${labels.length - listed} more files; j and k reach them`, { dimColor: true })}
      </Box>
    )
  })
}
