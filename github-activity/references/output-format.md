# Output Format Reference

Defines the format for github-activity reports.

## Table of Contents

- [Markdown Report](#markdown-report)
- [Activity Icons](#activity-icons)
- [JSON Schema](#json-schema)
- [Metadata Fields by Type](#metadata-fields-by-type)
- [File Naming](#file-naming)

## Markdown Report

```markdown
# GitHub Activity Report

**Period**: YYYY-MM-DD to YYYY-MM-DD
**User**: @username
**Organization Filter**: org-name or "None"
**Generated**: YYYY-MM-DD HH:MM TZ

## Summary

- **Total Repositories**: N
- **Pull Requests**: N created, N merged
- **Issues**: N involved
- **Commits**: N commits across N repositories

## Activity Calendar - YYYY-MM-DD

| Time  | Activity |
|-------|----------|
| 09:00 | 🔨 **Commits**: 3 commits in `org/repo` ([#abc123](link)) |
| 10:00 | 🔀 **PR Created**: [#123](link) "Add feature X" in `org/repo` |
| 11:00 | ↳ Continued work on PR #123 |
| 14:00 | 💬 **Issue Comment**: [#456](link) "Bug report" in `org/repo2` |
| 15:00 | ✅ **PR Merged**: [#123](link) in `org/repo` |

## Repository Breakdown

### org/repo
- **Commits**: 5
- **PRs**: 2 created, 1 merged
- **Issues**: 1 comment

**Pull Requests:**
- [#123](link) "Add feature X" (MERGED) - Created 10:00, Merged 15:00

**Commits:**
- [abc123](link) "Fix bug" - 09:15

**Issues:**
- [#456](link) "Bug report" - Comment at 14:20

## Activities (Unknown Time)

Items without precise timestamps:

- 💬 **Issue**: [#789](link) "Feature request" in `org/repo3`
```

## Activity Icons

- 🔨 Commits
- 🔀 PR Created
- ✅ PR Merged
- 🔍 PR Review
- 💬 Issue Comment
- 🆕 Issue Created
- ↳ Continued Activity

## JSON Schema

```json
{
  "period": {
    "start": "YYYY-MM-DD",
    "end": "YYYY-MM-DD"
  },
  "user": "string",
  "organization_filter": "string | null",
  "generated_at": "ISO 8601 with offset",
  "timezone": "IANA timezone",
  "timezone_abbr": "TZ abbreviation",
  "activities": [
    {
      "type": "pr_created | pr_merged | pr_closed | issue_created | issue_commented | commit",
      "timestamp": "ISO 8601 with offset",
      "title": "string",
      "repository": "owner/repo",
      "url": "string",
      "metadata": {
        // Type-specific fields (see below)
      }
    }
  ],
  "summary": {
    "total_repositories": 0,
    "prs_created": 0,
    "prs_merged": 0,
    "prs_closed": 0,
    "issues_created": 0,
    "issues_commented": 0,
    "commits": 0
  }
}
```

### Metadata Fields by Type

**pr_created, pr_merged, pr_closed:**
```json
{
  "number": 123,
  "state": "OPEN | CLOSED | MERGED",
  "complexity": {
    "additions": 45,
    "deletions": 12,
    "changed_files": 3
  }
}
```

**issue_created, issue_commented:**
```json
{
  "number": 456,
  "state": "OPEN | CLOSED"
}
```

**commit:**
```json
{
  "sha": "abc123def456",
  "message": "Fix bug in authentication",
  "complexity": {
    "additions": 10,
    "deletions": 5
  }
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
~/.claude/tmp/github-activity/reports/
├── 2025-11-05.md
├── 2025-11-05.json
├── 2025-11-01_to_2025-11-07.md
└── 2025-11-01_to_2025-11-07.json
```
