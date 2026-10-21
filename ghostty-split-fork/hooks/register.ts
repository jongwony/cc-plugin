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
    if item 4 of argv is "left" then
      split t direction left with configuration cfg
    else
      split t direction right with configuration cfg
    end if
  end tell
end run`

const FORK_STATES = ['session running', 'session waiting for a prompt']

// The id in /fork's confirmation, `<local-command-stdout><state> · [<name> · ]<8 hex>[ · <chip>]</local-command-stdout>`
// on one line, or undefined.
const forkId = (text: string) => {
  const body = text.match(/^<local-command-stdout>([^\n]*)<\/local-command-stdout>$/)?.[1]
  if (body === undefined) return undefined
  const segments = body.trim().split(' · ')
  if (!FORK_STATES.includes(segments[0] ?? '')) return undefined
  return segments.slice(1).filter(segment => /^[0-9a-f]{8}$/.test(segment)).pop()
}

const textOf = (content: readonly { type: string; text?: unknown }[]) =>
  content.map(block => (block.type === 'text' && typeof block.text === 'string' ? block.text : '')).join('')

// This session's tty when it is drawn by Ghostty on macOS, else undefined; probed once per load.
let probe: Promise<string | undefined> | undefined
const domainTty = ($: EngineInterface) =>
  (probe ??= (async () => {
    if ((await $.env.get('TERM_PROGRAM')) !== 'ghostty') return undefined
    if ((await $.process.run(['uname', '-s'])).stdout.trim() !== 'Darwin') return undefined
    const tty = (await $.process.run(['/bin/sh', '-c', 'ps -o tty= -p $PPID'])).stdout.trim()
    return tty && !tty.startsWith('?') ? `/dev/${tty}` : undefined
  })().catch(() => undefined))

// Splits the Ghostty terminal whose tty is `tty` and types `command` into the new pane.
// No Ghostty terminal with that tty: nothing happens. Other failures toast.
const split = async ($: EngineInterface, tty: string, cwd: string, direction: Direction, command: string) => {
  try {
    const ran = await $.process.run(['osascript', '-', tty, cwd, command, direction], { stdin: SPLIT })
    if (ran.exitCode !== 0) $.ui.toast(ran.stderr.trim() || `osascript exited ${ran.exitCode}`)
  } catch (err) {
    $.ui.toast(String(err))
  }
}

export const register: Register = on => {
  // Stores every row unchanged. Once a main-loop local_command row in /fork's confirmation grammar is stored,
  // in a Ghostty session, starts a right split attached to the session it names.
  on('session.append', async ($, e, next) => {
    if (e.message.type !== 'system' || e.message.name !== 'local_command' || e.agentId) return next(e)
    const stored = await next(e)
    const id = forkId(textOf(stored.deny === undefined ? stored.message.content : e.message.content))
    const tty = id ? await domainTty($) : undefined
    if (id && tty) void split($, tty, await $.session.cwd(), 'right', `claude attach ${id}`)
    return stored
  }).catch(($, e, next) => next(e))

  // Starts the left split with the original session, from the session root, once /branch has moved
  // this process onto the branch.
  on('command.run', { command: 'branch' }, async ($, e, next) => {
    const tty = await domainTty($)
    if (!tty) return next(e)
    const root = await $.session.root()
    const before = await $.session.id()
    const ran = await next(e)
    if ((await $.session.id()) !== before) void split($, tty, root, 'left', `claude --resume ${before}`)
    return ran
  }).catch(($, e, next) => next(e))
}
