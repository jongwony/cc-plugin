# Routine: intake for RootProto

This file is the prompt a scheduled cloud routine follows. The routine's own
prompt only points here, so every change to what it does lands as a commit.

- Read `intake/skills/intake/SKILL.md` in this checkout and follow it for the
  Linear team **RootProto**.
- Reach Linear only through the `linear-personal` MCP server (the rootproto
  workspace). Any other Linear connector belongs to a different workspace; do
  not call it.
- If `linear-personal` is unavailable or unauthenticated, stop and say so in
  the final message. Do not fall back to another channel.
- No one reads this run live. The skill's after-the-fact report is the final
  message, including when nothing was in Triage.
- Send that final report to Telegram topic `routine: intake-rootproto`
  (thread id **2862**) by following `telegram-report/skills/telegram-report/SKILL.md`
  in this checkout, with its script at `telegram-report/scripts/tg-report.sh`.
  If `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` are absent or the send fails,
  say so in the final message and do not retry through another channel.
- Do not modify, commit or push anything in this repository.
