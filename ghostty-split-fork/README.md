# ghostty-split-fork

A Claude Code mod that opens the other side of `/branch` and `/fork` in a Ghostty
split to the right of the session you typed the command in. The built-in commands
run unchanged; the split opens once they finish, and nothing extra is added to the
conversation.

| Command | The pane you typed in | New pane on the right |
| --- | --- | --- |
| `/branch` | moves onto the new branch (built-in behaviour) | `claude --resume <original session id>` — the conversation as it was before the branch |
| `/fork` | stays on the original conversation | `claude attach <id>` — the new background session `/fork` started |

## Requirements

- macOS.
- [Ghostty](https://ghostty.org) built with its AppleScript dictionary
  (`new surface configuration`, `split`, and a terminal's `tty`). Tested on
  Ghostty 1.3.2.
- Claude Code with function hooks (mods). Tested on Claude Code 2.1.304; the mod
  API is early access and may change between releases.
- `osascript` and `claude` on `PATH`.

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
(`TERM_PROGRAM=ghostty`), checked once per load at the first `/branch` or `/fork`. Anywhere else both
commands pass straight through: no split, no toast, no extra delay.

## How it finds the session

- `/branch` switches the running session to a new session id in place, so the mod
  reads the id before and after the command and resumes the original in the split.
- `/fork` does not hand its new session id to the mod, so the mod lists the
  background sessions in the current directory (`claude agents --json`) before the
  command, then polls for one new entry for up to 10 seconds afterwards. The
  `/fork` output can appear up to that long after you press Enter.
- The split is made from the Ghostty terminal whose `tty` matches the session,
  falling back to the focused terminal.

## Known limits

- If two background sessions start in the same directory within those 10 seconds,
  the fork cannot be told apart: no split opens and a toast says so.
- With agent view disabled (`CLAUDE_CODE_DISABLE_AGENT_VIEW`), `/fork` runs a
  subagent instead of a background session, so no split opens.
