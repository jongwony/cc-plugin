# ocu on a locked Mac

- **A locked Mac does not end GUI work.** ocu's Locked Use opens the locked session for the run, so an ocu call on a locked Mac goes ahead wherever `ocu locked-use status --json` reports `available` true. The ocu-agent plugin's PreToolUse hook reads that status and wakes the display before each ocu MCP tool call, each Bash command that starts with `ocu`, and each delegation to the `ocu-agent:ocu-operator` agent.
- **A call the hook denies is reported with the cause it gives.** The session is locked and Locked Use is not available; enabling it (`ocu locked-use enable`) is the user's act.
- **`ocu` reached any other way — from inside a script, by a path — gets no hook.** Run `ocu locked-use status --json` as its own Bash command first: the hook wakes the display on it, and its output carries `session.state` and `available`.
- **"Locked Use could not observe a protected GUI session becoming unlocked"** means the display was off: retry once, and the hook wakes it again. The same failure on the retry is the finding; report it with that cause.
- **Locked Use opens the session for the run and leaves it open after the run.** The Mac's own auto-lock closes it again. Add no relock step.
- **Window content on a locked Mac is reached through ocu's Locked Use, not raw AX.** A process calling `AXUIElement` directly gets each window back as the application element with only the menu bar beneath it.
