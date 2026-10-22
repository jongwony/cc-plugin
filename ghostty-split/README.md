# ghostty-split

A Claude Code mod that opens the other side of `/branch` and `/fork` in a new
Ghostty split beside the session that ran the command. The built-in commands run
unchanged, and nothing extra is added to the conversation.

The original conversation always ends up on the left:

| Command | New pane | The pane you typed in |
| --- | --- | --- |
| `/branch` | on the **left**: `claude --resume <original session id>`, the conversation as it was before the branch | on the right, moved onto the new branch (built-in behaviour) |
| `/fork` | on the **right**: `claude attach <id>`, the new background session `/fork` started | on the left, still the original conversation |

`/branch` returns focus to the pane you typed in when Ghostty is frontmost at the
moment of the split. After `/fork` focus follows Ghostty's default for a new split.

## Requirements

- macOS.
- [Ghostty](https://ghostty.org) 1.3 or later with its AppleScript dictionary
  installed (`new surface configuration`, `split`, `focus`, and a terminal's
  `pid`), with AppleScript enabled (`macos-applescript`, on by default); with it
  off the mod cannot open panes. Tested on Ghostty 1.3.2.
- Claude Code with function hooks (mods). Tested on Claude Code 2.1.304, 2.1.305
  and 2.1.307 (a background session viewed in Ghostty); the mod API is early access and may change between releases.
- `osascript` on `PATH`, and `claude` on the `PATH` of the shell a new Ghostty pane starts.
- That shell must not prompt at startup: the mod types the `claude` command into it.

## Install

The marketplace's install-all script leaves this plugin out, since it drives a
macOS-only facility. Install it deliberately:

```bash
claude plugin marketplace add jongwony/cc-plugin
claude plugin install ghostty-split@cc-plugin
```

Then `/reload-plugins` in a running session.

The first time the mod opens a split, macOS asks whether the terminal may control
Ghostty (System Settings → Privacy & Security → Automation). Allow it; until then
no split opens and a toast shows the `osascript` error.

## Domain

A **candidate** session runs on macOS with `TERM_PROGRAM=ghostty`, or
`TERM=xterm-ghostty`, while Ghostty is running. The second form admits a
background session (one `/fork` or `--bg` started) whose Claude daemon was
launched from Ghostty: the daemon's environment keeps `TERM` but not
`TERM_PROGRAM`.

The **domain** is a candidate where one of two terminals is found, and the split
is made from it:

- **Its own terminal**: the Ghostty terminal whose reported pid is this Claude's.
  This rests on Claude being launched directly in the pane, not through a
  launcher that forks it, so it leads the pane's foreground process group.
- **The terminal viewing it**: a background session has no terminal of its own;
  it runs under the daemon, and the pane showing it runs a `claude` client. When
  no terminal has this Claude's pid, the split is made from the focused terminal
  of Ghostty's front window, only while Ghostty is frontmost and that terminal's
  foreground process is `claude`. That is the pane the command was just typed
  in. Viewed from the mobile app, Ghostty is not frontmost, so nothing opens.
  The mod API names no attached client's pid or tty, so focus is the signal: a
  focus moved to another `claude` pane in the moment before the hook fires puts
  the split beside that pane.

- A session that is not a candidate is untouched: both commands run as built.
- Inside a candidate, any `osascript` failure, before or after membership is
  decided, shows as a toast: a denied Automation permission, a call that times
  out, or an older Ghostty without the AppleScript dictionary. Until Automation
  access to Ghostty is allowed, membership cannot be decided, so such a toast can
  appear in any candidate.

`/fork` detection relies on the confirmation line format of the tested Claude
Code versions, 2.1.304, 2.1.305 and 2.1.307; other versions are outside the tested domain.
The signal is that confirmation line exactly as `/fork` produced it: the mod
reads the row before other plugins' hooks on the stored row may rewrite it, so a
rewrite elsewhere does not change what the mod sees. It also presumes that no
other command in the session prints a line in that format; if one does, a
`claude attach` pane opens for it.
After `/cd` or a worktree move, `/branch`'s left pane can show Claude's own hint,
`cd … && claude --resume …`; follow it there.

## How it finds the session

- `/branch` switches the running session to a new session id in place, so the mod
  reads the id before and after the command and resumes the original in the split.
- `/fork` does not hand its new session id to the mod. Its confirmation line is
  the trigger instead: when the conversation keeps a line
  `session running · <name> · <id>` or `session waiting for a prompt · <id>`
  (optionally followed by a note such as `edits this checkout`), the right pane
  opens with `claude attach <id>`. Only `/fork` prints that line. If it never
  lands in the conversation, no pane opens and nothing is shown.
- Both kinds of pane start in the session's project root, in Ghostty's own shell
  environment rather than the environment the session was launched with.

## Known limits

- New panes run `claude` from Ghostty's own shell `PATH` with default options;
  flags the original session was launched with are not reproduced.
- Whether `claude --resume <id>` (the left pane after `/branch`) or
  `claude --resume <id> --fork-session` keeps old `/fork` confirmation rows again
  through the mod's hook was not verified; if it does, extra attach panes can
  open.
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
