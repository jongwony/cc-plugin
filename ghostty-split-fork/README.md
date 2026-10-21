# ghostty-split-fork

A Claude Code mod that opens the other side of `/branch` and `/fork` in a new
Ghostty split beside the session that ran the command. The built-in commands run
unchanged, and nothing extra is added to the conversation.

The original conversation always ends up on the left:

| Command | New pane | The pane you typed in |
| --- | --- | --- |
| `/branch` | on the **left**: `claude --resume <original session id>`, the conversation as it was before the branch | on the right, moved onto the new branch (built-in behaviour) |
| `/fork` | on the **right**: `claude attach <id>`, the new background session `/fork` started | on the left, still the original conversation |

This holds however the command reached the session: typed at the prompt, or sent
from Remote Control, the SDK or another plugin to a session running in Ghostty.

## Requirements

- macOS.
- [Ghostty](https://ghostty.org) built with its AppleScript dictionary
  (`new surface configuration`, `split`, and a terminal's `tty`). Tested on
  Ghostty 1.3.2.
- Claude Code with function hooks (mods). Tested on Claude Code 2.1.304; the mod
  API is early access and may change between releases.
- `osascript` on `PATH`, and `claude` on the `PATH` of the shell a new Ghostty pane starts.

## Install

```bash
claude plugin marketplace add jongwony/cc-plugin
claude plugin install ghostty-split-fork@cc-plugin
```

Then `/reload-plugins` in a running session.

The first time the mod opens a split, macOS asks whether the terminal may control
Ghostty (System Settings → Privacy & Security → Automation). Allow it; until then
no split opens and a toast shows the `osascript` error.

## Outside Ghostty

The mod only acts in a session whose terminal is Ghostty on macOS
(`TERM_PROGRAM=ghostty`) and that has a tty of its own. That is probed once per
load; anywhere else both commands pass straight through: no split, no toast, no
extra delay. A probe that fails, even for a passing reason, leaves the mod inert
until the next reload (`/reload-plugins` or a restart). Inside a multiplexer
running in Ghostty (tmux, zellij), no Ghostty terminal owns the session's tty,
so nothing happens either.

## How it finds the session

- `/branch` switches the running session to a new session id in place, so the mod
  reads the id before and after the command and resumes the original in the split,
  started from the session's project root.
- `/fork` does not hand its new session id to the mod. Its confirmation line is
  the trigger instead: when the conversation keeps a line
  `session running · <name> · <id>` or `session waiting for a prompt · <id>`
  (optionally followed by a note such as `edits this checkout`), the right pane
  opens with `claude attach <id>`. Only `/fork` prints that line. If it never
  lands in the conversation, no pane opens and nothing is shown.
- The split is made from the Ghostty terminal whose `tty` matches the session. A
  session with no tty of its own, such as the background session inside an
  attach pane, is outside the mod's domain and opens nothing.
- The new pane starts in Ghostty's own shell environment, not the environment
  the session was launched with.

## Known limits

- The `/fork` confirmation line is not a documented format. If a release
  rewords it, `/fork` still runs and no pane opens.
- A session that depends on variables set when it was launched (a custom
  `CLAUDE_CONFIG_DIR`, provider or base-URL variables) is outside what the mod
  reproduces: `claude --resume` and `claude attach` in the new pane run without
  them.
- After `/cd` or a worktree move, the original transcript can be filed under a
  different directory than the session root. The left pane then shows Claude's
  own hint, `cd … && claude --resume …`; follow it there.
- If `/fork` prints no short id and the session name is itself 8 hex digits, that
  name is taken as the id. Claude Code's own reading of the line has the same
  ambiguity.
- With agent view disabled (`CLAUDE_CODE_DISABLE_AGENT_VIEW`), `/fork` runs a
  subagent instead of a background session and prints no such line, so no pane
  opens.
