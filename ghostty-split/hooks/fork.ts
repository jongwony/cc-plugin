import type { EngineInterface, Register } from 'claude-code'
import { forkId } from './fork-id.ts'

type Direction = 'left' | 'right'

const SPLIT = `on run argv
  if application "Ghostty" is not running then return
  set claudePid to (item 1 of argv) as integer
  tell application "Ghostty"
    try
      set t to first terminal whose pid is claudePid
    on error errorMessage number errorNumber
      if errorNumber is not -1719 and errorNumber is not -1728 then error errorMessage number errorNumber
      if not frontmost then return
      set t to focused terminal of selected tab of front window
      set viewerPid to (pid of t) as text
      tell current application to set viewer to do shell script "basename \"$(ps -o comm= -p " & viewerPid & ")\""
      if viewer is not "claude" then return
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

const textOf = (content: readonly { type: string; text?: unknown }[]) =>
  content.map(block => (block.type === 'text' && typeof block.text === 'string' ? block.text : '')).join('')

// Runs SPLIT with the pid of this sh's parent (this Claude), or exits 0 silently without osascript.
const SPAWN = 'command -v osascript >/dev/null || exit 0; exec osascript - "$PPID" "$@"'

// Splits the Ghostty terminal whose pid is this Claude's and types `command` into the new pane; with `keepFocus` and
// Ghostty frontmost, focus returns to that terminal. A background session has no terminal of its own: there the
// terminal split is the focused one of Ghostty's front window, and only while Ghostty is frontmost and that terminal's
// foreground process is a `claude` client. Nothing happens unless osascript exists, Ghostty is running and one of
// those terminals is found; every other failure toasts. Never rejects.
const split = async ($: EngineInterface, cwd: string, direction: Direction, command: string, keepFocus: boolean) => {
  try {
    const ran = await $.process.run(['/bin/sh', '-c', SPAWN, 'sh', cwd, command, direction, keepFocus ? 'focus' : ''], {
      cwd: '/',
      stdin: SPLIT,
    })
    if (ran.exitCode !== 0) $.ui.toast(ran.stderr.trim() || `osascript exited ${ran.exitCode}`)
  } catch (err) {
    try {
      $.ui.toast(String(err))
    } catch {}
  }
}

// A session started in a Ghostty pane, or a background session whose daemon was: the daemon's environment keeps
// TERM, never TERM_PROGRAM.
const inGhostty = async ($: EngineInterface) =>
  (await $.env.get('TERM_PROGRAM')) === 'ghostty' || (await $.env.get('TERM')) === 'xterm-ghostty'

export const register: Register = on => {
  // Stores every row unchanged. In a Ghostty session (inGhostty), once a main-loop local_command row in /fork's
  // confirmation grammar is stored, starts a right split attached to the session it names.
  on('session.append', async ($, e, next) => {
    if (e.message.type !== 'system' || e.message.name !== 'local_command' || e.agentId) return next(e)
    if (!(await inGhostty($))) return next(e)
    const stored = await next(e)
    const id = forkId(textOf(e.message.content))
    if (id) void split($, await $.session.root(), 'right', `claude attach ${id}`, false)
    return stored
  }).catch(($, e, next) => next(e))

  // In a Ghostty session, starts the left split with the original session, from the session root, once /branch has
  // moved this process onto the branch.
  on('command.run', { command: 'branch' }, async ($, e, next) => {
    if (!(await inGhostty($))) return next(e)
    const root = await $.session.root()
    const before = await $.session.id()
    const ran = await next(e)
    if ((await $.session.id()) !== before) void split($, root, 'left', `claude --resume ${before}`, true)
    return ran
  }).catch(($, e, next) => next(e))
}
