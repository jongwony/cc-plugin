---
name: clawd-toggle
description: >
  This skill should be used when the user asks to "start clawd", "stop clawd",
  "toggle clawd", "launch clawd on desk", "kill clawd", "run the desktop pet",
  or mentions starting/stopping the clawd-on-desk Electron app.
  Toggles `npm start` for clawd-on-desk as a tracked background process.
---

# Clawd on Desk Toggle

Run the toggle script and report the result:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/toggle.sh"
```

- Output `STARTED` → clawd-on-desk launched in the background (logs at `/tmp/clawd-on-desk.log`).
- Output `STOPPED` → the background process tree (npm → node → electron) terminated.

Override the repo location with the `CLAWD_ON_DESK_DIR` env var when the project
lives elsewhere.

Respond concisely in one line with the current state (running/stopped).
