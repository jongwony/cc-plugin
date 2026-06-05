---
name: voice-dictation
description: >
  This skill should be used when the user asks to "start dictation", "stop dictation",
  "toggle voice dictation", "받아쓰기 켜기", "받아쓰기 꺼기", "음성 받아쓰기 토글",
  or mentions starting/stopping push-to-talk voice dictation.
  Toggles the push-to-talk whisper.cpp dictation daemon as a tracked background process.
---

# Voice Dictation Toggle

Run the toggle script and report the result:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/toggle.sh"
```

- Output `STARTED` → the dictation daemon launched in the background (logs at `/tmp/voice-dictation.log`).
- Output `STOPPED` → the dictation daemon terminated.

## Usage

While the daemon is running, **HOLD Right Option (⌥)** to record. Release to
transcribe via whisper.cpp and paste the text into the frontmost app.

## Permissions (one-time)

The daemon needs these macOS permissions, granted to the terminal app that
launches the toggle:

- **Microphone** — to record audio
- **Input Monitoring** — to detect the Right Option (⌥) hold
- **Accessibility** — to paste into the active window

After granting any permission, re-toggle the daemon to pick up the new access.

Respond concisely in one line with the current state (running/stopped).
