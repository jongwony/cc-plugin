# Dark or locked Mac

Binds before an act that reads or drives a window on this Mac's screen — an ocu call (an ocu-agent MCP tool, or `ocu js` run directly or by a script), a raw Accessibility read, an app plugin's AX helper — before delegating to an agent that makes such acts without a shell (`ocu-agent:ocu-operator`), and when such an act fails or returns a window without its content. Chrome through the Claude in Chrome extension is outside it: it works on a locked or dark Mac with no wake.

- **A locked Mac does not end GUI work.** ocu's Locked Use opens the locked session for the run wherever `ocu locked-use status --json` reports `available` true, and it needs the display on.
- **Before the act, read `ocu locked-use status --json`** (`session.state`). Where it reads locked, and after the act failed, read the ocu-agent plugin's `references/locked-session.md` before the act or the retry: it carries the display wake, the order of readers, and what each failure means.
