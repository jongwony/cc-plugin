# ghostty-split-fork

A Claude Code mod that opens the other side of `/branch` and `/fork` in a new
Ghostty split beside the session you typed the command in. The built-in commands
run unchanged; the split opens once they finish, and nothing extra is added to the
conversation.

The original conversation always ends up on the left:

| Command | New pane | The pane you typed in |
| --- | --- | --- |
| `/branch` | on the **left**: `claude --resume <original session id>`, the conversation as it was before the branch | on the right, moved onto the new branch (built-in behaviour) |
| `/fork` | on the **right**: `claude attach <id>`, the new background session `/fork` started | on the left, still the original conversation |

Only a command you type at the prompt opens a split; one sent from Remote Control,
the SDK or another plugin runs the built-in alone.

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
(`TERM_PROGRAM=ghostty`), checked at the first `/branch` or `/fork` and remembered
for the rest of the load. Anywhere else both commands pass straight through: no
split, no toast, no extra delay. Inside a multiplexer running in Ghostty (tmux,
zellij), no Ghostty terminal owns the session's tty, so nothing happens either.

## How it finds the session

- `/branch` switches the running session to a new session id in place, so the mod
  reads the id before and after the command and resumes the original in the split.
- `/fork` does not hand its new session id to the mod, so the mod reads the
  confirmation line `/fork` prints, as the conversation keeps it:
  `session running · <name> · <id>` or `session waiting for a prompt · <id>`,
  optionally followed by a note such as `edits this checkout`. `/fork` itself
  returns at once; the split opens when that line arrives. One timer per `/fork`
  runs for about 10 seconds from Enter: if no line has arrived by then, a toast
  says so and no split opens. Several `/fork`s in a row each get their own pane,
  in the order the lines arrive.
- The split is made from the Ghostty terminal whose `tty` matches the session. If
  the session has no tty, a toast says so and no split opens.
- When `CLAUDE_CONFIG_DIR` is set, the new pane gets the same value, so
  `claude --resume` and `claude attach` look in the same place.

## Known limits

- The `/fork` output line is not a documented format. If a release rewords it,
  `/fork` still runs but no split opens and a toast says so.
- With agent view disabled (`CLAUDE_CODE_DISABLE_AGENT_VIEW`), `/fork` runs a
  subagent instead of a background session, so no split opens and a toast says
  so.
