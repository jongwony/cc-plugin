# ocu on a locked Mac

Binds at every ocu call — an ocu-agent MCP tool, or `ocu js` run directly or by a script — and before delegating to the `ocu-agent:ocu-operator` agent, which has no shell to wake the display itself.

- **Before the call, read `ocu locked-use status --json`** (`session.state`, `available`).
  - Locked, `available` true → start `caffeinate -u -t 120` detached unless `pgrep -f 'caffeinate -u'` finds one (only a `-u` caffeinate keeps the display on), wait 2 s, then make the call or the delegation.
  - Locked, `available` false → make no call; report the cause. Enabling Locked Use (`ocu locked-use enable`) is the user's act.
- **"Locked Use could not observe a protected GUI session becoming unlocked"** means the display was off: wake it again as above and retry once. The same failure on the retry is the finding; report it with that cause.
- **Locked Use opens the session for the run and leaves it open after the run.** The Mac's own auto-lock closes it again. Add no relock step.
- **Window content on a locked Mac is reached through ocu's Locked Use, not raw AX.** A process calling `AXUIElement` directly gets each window back as the application element with only the menu bar beneath it.
