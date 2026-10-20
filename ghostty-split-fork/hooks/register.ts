import type { EngineInterface, Register } from 'claude-code'

const SPLIT = `on run argv
  set ttyPath to item 1 of argv
  tell application "Ghostty"
    try
      set t to first terminal whose tty is ttyPath
    on error
      set t to focused terminal of selected tab of front window
    end try
    set cfg to new surface configuration
    set initial working directory of cfg to item 2 of argv
    set initial input of cfg to (item 3 of argv) & linefeed
    split t direction right with configuration cfg
  end tell
end run`

// The mod acts only in a session drawn by Ghostty on macOS; read once per load.
let inGhostty: Promise<boolean> | undefined
const ghostty = ($: EngineInterface) =>
  (inGhostty ??= $.process
    .run(['/bin/sh', '-c', 'printf "%s %s" "$TERM_PROGRAM" "$(uname -s)"'])
    .then(r => r.stdout === 'ghostty Darwin', () => false))

// Splits the Ghostty terminal this session draws in and types `command` into the new pane.
const split = async ($: EngineInterface, command: string) => {
  try {
    const tty = await $.process.run(['/bin/sh', '-c', 'ps -o tty= -p $PPID'])
    const ran = await $.process.run(
      ['osascript', '-', `/dev/${tty.stdout.trim()}`, await $.session.cwd(), command],
      { stdin: SPLIT },
    )
    if (ran.exitCode !== 0) $.ui.toast(`${$.plugin.name}: ${ran.stderr.trim()}`)
  } catch (err) {
    $.ui.toast(`${$.plugin.name}: ${String(err)}`)
  }
}

type Listed = { id: string; cwd: string; kind: string }

const backgrounds = async ($: EngineInterface, cwd: string) => {
  const listed = await $.process.run(['claude', 'agents', '--json'])
  const rows = JSON.parse(listed.stdout) as Listed[]
  return rows.filter(r => r.kind === 'background' && r.cwd === cwd).map(r => r.id)
}

// /fork's result carries no id, so the fork is the background session that appears in this cwd after it.
const waitForked = async ($: EngineInterface, cwd: string, known: readonly string[]) => {
  for (let tries = 0; tries < 20; tries++) {
    const fresh = (await backgrounds($, cwd)).filter(id => !known.includes(id))
    if (fresh.length === 1) return fresh[0]
    await $.clock.sleep(500)
  }
  return undefined
}

export const register: Register = on => {
  // /branch moves this process onto the branch, so the split picks the original back up.
  on('command.run', { command: 'branch' }, async ($, e, next) => {
    if (!(await ghostty($))) return next(e)
    const before = await $.session.id()
    const ran = await next(e)
    if ((await $.session.id()) !== before) await split($, `claude --resume ${before}`)
    return ran
  }).catch(($, e, next) => next(e))

  // /fork copies the conversation into a background session; the split attaches to it.
  on('command.run', { command: 'fork' }, async ($, e, next) => {
    if (!(await ghostty($))) return next(e)
    const cwd = await $.session.cwd()
    const known = await backgrounds($, cwd)
    const ran = await next(e)
    const id = await waitForked($, cwd, known)
    if (id) await split($, `claude attach ${id}`)
    else $.ui.toast(`${$.plugin.name}: no new background session appeared after /fork`)
    return ran
  }).catch(($, e, next) => next(e))
}
