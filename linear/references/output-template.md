# Output Template

Defines the format for linear-activity reports. For API details, see [api-reference.md](api-reference.md).

## Table of Contents

- [Markdown Report](#markdown-report)
- [Activity Icons](#activity-icons)
- [JSON Schema](#json-schema)
- [Metadata Fields by Type](#metadata-fields-by-type)
- [File Naming](#file-naming)

## Markdown Report

```markdown
# Linear Activity Report

**Period**: YYYY-MM-DD to YYYY-MM-DD
**User**: @username (email@example.com)
**Team Filter**: Team1, Team2 or "All Teams"
**Project Filter**: Project1 or "None"
**Generated**: YYYY-MM-DD HH:MM TZ

## Summary

- **Total Teams**: N
- **Total Projects**: N
- **Issues**: N created, N updated, N commented
- **Projects**: N created, N updated
- **Cycles**: N created, N updated

## Activity Calendar - YYYY-MM-DD

| Time  | Activity |
|-------|----------|
| 09:00 | 🆕 [ENG-123](url) "Issue title" in `Engineering` |
| 10:30 | 💬 [ENG-124](url) "Issue title" in `Engineering` |
| 11:00 | 📝 [ENG-125](url) "Issue title" in `Engineering` |
| 14:00 | 📊 [Project Name](url) in `Product` |
| 15:00 | 🔄 [Sprint 24](url) in `Engineering` - 30% complete |

## Team Breakdown

### Engineering
- **Issues**: N created, N updated, N comments
- **Projects**: N created, N updated
- **Cycles**: N created, N updated

**Issues Created:**
- [ENG-123](url) "Title" - 09:00
  - State: In Progress
  - Priority: High
  - Assignee: @username
  - Labels: feature, backend
  - Project: Q4 Launch
  - Cycle: Sprint 24

**Issues Updated:**
- [ENG-124](url) "Title" - 11:00
  - State: In Progress
  - Priority: Urgent
  - Assignee: @username

**Comments:**
- [ENG-125](url) "Title" - 10:30
  - Comment: "Comment text"

**Projects:**
- [Project Name](url) - Created 14:00
  - State: started
  - Lead: @username
  - Target: YYYY-MM-DD
  - Progress: 0%

**Cycles:**
- [Sprint 24](url) YYYY-MM-DD to YYYY-MM-DD - Updated 15:00
  - Progress: 30% (5/15 issues completed)

## Activities (Unknown Time)

Items without precise timestamps:

- 📝 [PROD-456](url) "Title" in `Product`
```

## Activity Icons

- 🆕 Issue Created
- 📝 Issue Updated
- 💬 Issue Comment
- 📊 Project Created
- 🔧 Project Updated
- 🔄 Cycle Created/Updated
- ↳ Continued Activity

## JSON Schema

```json
{
  "period": {
    "start": "YYYY-MM-DD",
    "end": "YYYY-MM-DD"
  },
  "user": {
    "id": "string",
    "name": "string",
    "email": "string"
  },
  "team_filter": ["team-name"] | null,
  "project_filter": ["project-name"] | null,
  "generated_at": "ISO 8601 with offset",
  "timezone": "IANA timezone",
  "timezone_abbr": "TZ abbreviation",
  "activities": [
    {
      "type": "issue_created | issue_updated | issue_commented | project_created | project_updated | cycle_created | cycle_updated",
      "timestamp": "ISO 8601 with offset",
      "title": "string",
      "team": {
        "id": "string",
        "name": "string",
        "key": "string"
      },
      "url": "string",
      "metadata": {
        // Type-specific fields (see below)
      }
    }
  ],
  "summary": {
    "total_teams": 0,
    "total_projects": 0,
    "issues_created": 0,
    "issues_updated": 0,
    "issues_commented": 0,
    "projects_created": 0,
    "projects_updated": 0,
    "cycles_created": 0,
    "cycles_updated": 0
  }
}
```

### Metadata Fields by Type

**issue_created, issue_updated:**
```json
{
  "id": "string",
  "identifier": "ENG-123",
  "state": "string",
  "priority": 0-4,
  "assignee": "string",
  "labels": ["string"],
  "project": "string",
  "cycle": "string"
}
```

**issue_commented:**
```json
{
  "id": "string",
  "identifier": "ENG-123",
  "comment": {
    "id": "string",
    "body": "string",
    "createdAt": "ISO 8601"
  }
}
```

**project_created, project_updated:**
```json
{
  "id": "string",
  "state": "string",
  "lead": "string",
  "startDate": "YYYY-MM-DD",
  "targetDate": "YYYY-MM-DD",
  "progress": 0-100
}
```

**cycle_created, cycle_updated:**
```json
{
  "id": "string",
  "number": 0,
  "startsAt": "ISO 8601",
  "endsAt": "ISO 8601",
  "progress": 0-100,
  "completedIssues": 0,
  "totalIssues": 0
}
```

## File Naming

**Single date:**
- Markdown: `YYYY-MM-DD.md`
- JSON: `YYYY-MM-DD.json`

**Date range:**
- Markdown: `YYYY-MM-DD_to_YYYY-MM-DD.md`
- JSON: `YYYY-MM-DD_to_YYYY-MM-DD.json`

**Storage:**
```
~/.claude/tmp/linear-activity/reports/
├── 2025-11-05.md
├── 2025-11-05.json
├── 2025-11-01_to_2025-11-07.md
└── 2025-11-01_to_2025-11-07.json
```
