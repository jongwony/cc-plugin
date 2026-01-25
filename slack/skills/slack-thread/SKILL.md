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

Fetch and format Slack thread conversations with progressive resource disclosure.

## Prerequisites

- `SLACK_USER_TOKEN` or `SLACK_BOT_TOKEN` environment variable
- User token: access threads in channels you belong to
- Bot token: access all channels the bot is added to

## Quick Reference

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/slack-thread.py "<thread_url>"
${CLAUDE_PLUGIN_ROOT}/scripts/slack-resource.py --download "<file_url>"
```

## Progressive Disclosure Workflow

### Phase 1: Conversation Fetch

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/slack-thread.py "<thread_url>"
```

Output contains:
- Thread messages with timestamps and authors
- `[Image]`, `[File]`, `[PDF]`, `[Video]` markers with URLs
- `[Link]` markers for referenced Slack threads

### Phase 2: Resource Detection

Scan output for additional context needs:

| Marker | URL Pattern | Action |
|--------|-------------|--------|
| `[Image]` | `files.slack.com/files-pri/...` | Download for visual analysis |
| `[PDF]` | `files.slack.com/files-pri/...` | Download for content extraction |
| `[Link]` | `*.slack.com/archives/...` | Fetch referenced thread if relevant |

### Phase 3: Resource Fetch (On Demand)

Only fetch resources when context is insufficient:

```bash
# For images/files needing analysis
${CLAUDE_PLUGIN_ROOT}/scripts/slack-resource.py --download "<file_url>"
# Output: Downloaded to /tmp/filename.png
# Then: Read tool to analyze

# For referenced threads
${CLAUDE_PLUGIN_ROOT}/scripts/slack-thread.py "<referenced_thread_url>"
```

## Decision Points

**Fetch additional resources when:**
- Image appears to contain data/charts mentioned in discussion
- PDF/file is referenced as source of truth
- Referenced thread is cited for context ("as discussed in...")

**Skip resource fetch when:**
- Image is decorative (emoji, reaction screenshots)
- Thread summary is sufficient for user's question
- File is mentioned but not central to discussion

## Integration with slack-search

```bash
# 1. Search for messages
${CLAUDE_PLUGIN_ROOT}/scripts/slack-search.py "API migration"

# 2. Results show Thread: links for replies
# 3. Fetch full thread from Thread: URL
${CLAUDE_PLUGIN_ROOT}/scripts/slack-thread.py "<thread_url>"
```

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| channel_not_found | No access to channel | Check token permissions or channel membership |
| not_in_channel | Bot not added | Add bot to channel or use user token |
| file_not_found | File deleted or no access | Check file permissions |
