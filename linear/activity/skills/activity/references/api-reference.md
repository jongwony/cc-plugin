# Linear MCP API Reference

Quick reference for Linear MCP functions used in activity data collection.

## Table of Contents

- [Activity Types](#activity-types)
- [User Management](#user-management)
- [Team Management](#team-management)
- [Issue Management](#issue-management)
- [Project Management](#project-management)
- [Cycle Management](#cycle-management)
- [Date Formats](#date-formats)
- [Best Practices](#best-practices)
- [Rate Limiting](#rate-limiting)
- [Common Issues](#common-issues)

## Activity Types

Activities tracked in reports:

| Type | Source | Description |
|------|--------|-------------|
| `issue_created` | Issue | New issue created by user |
| `issue_updated` | Issue | Existing issue modified (state, priority, assignee, etc.) |
| `issue_commented` | Comment | Comment added to an issue |
| `project_created` | Project | New project created |
| `project_updated` | Project | Project modified (state, progress, dates, etc.) |
| `cycle_created` | Cycle | New sprint/cycle created |
| `cycle_updated` | Cycle | Cycle modified (progress, dates, etc.) |

**Note**: MCP does not provide a unified "activity" API. Activities are derived from individual entity queries filtered by `createdAt`/`updatedAt`.

## User Management

### Get User
```python
mcp__linear__get_user(query: "me")
```
Returns: `id`, `name`, `email`, `displayName`

## Team Management

### List Teams
```python
mcp__linear__list_teams(
    limit: 250,
    orderBy: "createdAt" | "updatedAt",
    includeArchived: bool  # default: false
)
```
Returns: `id`, `name`, `key`, `description`

### Get Team
```python
mcp__linear__get_team(query: "team-id" | "team-key" | "team-name")
```

## Issue Management

### List Issues
```python
mcp__linear__list_issues(
    assignee: "me" | "user-id" | "user-name" | "user-email",
    createdAt: "ISO-8601" | "-P1D",
    updatedAt: "ISO-8601" | "-P1D",
    team: "team-id" | "team-name",
    project: "project-id" | "project-name",
    cycle: "cycle-id" | "cycle-name",
    state: "state-id" | "state-name",
    label: "label-id" | "label-name",
    orderBy: "createdAt" | "updatedAt",
    limit: 250  # default: 50, max: 250
)
```

Returns: `id`, `identifier`, `title`, `description`, `state` (id/name/type), `priority` (0-4), `createdAt`, `updatedAt`, `assignee`, `creator`, `team`, `project`, `cycle`, `labels`, `url`

Example:
```json
{
  "identifier": "ENG-123",
  "title": "Implement new feature",
  "state": {"name": "In Progress", "type": "started"},
  "priority": 2,
  "createdAt": "2025-11-05T08:52:00Z",
  "updatedAt": "2025-11-05T14:30:00Z",
  "assignee": {"name": "John Doe"},
  "team": {"name": "Engineering", "key": "ENG"}
}
```

### Get Issue
```python
mcp__linear__get_issue(id: "issue-id")
```
Additional fields: `attachments`, `branchName`, `comments`, `relations`

### List Comments
```python
mcp__linear__list_comments(issueId: "issue-id")
```
Returns: `id`, `body`, `createdAt`, `updatedAt`, `user` (id/name/email)

## Project Management

### List Projects
```python
mcp__linear__list_projects(
    createdAt: "ISO-8601" | "-P1D",
    updatedAt: "ISO-8601" | "-P1D",
    team: "team-id" | "team-name",
    state: "state-id" | "state-name",
    member: "me" | "user-id" | "user-name" | "user-email",
    orderBy: "createdAt" | "updatedAt",
    limit: 250  # default: 50
)
```
Returns: `id`, `name`, `description`, `state`, `lead`, `createdAt`, `updatedAt`, `startDate`, `targetDate`, `progress`, `url`

States: `planned`, `started`, `paused`, `completed`, `canceled`

### Get Project
```python
mcp__linear__get_project(query: "project-id" | "project-name")
```

## Cycle Management

### List Cycles
```python
mcp__linear__list_cycles(
    teamId: "team-id",
    type: "current" | "previous" | "next" | "all"  # default: "all"
)
```
Returns: `id`, `number`, `name`, `startsAt`, `endsAt`, `createdAt`, `updatedAt`, `progress`, `completedIssues`, `totalIssues`, `team`, `url`

Example:
```json
{
  "number": 24,
  "name": "Sprint 24",
  "startsAt": "2025-11-01T00:00:00Z",
  "endsAt": "2025-11-14T23:59:59Z",
  "progress": 30,
  "completedIssues": 5,
  "totalIssues": 15
}
```

## Date Formats

### ISO 8601
```
2025-11-05T08:52:00Z          # UTC
2025-11-05T17:52:00+09:00     # With timezone
```

### Duration
```
-P1D     # 1 day ago
-P7D     # 7 days ago
-P1W     # 1 week ago
-P1M     # 1 month ago
```

### Date Range Filtering
MCP only supports `>=` comparison. For ranges:
1. Fetch from start date using MCP
2. Filter end date client-side

```python
issues = mcp__linear__list_issues(createdAt="2025-11-05T00:00:00Z")
filtered = [i for i in issues if i.createdAt < "2025-11-06T00:00:00Z"]
```

## Best Practices

### Use Specific Filters
```python
# Good
issues = mcp__linear__list_issues(team="ENG", createdAt="2025-11-05T00:00:00Z", limit=250)

# Bad
issues = mcp__linear__list_issues()
```

### Batch Queries
Process multiple teams in parallel with concurrent MCP calls.

### Cache Intermediate Results
```python
import json
with open('/tmp/linear_issues.json', 'w') as f:
    json.dump(issues, f, indent=2)
```

### Pagination (when supported)
```python
page1 = mcp__linear__list_issues(limit=250)
page2 = mcp__linear__list_issues(limit=250, after=page1[-1].id)
```

## Rate Limiting

To avoid rate limits:
- Use specific filters to reduce data volume
- Control request batch size with `limit`
- Limit concurrent requests
- Add delays between requests if needed

## Common Issues

**Empty results**: Check date format (ISO 8601), verify team/project names, check `includeArchived` option

**Permission denied**: Verify Linear workspace permissions, reconnect MCP

**Rate limit errors**: Use more specific filters, reduce parallel requests, add delays

## Linear API vs MCP

| Feature | API | MCP |
|---------|-----|-----|
| Query issues/projects/cycles | ✅ | ✅ |
| Create/update issues | ✅ | ✅ |
| Comments | ✅ | ✅ |
| Documents | ✅ | ✅ (limited) |
| Notifications | ✅ | ❌ |
| Webhooks | ✅ | ❌ |
| Search | ✅ | ❌ (manual) |

## References

- [Linear API Documentation](https://developers.linear.app/docs)
- [Linear GraphQL Schema](https://studio.apollographql.com/public/Linear-API/variant/current/home)
- [ISO 8601 Duration Format](https://en.wikipedia.org/wiki/ISO_8601#Durations)
