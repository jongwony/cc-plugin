# ghostty-split-fork

A Claude Code mod that opens the other side of `/branch` and `/fork` in a new
Ghostty split beside the session that ran the command. The built-in commands run
unchanged, and nothing extra is added to the conversation.

The original conversation always ends up on the left:

| Command | New pane | The pane you typed in |
| --- | --- | --- |
| `/branch` | on the **left**: `claude --resume <original session id>`, the conversation as it was before the branch | on the right, moved onto the new branch (built-in behaviour) |
| `/fork` | on the **right**: `claude attach <id>`, the new background session `/fork` started | on the left, still the original conversation |

The pane you typed in keeps focus.

## Requirements

- macOS.
- [Ghostty](https://ghostty.org) built with its AppleScript dictionary
  (`new surface configuration`, `split`, `focus`, and a terminal's `pid`).
  Tested on Ghostty 1.3.2.
- Claude Code with function hooks (mods). Tested on Claude Code 2.1.304 and
  2.1.305; the mod API is early access and may change between releases.
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

## Domain

The mod acts only when this Claude is the foreground process of a local Ghostty
terminal on macOS: the split is made from the Ghostty terminal whose process is
this Claude. Outside that, both commands run as built and the mod does nothing.
Inside it, an `osascript` failure, such as a denied Automation permission, shows
as a toast.

`/fork` detection relies on the confirmation line format of the tested Claude
Code versions, 2.1.304 and 2.1.305; other versions are outside the tested domain.
After `/cd` or a worktree move, `/branch`'s left pane can show Claude's own hint,
`cd … && claude --resume …`; follow it there.

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
- The new pane starts in Ghostty's own shell environment, not the environment
  the session was launched with.

## Known limits

- A session that depends on variables set when it was launched (a custom
  `CLAUDE_CONFIG_DIR`, provider or base-URL variables) is outside what the mod
  reproduces: `claude --resume` and `claude attach` in the new pane run without
  them.
- If `/fork` prints no short id and the session name is itself 8 hex digits, that
  name is taken as the id. Claude Code's own reading of the line has the same
  ambiguity.
- With agent view disabled (`CLAUDE_CODE_DISABLE_AGENT_VIEW`), `/fork` runs a
  subagent instead of a background session and prints no such line, so no pane
  opens.
