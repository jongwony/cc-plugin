# Running several ocu-operators at once

Read by a session about to delegate more than one `ocu-operator` run at the same time.

- **One app per concurrent run, by default.** `type_text` and `press_key` reach the app's current main window, so two runs that type into one app collide. Share an app only for an operation established to stay in its own window without moving the other run's input target, and only where the app's own boundary allows it — `kakao/skills/kakao/SKILL.md` rules out OCU input on KakaoTalk chat windows, for example.
- **Do not assume parallel delegation runs at the same time.** Calls through one ocu MCP server can queue behind each other. Before relying on overlap, check which `open-computer-use mcp` or `ocu js` process each run's calls go through.
- **No clipboard in the brief.** The pasteboard is shared by the runs and the user; brief text entry as `set_value` or `type_text`.
- **`agent_display` only for a run that is alone.** An operator's end sends `turn-ended` (the plugin's `SubagentStop` hook), which can restore another run's parked windows, including those of runs from other sessions. Alone means no other ocu run, from any session, can end while the window is parked.
- **Prepare non-running target apps before delegating.** Launching can bring an app to the front, `open -g` included; return the user's front app afterwards. If background work changes the front app, stop and report it.
