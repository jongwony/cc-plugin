---
name: slack-thread
description: |
  This skill should be used when the user asks to "fetch Slack thread",
  "get thread content", "read Slack conversation", "slack-thread",
  or provides a Slack thread URL. Fetches and formats thread messages.
user_invocable: true
context: fork
---

# Slack Thread Skill

Fetch and format Slack thread conversations using the packaged script.

## Prerequisites

- `SLACK_USER_TOKEN` or `SLACK_BOT_TOKEN` environment variable
- User token: access threads in channels you belong to
- Bot token: access all channels the bot is added to

## Workflow

1. Extract thread URL from user request
2. Run script with `--help` to confirm current options
3. Execute fetch with the URL
4. Present formatted conversation
5. Offer to search for related messages via slack-search if needed

## Quick Reference

```bash
# Zero-context: always check options first
${CLAUDE_PLUGIN_ROOT}/scripts/slack-thread.py --help

# Basic execution
${CLAUDE_PLUGIN_ROOT}/scripts/slack-thread.py "https://workspace.slack.com/archives/C.../p..."
```

## Integration with slack-search

Typical workflow: search -> find message -> fetch full thread

```bash
# 1. Search for messages
${CLAUDE_PLUGIN_ROOT}/scripts/slack-search.py "API migration"

# 2. Get thread details from permalink in results
${CLAUDE_PLUGIN_ROOT}/scripts/slack-thread.py "<permalink>"
```

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| channel_not_found | No access to channel | Check token permissions or channel membership |
| not_in_channel | Bot not added | Add bot to channel or use user token |
