import { atom, read } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { PrdiffDiff } from '../types'
import { loadDiff, type DiffData, type Run } from './git.ts'
import { clean, summaryOf, type FileDiff } from './parse.ts'
import { CHAR_BUDGET, LIST_BUDGET, clip, drawn, fileLabel, fitting } from './rows.ts'

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
// The file last picked, under the load it belongs to; a read for any other is not shown.
let picked: { gen: number; index: number } | undefined
// The PR's inventory and the files read so far live here, under the load that
// read them; `$.state` carries the status. A hot reload empties it, and the
// pane then offers to load again.
let held: { gen: number; data: DiffData; files: Map<number, { file: FileDiff; isCut: boolean }> } | undefined

async function openDiff($: EngineInterface, number: number): Promise<void> {
  diffGen += 1
  const gen = diffGen
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

async function openFile($: EngineInterface, index: number): Promise<void> {
  const cur = held
  const e = cur?.data.entries[index]
  if (!cur || cur.gen !== diffGen || !e) return
  const gen = cur.gen
  picked = { gen, index }
  const show = async (file: NonNullable<PrdiffDiff['file']>) => {
    if (diffGen !== gen || picked?.gen !== gen || picked.index !== index) return
    await $.state.set(diffRef, { status: 'ready', gen, number: cur.data.number, file })
  }
  if (cur.files.has(index)) return show({ index, status: 'ready' })
  await show({ index, status: 'loading' })
  try {
    cur.files.set(index, await cur.data.readFile(e))
    await show({ index, status: 'ready' })
  } catch (err) {
    await show({ index, status: 'error', error: message(err) })
  }
}

/** Opens a file the person picked and brings the pane back to its top, where the file is drawn. */
async function showFile($: EngineInterface, index: number): Promise<void> {
  await openFile($, index)
  await $.ui.scroll({ in: PANE, to: 'start' }).catch(() => undefined)
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
    const line = (text: string, props: { dimColor?: boolean; bold?: boolean; color?: string } = {}) => (
      <Text wrap="truncate-end" {...props}>
        {clean(text)}
      </Text>
    )
    const d = await read($, diff)
    // A state this module instance did not write (a hot reload empties `held`) is not loaded.
    const isMine = d.gen === diffGen
    const cur = isMine && d.status === 'ready' && held?.gen === d.gen ? held : undefined
    const f = cur ? d.file : undefined
    const at = f?.index ?? -1
    const count = cur?.data.entries.length ?? 0
    const reload = d.number > 0 && <Button key="reload" plain hotkey="r" label="reload" onPress={() => void openDiff($, d.number)} />
    const controls = (
      <Box flexDirection="row" gap={1}>
        {count > 0 && <Button key="next" plain hotkey="j" label="next file" onPress={() => void showFile($, Math.min(count - 1, at + 1))} />}
        {count > 0 && <Button key="prev" plain hotkey="k" label="prev" onPress={() => void showFile($, Math.max(0, at - 1))} />}
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
    const got = at >= 0 ? cur.files.get(at) : undefined
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
          <Button key={`goto:${i}`} plain onPress={() => void showFile($, i)}>
            {clean(label)}
          </Button>
        ))}
        {listed < labels.length && line(`${labels.length - listed} more files; j and k reach them`, { dimColor: true })}
      </Box>
    )
  })
}
