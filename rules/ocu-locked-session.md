# ocu on a locked Mac

Binds at an `ocu js` call made outside the ocu-agent MCP tools — run directly, or by a script that makes one. For those tools, the ocu-agent PreToolUse hook (`ocu-agent/hooks/locked-session-guard.sh`) does the same.

- **Before the call, read `ocu locked-use status --json`** (`session.state`, `available`).
  - Locked, `available` true → start `caffeinate -u -t 120` detached unless one is already running, wait 2 s, then make the call.
  - Locked, `available` false → make no call; report the cause. Enabling Locked Use (`ocu locked-use enable`) is the user's act.
- **"Locked Use could not observe a protected GUI session becoming unlocked"** means the display was off: wake it again as above and retry once. The same failure on the retry is the finding; report it with that cause.
- **Locked Use opens the session for the run and leaves it open after the run.** The Mac's own auto-lock closes it again. Add no relock step.
- **Window content on a locked Mac is reached through ocu's Locked Use, not raw AX.** A process calling `AXUIElement` directly gets each window back as the application element with only the menu bar beneath it.
