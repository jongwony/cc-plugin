# Parallel ocu-operator runs

Read by a session about to delegate more than one `ocu-operator` run at once. Browser work goes to `chrome-operator`, not here.

- **A fresh scope per run.** Before the runs start, prepare each run's own window or document — a new one where the app allows — read its window id at that moment, and hand each operator its app, window and work. No run then needs to open, raise or move a window.
- **Independence is this session's.** Split only work whose effects stay inside each run's scope. Work that reaches the same document, account or desktop-wide state runs in sequence.
- **Shared state and cleanup stay here.** The clipboard, the front app, windows parked on the agent display and run cleanup belong to this session; give `agent_display` only to a run no other ocu run can end beside.
- **A returned boundary is the user's.** An operator that stops on a modal, a foreground need or a wider scope hands this session a decision: hold that run and hand the decision to the user; real input follows `references/foreground.md`.

## Observed behavior

Measured on open-computer-use 1.1.2 (macOS 27.2 guest) and 1.1.3 (host).

- One session's operators share its one ocu MCP server, which serves one tool call at a time.
- `turn-ended` from any ocu process — this plugin's `SubagentStop` hook among them — restores windows parked on the agent display by every ocu session.
- Launching an app that is not running brings it to the front, `open -g` included.
- An action that returned an error may have taken effect; a successful `type_text` has once taken effect twice.
- `query` with a window id binds element actions to that window; a per-window split was measured with `set_value` in TextEdit only, and an app's own plugin can rule ocu input out (`kakao/skills/kakao/SKILL.md`).
