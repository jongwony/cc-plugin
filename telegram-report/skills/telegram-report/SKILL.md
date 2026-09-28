---
name: telegram-report
description: |
  This skill should be used when a scheduled routine finishes and its routine
  file names a Telegram thread id to report into, or when the user asks to
  "send the routine report to Telegram". Posts one message into that fixed
  forum topic; send only.
---

# Telegram report — one message per routine run

## Prerequisites

- `bash`, `curl`, `python3` on PATH.
- `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in the session environment (a cloud
  environment's variables). Nothing is read from a file.

## Send

At the end of the run, after the final report is composed:

```bash
printf '%s' "<report>" | bash <checkout>/telegram-report/scripts/tg-report.sh <thread-id> -
```

- `<thread-id>` is the one the routine file records. Never create a topic or pick another id.
- `<report>` is the final report condensed to fit 4096 characters: the routine's name on the
  first line, then the outcome. A failed run says what failed.
- One message per run, including a run with nothing to do.

## Outcome

- Exit 0 prints `sent thread=… message_id=…`.
- Exit 3 (credentials missing) or 5 (send failed, with Telegram's `description`): state it in
  the final message and stop. Do not retry through another channel.

## Boundaries

- Send only; never call an update-reading Bot API method. The group's resident bridge is the
  bot's only reader, and a second reader breaks it.
- Never put a token, a chat id, or an environment dump in the text.
