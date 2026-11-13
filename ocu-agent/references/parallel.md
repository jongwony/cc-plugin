# Running several ocu-operators at once

Read by a session about to delegate more than one `ocu-operator` run at the same time.

- **One app per concurrent run.** `type_text` and `press_key` reach only the app's current main window, so two runs that type into one app collide. Two runs share an app only when one of them works solely through element actions (`set_value`, `click`) on indices that `query` returned for another window's `window_id`.
- **Runs from one session queue.** Every run delegated from this session goes through its one ocu MCP server, which serves one tool call at a time: the runs interleave, they do not act simultaneously. Actions overlap only across separate ocu processes — runs delegated from different sessions, or `ocu js` processes.
- **No clipboard in the brief.** The pasteboard is shared by every run and the user; brief text entry as `set_value` or `type_text`.
- **`agent_display` only for a run that is alone.** Each run's end sends `turn-ended` (the plugin's `SubagentStop` hook), which restores every window any ocu session parked, including a sibling run's.
- **Launch the target apps before the runs start, then bring the user's app back to the front.** Launching an app that is not running brings it to the front, `open -g` included; ocu's reads and background actions do not.
