---
name: slack-search
description: |
  This skill should be used when the user asks to "search Slack", "find Slack messages",
  "look up Slack conversations", "search in Slack workspace", or mentions "slack search",
  "find in slack". Searches Slack messages via CLI tool.
user_invocable: true
context: fork
---

# Slack Search Skill

Search Slack workspace messages using the packaged script.

## Prerequisites

- `SLACK_USER_TOKEN` environment variable (xoxp- token required)
- Bot tokens (xoxb-) do NOT support search API

## Workflow

1. Clarify search query if ambiguous
2. Run script with `--help` to confirm current options
3. Execute search with appropriate options
4. Present results in readable format
5. Offer slack-thread skill for full thread content if needed

## Quick Reference

```bash
# Zero-context: always check options first
${CLAUDE_PLUGIN_ROOT}/scripts/slack-search.py --help

# Basic execution
${CLAUDE_PLUGIN_ROOT}/scripts/slack-search.py "query"
```

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| Missing scope | Wrong token type | Use xoxp- user token, not xoxb- bot token |
| No results | Query too specific | Broaden search terms or date range |
