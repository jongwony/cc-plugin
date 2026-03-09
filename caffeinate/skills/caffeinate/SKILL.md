---
name: caffeinate
description: >
  This skill should be used when the user asks to "prevent sleep",
  "caffeinate", "keep awake", "stop sleeping", "clamshell mode sleep prevention",
  "toggle caffeinate", or mentions system sleep prevention on macOS.
  Toggles caffeinate -ims (idle, disk, system sleep prevention; display sleep allowed for battery saving).
---

# Caffeinate Toggle

Run the toggle script and report the result:

```bash
bash ~/.claude/cc-plugin/caffeinate/scripts/toggle.sh
```

- Output `STARTED` → sleep prevention activated (`caffeinate -ims`).
- Output `STOPPED` → sleep prevention deactivated.

Respond concisely in one line with the current state (active/inactive).
