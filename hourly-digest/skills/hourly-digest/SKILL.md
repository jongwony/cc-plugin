---
name: hourly-digest
description: |
  This skill should be used when the user asks to "check hourly updates",
  "hourly digest", "hourly slack gmail summary", "what happened in the last hour",
  "hourly monitoring", or needs a consolidated hourly summary from Slack
  and Gmail. Also triggers for automated invocation via /loop 1h /hourly-digest.
  Distinct from per-channel Slack digest or single-source summaries -- this is
  the unified cross-source hourly rollup. For GitHub/Linear activity sync,
  use /loop 1h /github-activity separately.
argument-hint: "[slack|gmail]"
---

# Hourly Digest

Consolidate Slack messages and Gmail from the past hour into a single grouped summary. Respond in the user's language.

## Argument Parsing

Parse `ARGUMENTS` for an optional subcommand:

| Input | Behavior |
|-------|----------|
| (empty) | Run all sections: Slack, Gmail |
| `slack` | Slack digest only |
| `gmail` | Gmail digest only |

## Execution

Run each requested section independently. On failure, report `[ERROR] Source: {message}` and continue to the next section.

Load all needed MCP tools upfront in a single call before starting any section:

```
ToolSearch("select:mcp__claude_ai_Slack__slack_search_public_and_private,mcp__claude_ai_Gmail__gmail_search_messages,mcp__claude_ai_Gmail__gmail_read_message")
```

### 1. Slack Digest

1. Compute today's date via Bash: `date '+%Y-%m-%d'` (Slack `after:` excludes the given date; use `on:` to include it)
2. Use `slack_search_public_and_private` with query `on:{date}` to find today's messages, then filter results to the past hour by message timestamp
3. Group results by channel
4. Per channel: `[#channel-name](https://{workspace}.slack.com/archives/{channel_id}) (N): key topics discussed`
5. For notable messages with threads, link to the thread: `[thread](https://{workspace}.slack.com/archives/{channel_id}/p{timestamp_no_dot})`
6. If no messages found, state that there are none

Construct Slack links from search result metadata: channel ID for channel links, channel ID + message timestamp (remove the dot) for thread permalinks.

### 2. Gmail Digest

1. Use `gmail_search_messages` with query `newer_than:1h`
2. If search results already include sender and subject, use them directly. Only call `gmail_read_message` for items missing these details (avoid N+1 reads)
3. Group by sender or thread
4. Per item: `From: sender -- ["Subject"](https://mail.google.com/mail/u/0/#inbox/{messageId}) (N)`
5. If no emails found, state that there are none

Construct Gmail links from the messageId returned by search results.

## Output Format

Present all results under a header with the time range (e.g., `## Hourly Digest (14:00-15:00 KST)`).
Each source gets its own `###` subheader. Example structure:

```
## Hourly Digest (HH:MM-HH:MM KST)

### Slack
- [#channel-a](https://workspace.slack.com/archives/C0123) (3): deployment discussion, auth service [hotfix thread](https://workspace.slack.com/archives/C0123/p1234567890)
- [#channel-b](https://workspace.slack.com/archives/C0456) (1): standup reminder

### Gmail
- From: sender@example.com -- ["Subject line"](https://mail.google.com/mail/u/0/#inbox/msg123) (1)
- From: another@example.com -- ["Thread topic"](https://mail.google.com/mail/u/0/#inbox/msg456) (2)
```

When a section has no results, use a single line indicating nothing new.
When running a single section via subcommand, omit the other section headers entirely.

## Cron Usage

```
/loop 1h /hourly-digest
```
