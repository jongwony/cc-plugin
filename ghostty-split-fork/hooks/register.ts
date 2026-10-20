import type { EngineInterface, Register } from 'claude-code'

type Direction = 'left' | 'right'

const SPLIT = `on run argv
  set ttyPath to item 1 of argv
  tell application "Ghostty"
    set t to first terminal whose tty is ttyPath
    set cfg to new surface configuration
    set initial working directory of cfg to item 2 of argv
    set initial input of cfg to (item 3 of argv) & linefeed
    if item 5 of argv is not "" then
      set environment variables of cfg to {"CLAUDE_CONFIG_DIR=" & item 5 of argv}
    end if
    if item 4 of argv is "left" then
      split t direction left with configuration cfg
    else
      split t direction right with configuration cfg
    end if
  end tell
end run`

const WINDOW_MS = 10_000

// The mod acts only in a session drawn by Ghostty on macOS; read once per load.
let inGhostty: Promise<boolean> | undefined
const ghostty = ($: EngineInterface) =>
  (inGhostty ??= (async () => {
    if ((await $.env.get('TERM_PROGRAM')) !== 'ghostty') return false
    const os = await $.process.run(['uname', '-s'])
    return os.stdout.trim() === 'Darwin'
  })().catch(() => false))

// Splits the Ghostty terminal this session draws in and types `command` into the new pane.
const split = async ($: EngineInterface, cwd: string, direction: Direction, command: string) => {
  try {
    const tty = (await $.process.run(['/bin/sh', '-c', 'ps -o tty= -p $PPID'])).stdout.trim()
    if (!tty || tty.startsWith('?')) return $.ui.toast(`no terminal found for this session`)
    const config = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? ''
    const ran = await $.process.run(['osascript', '-', `/dev/${tty}`, cwd, command, direction, config], {
      stdin: SPLIT,
    })
    if (ran.exitCode !== 0) $.ui.toast(ran.stderr.trim() || `osascript exited ${ran.exitCode}`)
  } catch (err) {
    $.ui.toast(String(err))
  }
}

const jobsDir = async ($: EngineInterface) => {
  const config = await $.env.get('CLAUDE_CONFIG_DIR')
  if (config) return `${config}/jobs`
  const home = await $.env.get('HOME')
  return home ? `${home}/.claude/jobs` : undefined
}

// Job ids under `jobs`: [] when the directory does not exist yet, undefined when it exists but cannot be listed.
const jobIds = async ($: EngineInterface, jobs: string) => {
  try {
    return (await $.fs.list(jobs)).filter(entry => entry.kind === 'dir').map(entry => entry.name)
  } catch {
    return (await $.fs.stat(jobs).then(() => true, () => false)) ? undefined : []
  }
}

// True when the job's state names `parent` as the session it was forked from.
const forkedFrom = async ($: EngineInterface, jobs: string, id: string, parent: string) => {
  try {
    const state = JSON.parse(await $.fs.read(`${jobs}/${id}/state.json`))
    return state.forkParentSessionId === parent
  } catch {
    return false
  }
}

// /fork's result carries no id, so the fork is the new job that records this session as its parent.
const waitForked = async (
  $: EngineInterface,
  signal: AbortSignal,
  jobs: string,
  parent: string,
  known: readonly string[],
) => {
  const deadline = (await $.clock.now()) + WINDOW_MS
  for (let tries = 0; !signal.aborted; tries++) {
    if (tries > 0) {
      if ((await $.clock.now()) >= deadline) return undefined
      await $.process.run(['sleep', '0.5'])
      if (signal.aborted) return undefined
    }
    for (const id of ((await jobIds($, jobs)) ?? []).filter(id => !known.includes(id))) {
      if (await forkedFrom($, jobs, id, parent)) return id
    }
  }
  return undefined
}

export const register: Register = on => {
  // /branch moves this process onto the branch, so the split picks the original back up on the left.
  on('command.run', { command: 'branch' }, async ($, e, next) => {
    if (e.origin.kind !== 'composer' || !(await ghostty($))) return next(e)
    const cwd = await $.session.cwd()
    const before = await $.session.id()
    const ran = await next(e)
    if ((await $.session.id()) !== before) await split($, cwd, 'left', `claude --resume ${before}`)
    return ran
  }).catch(($, e, next) => next(e))

  // /fork keeps this process on the original, so the split attaches to the fork on the right.
  on('command.run', { command: 'fork' }, async ($, e, next) => {
    if (e.origin.kind !== 'composer' || !(await ghostty($))) return next(e)
    const jobs = await jobsDir($)
    if (!jobs) return ($.ui.toast(`HOME is not set; no split`), next(e))
    const cwd = await $.session.cwd()
    const parent = await $.session.id()
    const known = await jobIds($, jobs)
    const ran = await next(e)
    if (!known) return ($.ui.toast(`cannot list ${jobs}; no split`), ran)
    const id = await waitForked($, next.signal, jobs, parent, known)
    if (next.signal.aborted) return ran
    if (id) await split($, cwd, 'right', `claude attach ${id}`)
    else $.ui.toast(`no background session from this /fork appeared`)
    return ran
  }).catch(($, e, next) => next(e))
}
