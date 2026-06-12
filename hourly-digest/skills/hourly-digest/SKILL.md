---
name: hourly-digest
description: |
  This skill should be used when the user asks to "check hourly updates",
  "hourly digest", "slack hourly summary", "gmail daily summary",
  "what happened in the last hour", "hourly monitoring", or needs a periodic
  digest from Slack or Gmail. Runs as two independent loops on different
  cadences: Slack hourly, Gmail daily. Also triggers for automated invocation
  via /loop 1h /hourly-digest:hourly-digest slack and
  /loop 1d /hourly-digest:hourly-digest gmail.
  Distinct from per-channel Slack digest or single-source summaries.
  GitHub/Linear activity sync is out of scope for this skill.
argument-hint: "[slack|gmail]"
context: fork
agent: general-purpose
---

# Hourly Digest

Two independent digest loops on different cadences: Slack messages from the past hour, Gmail from the past day. Respond in the user's language.

The cadences differ by source constraint: Gmail's `newer_than:` search operator only supports day/month/year units (no hour granularity), so the Gmail loop runs daily while the Slack loop runs hourly.

## Argument Parsing

Each invocation runs exactly one section. Parse `ARGUMENTS` for the subcommand:

| Input | Behavior |
|-------|----------|
| (empty) | Ask the user which section to run (`slack` or `gmail`) — do not run both |
| `slack` | Slack hourly digest |
| `gmail` | Gmail daily digest |

## Execution

Run the requested section. On failure, report `[ERROR] Source: {message}`.

Load the MCP tools for the requested section upfront in a single ToolSearch call — only the tools that section needs, so a missing connector fails fast:

```
Slack section:  ToolSearch("select:mcp__claude_ai_Slack__slack_search_public_and_private")
Gmail section:  ToolSearch("select:mcp__claude_ai_Gmail__gmail_search_messages,mcp__claude_ai_Gmail__gmail_read_message")
```

### 1. Slack Hourly Digest (past hour)

1. Compute today's date and the Unix timestamp of one hour ago via Bash: `date '+%Y-%m-%d'` and `date -v-1H +%s` (Slack query `after:` excludes the given date; use `on:` to include it)
2. Use `slack_search_public_and_private` with query `on:{date}` plus parameters `after={unix_ts_one_hour_ago}`, `sort="timestamp"`, `sort_dir="desc"` — the `after` parameter windows results server-side, so result-count truncation cannot drop in-window messages; paginate by passing the returned `cursor` until the response no longer returns one (a partial page can still carry a next cursor). During the first hour of the day (00:00-00:59), also run a second query with `on:{yesterday}` and the same `after` timestamp so the window spanning midnight is covered
3. Group results by topic — cluster messages about the same subject together, even when they span multiple channels
4. Per topic: `**Topic** (N): key points — [#channel-name](https://{workspace}.slack.com/archives/{channel_id})`
5. For notable messages with threads, link to the thread: `[thread](https://{workspace}.slack.com/archives/{channel_id}/p{timestamp_no_dot})`
6. If no messages found, state that there are none

Construct Slack links from search result metadata: channel ID for channel links, channel ID + message timestamp (remove the dot) for thread permalinks.

### 2. Gmail Daily Digest (past day)

1. Use `gmail_search_messages` with query `newer_than:1d`; if the response indicates more results (next-page token or cursor), keep fetching until exhausted — a busy 24h window can exceed the first page
2. If search results already include sender and subject, use them directly. Only call `gmail_read_message` for items missing these details (avoid N+1 reads)
3. Group by topic — cluster related subjects and threads together
4. Per topic: `**Topic** (N): key points — ["Subject"](https://mail.google.com/mail/u/0/#all/{messageId}) from sender`, listing a link for every message in the topic (do not collapse to a single link when N > 1)
5. If no emails found, state that there are none

Construct Gmail links from the messageId returned by search results. Use the `#all/` (All Mail) view in link URLs — `#inbox/` breaks for archived, sent, or labeled-out messages that the search still returns.

## Output Format

Each invocation emits one section, with a header carrying its own time window:

- Slack: `## Slack Hourly Digest (HH:MM-HH:MM KST)`
- Gmail: `## Gmail Daily Digest (past 24h, as of YYYY-MM-DD HH:MM KST)` — `newer_than:1d` is a rolling 24-hour window, not a calendar day

Example structure (one per section — a single invocation emits only its own):

```
## Slack Hourly Digest (14:00-15:00 KST)
- **Auth service hotfix** (3): deployment discussion and rollout decision — [#channel-a](https://workspace.slack.com/archives/C0123), [hotfix thread](https://workspace.slack.com/archives/C0123/p1234567890)
- **Standup** (1): reminder — [#channel-b](https://workspace.slack.com/archives/C0456)

## Gmail Daily Digest (past 24h, as of 2026-06-12 15:00 KST)
- **Billing renewal** (1): ["Subject line"](https://mail.google.com/mail/u/0/#all/msg123) from sender@example.com
- **Project kickoff** (2): ["Thread topic"](https://mail.google.com/mail/u/0/#all/msg456) from another@example.com, ["Re: Thread topic"](https://mail.google.com/mail/u/0/#all/msg789) from third@example.com
```

When the section has no results, use a single line indicating nothing new.

## Cron Usage

```
/loop 1h /hourly-digest:hourly-digest slack
/loop 1d /hourly-digest:hourly-digest gmail
```

Plugin skills are namespaced as `{plugin-name}:{skill-name}`; the bare `/hourly-digest` form only resolves for a user-level skill installation.
