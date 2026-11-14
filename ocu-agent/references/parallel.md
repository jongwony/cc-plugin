# Parallel ocu-operator runs

Read by a session about to run `ocu-operator` beside another ocu run or its own ocu calls. Browser work goes to `chrome-operator`, not here.

- **A fresh scope per run.** Before the runs start, prepare each run's own window or document — a new one where the app allows — read its window id at that moment, and hand each operator its app, window and work. No run then needs to open, raise or move a window.
- **Independence is this session's.** Split only work whose effects stay inside each run's scope. Work that reaches the same document, account or desktop-wide state runs in sequence.
- **Shared state and cleanup stay here.** The clipboard, the front app and run cleanup belong to this session; give `agent_display` only to a run no other ocu run can end beside.
- **A returned boundary is the user's.** An operator that stops on a modal, a foreground need or a wider scope hands this session a decision: hold that run and hand the decision to the user; real input follows `references/foreground.md`.

## Observed behavior

Measured on open-computer-use 1.1.2 in a macOS 27.2 guest; the first line also on 1.1.3 on the host.

- One session's operators share its one ocu MCP server, which serves one tool call at a time.
- `turn-ended` from another ocu process — this plugin's `SubagentStop` hook among them — restored windows parked on the agent display by an MCP server and by an `ocu js` process, one trial each.
- Launching an app that was not running brought it to the front, `open -g` included.
- An action that returned an error may have taken effect; a successful `type_text` has once taken effect twice.
- `query` with a window id bound `set_value` to that window, between two `ocu js` processes in TextEdit; `type_text` reached the app's main window. An app's own plugin can rule ocu input out (`kakao/skills/kakao/SKILL.md`).
