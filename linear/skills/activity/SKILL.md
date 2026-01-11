---
name: activity
description: |
  This skill should be used when the user asks to "collect Linear activity", "generate Linear report", "show my Linear issues", "what did I work on in Linear", or requests activity summaries from Linear for specific date ranges. Provides workflow for collecting issues, projects, and cycles via Linear MCP.
context: fork
agent: linear-collector
---

# Linear Activity Reporter

Collect Linear activity data via MCP and generate time-organized markdown reports.

## Workflow

### Phase 1: Initialize Context

```python
user = mcp__plugin_linear_linear__get_user(query="me")
teams = mcp__plugin_linear_linear__list_teams(limit=250)
```

Extract: `userId`, `displayName`, `email`, `teamIds`, `teamNames`

**On error**: Check MCP configuration in `~/.claude.json`, verify Linear workspace access.

**Multiple teams**: Present team selection via `AskUserQuestion` with multiSelect.

### Phase 2: Calculate Date Range

| Request | Action |
|---------|--------|
| Explicit date ("2025-11-05") | Use directly |
| Relative ("yesterday", "last week") | Calculate with `date` command |
| Not specified | Prompt with `AskUserQuestion` |

Convert to ISO 8601: `YYYY-MM-DDTHH:MM:SSZ`

### Phase 3: Collect Activity Data

Execute parallel MCP calls per team:

| Data Type | MCP Function | Key Filters |
|-----------|--------------|-------------|
| Issues Created | `list_issues` | `assignee="me"`, `createdAt` |
| Issues Updated | `list_issues` | `assignee="me"`, `updatedAt` |
| Comments | `list_comments` | `issueId` (filter date client-side) |
| Projects | `list_projects` | `member="me"`, `createdAt`/`updatedAt` |
| Cycles | `list_cycles` | `teamId` (filter date client-side) |

MCP uses `>=` comparison only. Filter end date client-side.

For API details: [references/api-reference.md](references/api-reference.md)

### Phase 4: Process Data

1. Convert UTC to local timezone (detect via `datetime.now().astimezone()`)
2. Group by hour (00-23) and team
3. Categorize by activity type
4. Deduplicate by issue/project ID

### Phase 5: Generate Reports

Output directory: `~/.claude/tmp/linear-activity/reports/`

```bash
mkdir -p ~/.claude/tmp/linear-activity/reports/
```

**Files:**
- `YYYY-MM-DD.md` - Human-readable markdown
- `YYYY-MM-DD.json` - Machine-readable (for calendar-sync)

For format specification: [references/output-template.md](references/output-template.md)

## Activity Icons

| Icon | Type |
|------|------|
| 🆕 | Issue Created |
| 📝 | Issue Updated |
| 💬 | Issue Comment |
| 📊 | Project Created |
| 🔧 | Project Updated |
| 🔄 | Cycle Created/Updated |

## Usage Examples

| Request | Result |
|---------|--------|
| "Linear activity yesterday" | Yesterday's activities, all teams |
| "Linear report 2025-11-01 to today" | Date range report |
| "Last week's Linear activity" | Last 7 days report |
| "Engineering team activity" | Specific team filter |

## Integration

JSON output compatible with `calendar-sync` skill:

```
linear-activity → YYYY-MM-DD.json → calendar-sync → Google Calendar
```

## Troubleshooting

### MCP Connection Error

**Symptom**: `mcp__plugin_linear_linear__get_user` fails

**Solutions**:
1. Verify `~/.claude.json` MCP configuration
2. Test: `mcp__plugin_linear_linear__list_teams()`
3. Check Linear workspace access
4. Re-authenticate if needed

### No Activities Found

Expand date range, verify `assignee="me"` filter, check team access.

### Missing Data (API Limit)

API limit: 250 items. Narrow date range or split into multiple queries.

### Timezone Issues

Set explicitly: `export TZ=Asia/Seoul`

## References

- [references/api-reference.md](references/api-reference.md) - MCP API functions and parameters
- [references/output-template.md](references/output-template.md) - Report format and JSON schema
