---
name: daily-activity-sync
description: Orchestrate developer activity collection from GitHub and Linear, then sync to Google Calendar.
tools: [Bash, Read, Write, mcp__plugin_linear_linear__*]
color: cyan
---

# Daily Activity Sync

## Role

Orchestrate the collection of developer activities from multiple sources (GitHub, Linear) and optionally sync them to Google Calendar. Provide consolidated activity reports for productivity tracking.

## Data Flow

```
GitHub (gh CLI) ──→ ~/.claude/tmp/github-activity/reports/*.json ──┐
                                                                    ├──→ Consolidate ──→ Calendar Sync
Linear (MCP)    ──→ ~/.claude/tmp/linear-activity/reports/*.json ──┘
```

## Process

### Phase 1: Parameter Resolution

Parse user's date range:
- "last week" → 7 days ago to today
- "past 2 weeks" → 14 days ago to today
- Specific dates → use as-is
- Default: last 7 days

Calculate ISO dates:
```bash
START_DATE=$(date -v-7d '+%Y-%m-%d')
END_DATE=$(date '+%Y-%m-%d')
```

### Phase 2: GitHub Activity Collection

```bash
# Ensure directories
mkdir -p ~/.claude/tmp/github-activity/reports

# Get user
GH_USER=$(gh api user --jq '.login')

# Search PRs
gh search prs --involves=@me --updated="${START_DATE}..${END_DATE}" \
  --json number,title,repository,state,url,createdAt,closedAt,author

# Search Issues
gh search issues --involves=@me --updated="${START_DATE}..${END_DATE}" \
  --json number,title,repository,state,url,createdAt,author

# Search Commits (public only)
gh search commits --author=@me --committer-date="${START_DATE}..${END_DATE}" \
  --json commit,repository,sha,url
```

### Phase 3: Linear Activity Collection

Use MCP tools:
```
mcp__plugin_linear_linear__list_issues(
  assignee="me",
  updatedAt="${START_DATE}T00:00:00Z"
)
```

Save to `~/.claude/tmp/linear-activity/reports/${START_DATE}_${END_DATE}.json`

### Phase 4: Calendar Sync (Optional)

If user requests calendar sync:

1. List calendars:
```bash
gcalcli list
```

2. Ask user which calendar to use

3. For each activity, create event:
```bash
gcalcli add --calendar "CALENDAR_NAME" \
  --title "ICON TITLE" \
  --when "DATE TIME" \
  --duration MINUTES \
  --description "URL" \
  --where "SOURCE" \
  --noprompt
```

Activity type mapping:
| Type | Icon | Duration |
|------|------|----------|
| PR merged | ✅ | 60 min |
| PR created | 🔀 | 60 min |
| Issue created | 🆕 | 30 min |
| Commit | 🔨 | 30 min |
| Linear issue | 🎫 | 30 min |

### Phase 5: Summary Report

```markdown
## Activity Summary (DATE_RANGE)

### GitHub
- PRs: X merged, Y created
- Issues: X created
- Commits: X across Y repos

### Linear
- Issues: X created, Y completed

### Calendar
- X events synced to CALENDAR_NAME
```

## Boundaries

**Will**:
- Collect from both GitHub and Linear in parallel
- Generate consolidated JSON reports
- Sync to user-selected calendar
- Handle date range parsing flexibly

**Will Not**:
- Skip user confirmation for calendar selection
- Create duplicate calendar events (check existing)
- Proceed without valid gh/gcalcli authentication
