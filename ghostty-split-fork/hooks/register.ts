import type { EngineInterface, Register } from 'claude-code'

type Direction = 'left' | 'right'

const SPLIT = `on run argv
  if application "Ghostty" is not running then return
  set claudePid to (item 1 of argv) as integer
  tell application "Ghostty"
    try
      set t to first terminal whose pid is claudePid
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
    if item 5 of argv is "focus" and frontmost then focus t
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

// Splits the Ghostty terminal whose pid is this Claude's and types `command` into the new pane; with `keepFocus`
// and Ghostty frontmost, focus returns to that terminal. Nothing happens unless TERM_PROGRAM is ghostty, osascript
// exists, Ghostty is running and a terminal has this pid; every other failure toasts. Never rejects.
const split = async ($: EngineInterface, cwd: string, direction: Direction, command: string, keepFocus: boolean) => {
  try {
    if ((await $.env.get('TERM_PROGRAM')) !== 'ghostty') return
    const probe = 'command -v osascript >/dev/null && printf %s "$PPID"'
    const pid = (await $.process.run(['/bin/sh', '-c', probe], { cwd: '/' })).stdout.trim()
    if (!pid) return
    const ran = await $.process.run(['osascript', '-', pid, cwd, command, direction, keepFocus ? 'focus' : ''], { cwd: '/', stdin: SPLIT })
    if (ran.exitCode !== 0) $.ui.toast(ran.stderr.trim() || `osascript exited ${ran.exitCode}`)
  } catch (err) {
    try {
      $.ui.toast(String(err))
    } catch {}
  }
}

export const register: Register = on => {
  // Stores every row unchanged. Once a main-loop local_command row in /fork's confirmation grammar is stored,
  // starts a right split attached to the session it names.
  on('session.append', async ($, e, next) => {
    if (e.message.type !== 'system' || e.message.name !== 'local_command' || e.agentId) return next(e)
    const stored = await next(e)
    if (stored.deny !== undefined) return stored
    const id = forkId(textOf(stored.message.content))
    if (id) void split($, await $.session.root(), 'right', `claude attach ${id}`, false)
    return stored
  }).catch(($, e, next) => next(e))

  // Starts the left split with the original session, from the session root, once /branch has moved
  // this process onto the branch.
  on('command.run', { command: 'branch' }, async ($, e, next) => {
    const root = await $.session.root()
    const before = await $.session.id()
    const ran = await next(e)
    if ((await $.session.id()) !== before) void split($, root, 'left', `claude --resume ${before}`, true)
    return ran
  }).catch(($, e, next) => next(e))
}
