import type { EngineInterface, Register } from 'claude-code'

type Direction = 'left' | 'right'

const SPLIT = `on run argv
  set ttyPath to item 1 of argv
  tell application "Ghostty"
    try
      set t to first terminal whose tty is ttyPath
    on error errorMessage number errorNumber
      if errorNumber is -1719 or errorNumber is -1728 then return
      error errorMessage number errorNumber
    end try
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

const FORK_OUTPUT_WINDOW_MS = 10_000

// The id in /fork's confirmation, `session <state> · [<name> · ]<8 hex>[ · <chip>]`, or undefined.
const forkId = (text: string) => {
  const body = text.match(/<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/)?.[1] ?? text
  const segments = body.trim().split(' · ')
  if (!segments[0]?.startsWith('session ')) return undefined
  return segments.slice(1).filter(segment => /^[0-9a-f]{8}$/.test(segment)).pop()
}

const textOf = (content: readonly { type: string; text?: unknown }[]) =>
  content.map(block => (block.type === 'text' && typeof block.text === 'string' ? block.text : '')).join('')

type Claim = { cwd: string }

// /fork runs waiting for their confirmation rows, oldest first. A row consumes the oldest claim;
// otherwise the claim's own timer, or its abandoned or failed dispatch, removes it.
const claims: Claim[] = []

// Removes `claim` if it is still queued; true when it was.
const release = (claim: Claim) => {
  const at = claims.indexOf(claim)
  if (at < 0) return false
  claims.splice(at, 1)
  return true
}

// True only in a session drawn by Ghostty on macOS. A completed probe (true or false) is cached per load;
// one that throws or whose uname exits nonzero is retried.
let inGhostty: boolean | undefined
const ghostty = async ($: EngineInterface) => {
  if (inGhostty !== undefined) return inGhostty
  try {
    if ((await $.env.get('TERM_PROGRAM')) !== 'ghostty') return (inGhostty = false)
    const os = await $.process.run(['uname', '-s'])
    if (os.exitCode !== 0) return false
    return (inGhostty = os.stdout.trim() === 'Darwin')
  } catch {
    return false
  }
}

// Splits the Ghostty terminal whose tty is this session's and types `command` into the new pane.
// No Ghostty terminal with that tty: nothing happens. Other failures toast.
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

export const register: Register = on => {
  // Passes every row through unchanged; a main-loop local_command row carrying /fork's id starts the right split.
  on('session.append', async ($, e, next) => {
    if (claims.length === 0) return next(e)
    if (e.message.type !== 'system' || e.message.name !== 'local_command' || e.agentId) return next(e)
    const id = forkId(textOf(e.message.content))
    const claim = id ? claims.shift() : undefined
    if (id && claim) void split($, claim.cwd, 'right', `claude attach ${id}`)
    return next(e)
  }).catch(($, e, next) => next(e))

  // Starts the left split with the original session once /branch has moved this process onto the branch.
  on('command.run', { command: 'branch' }, async ($, e, next) => {
    if (e.origin.kind !== 'composer' || !(await ghostty($))) return next(e)
    const cwd = await $.session.cwd()
    const before = await $.session.id()
    const ran = await next(e)
    if (!next.signal.aborted && (await $.session.id()) !== before) {
      void split($, cwd, 'left', `claude --resume ${before}`)
    }
    return ran
  }).catch(($, e, next) => next(e))

  // Queues a claim for /fork's confirmation row and returns the command's result at once.
  // The claim's timer, started at arming, removes it after the window and toasts if no row consumed it;
  // an abandoned or failed dispatch removes it without a toast.
  on('command.run', { command: 'fork' }, async ($, e, next) => {
    if (e.origin.kind !== 'composer' || !(await ghostty($))) return next(e)
    const claim: Claim = { cwd: await $.session.cwd() }
    claims.push(claim)
    void $.process
      .run(['sleep', String(FORK_OUTPUT_WINDOW_MS / 1000)], { timeoutMs: FORK_OUTPUT_WINDOW_MS + 5_000 })
      .then(
        () => release(claim) && $.ui.toast(`no session id in /fork's output`),
        () => release(claim),
      )
    try {
      const ran = await next(e)
      if (next.signal.aborted) release(claim)
      return ran
    } catch (err) {
      release(claim)
      throw err
    }
  }).catch(($, e, next) => next(e))
}
