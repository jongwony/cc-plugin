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

// True only in a session drawn by Ghostty on macOS; probed once per load.
let inGhostty: Promise<boolean> | undefined
const ghostty = ($: EngineInterface) =>
  (inGhostty ??= (async () => {
    if ((await $.env.get('TERM_PROGRAM')) !== 'ghostty') return false
    const os = await $.process.run(['uname', '-s'])
    return os.stdout.trim() === 'Darwin'
  })().catch(() => false))

// Splits the Ghostty terminal whose tty is this session's and types `command` into the new pane.
// No tty, or no Ghostty terminal with that tty: nothing happens. Other failures toast.
const split = async ($: EngineInterface, cwd: string, direction: Direction, command: string) => {
  try {
    const tty = (await $.process.run(['/bin/sh', '-c', 'ps -o tty= -p $PPID'])).stdout.trim()
    if (!tty || tty.startsWith('?')) return
    const ran = await $.process.run(['osascript', '-', `/dev/${tty}`, cwd, command, direction], {
      stdin: SPLIT,
    })
    if (ran.exitCode !== 0) $.ui.toast(ran.stderr.trim() || `osascript exited ${ran.exitCode}`)
  } catch (err) {
    $.ui.toast(String(err))
  }
}

export const register: Register = on => {
  // Passes every row through unchanged. A main-loop local_command row in /fork's confirmation grammar,
  // in a Ghostty session, starts a right split attached to the session it names.
  on('session.append', async ($, e, next) => {
    if (e.message.type !== 'system' || e.message.name !== 'local_command' || e.agentId) return next(e)
    const id = forkId(textOf(e.message.content))
    if (id && (await ghostty($))) void split($, await $.session.cwd(), 'right', `claude attach ${id}`)
    return next(e)
  }).catch(($, e, next) => next(e))

  // Starts the left split with the original session once /branch has moved this process onto the branch.
  on('command.run', { command: 'branch' }, async ($, e, next) => {
    if (!(await ghostty($))) return next(e)
    const cwd = await $.session.cwd()
    const before = await $.session.id()
    const ran = await next(e)
    if ((await $.session.id()) !== before) void split($, cwd, 'left', `claude --resume ${before}`)
    return ran
  }).catch(($, e, next) => next(e))
}
