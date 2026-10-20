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

// The id in /fork's output line, `session running · <name> · <8 hex>`.
const FORK_OUTPUT = /session running · .* · ([0-9a-f]{8})(?:<|\s*$)/
const FORK_OUTPUT_WAIT_MS = 3_000

// Set while a /fork hook waits for the command's output row; called with the id it carries.
let onForkOutput: ((id: string) => void) | undefined

// True only in a session drawn by Ghostty on macOS; read once per load.
let inGhostty: Promise<boolean> | undefined
const ghostty = ($: EngineInterface) =>
  (inGhostty ??= (async () => {
    if ((await $.env.get('TERM_PROGRAM')) !== 'ghostty') return false
    const os = await $.process.run(['uname', '-s'])
    return os.stdout.trim() === 'Darwin'
  })().catch(() => false))

// Splits the Ghostty terminal whose tty is this session's and types `command` into the new pane; failures toast.
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
  // Passes every row through unchanged; hands a /fork output line's id to a waiting /fork hook.
  on('session.append', ($, e, next) => {
    if (onForkOutput) {
      for (const block of e.message.content) {
        const id = block.type === 'text' && typeof block.text === 'string' ? block.text.match(FORK_OUTPUT)?.[1] : undefined
        if (id) onForkOutput(id)
      }
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // Opens the original session in a split on the left once /branch has moved this process onto the branch.
  on('command.run', { command: 'branch' }, async ($, e, next) => {
    if (e.origin.kind !== 'composer' || !(await ghostty($))) return next(e)
    const cwd = await $.session.cwd()
    const before = await $.session.id()
    const ran = await next(e)
    if (next.signal.aborted) return ran
    if ((await $.session.id()) !== before) await split($, cwd, 'left', `claude --resume ${before}`)
    return ran
  }).catch(($, e, next) => next(e))

  // Attaches to the session /fork started in a split on the right; no id in its output within the wait → toast.
  on('command.run', { command: 'fork' }, async ($, e, next) => {
    if (e.origin.kind !== 'composer' || !(await ghostty($))) return next(e)
    const cwd = await $.session.cwd()
    const found = new Promise<string>(resolve => (onForkOutput = resolve))
    try {
      const ran = await next(e)
      const id =
        ran.text?.match(FORK_OUTPUT)?.[1] ??
        (await Promise.race([
          found,
          $.clock.sleep(FORK_OUTPUT_WAIT_MS, { signal: next.signal }).then(
            () => undefined,
            () => undefined,
          ),
        ]))
      if (next.signal.aborted) return ran
      if (id) await split($, cwd, 'right', `claude attach ${id}`)
      else $.ui.toast(`no session id in /fork's output`)
      return ran
    } finally {
      onForkOutput = undefined
    }
  }).catch(($, e, next) => next(e))
}
