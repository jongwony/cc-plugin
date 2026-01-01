# GitHub CLI API Reference

Quick reference for GitHub CLI commands used in activity data collection.

## Table of Contents

- [Authentication](#authentication)
- [Search Commands](#search-commands) (PRs, Issues, Commits)
- [API Commands](#api-commands)
- [Repository Commands](#repository-commands)
- [Date Formats](#date-formats)
- [JSON Processing](#json-processing-with-jq)
- [Best Practices](#best-practices)
- [Rate Limiting](#rate-limiting)
- [Common Issues](#common-issues)

## Authentication

```bash
gh auth login              # Interactive login
gh auth status             # Check status
gh auth status -t          # Check token scopes
```

Required scopes: `repo` (private repos), `read:org` (organization data)

## Search Commands

### Search Pull Requests

```bash
gh search prs [flags]
```

**Flags:**

| Flag | Description | Example |
|------|-------------|---------|
| `--author=USER` | Filter by author | `--author=@me` |
| `--involves=USER` | Author, assignee, mentions | `--involves=@me` |
| `--reviewed-by=USER` | Reviewed by user | `--reviewed-by=@me` |
| `--owner=ORG` | Organization filter | `--owner=delightroom` |
| `--repo=REPO` | Repository filter | `--repo=owner/repo` |
| `--state=STATE` | open, closed, merged | `--state=merged` |
| `--merged` | Only merged PRs | `--merged` |
| `--updated=DATE` | Date range | `--updated="2025-11-01..2025-11-05"` |
| `--json FIELDS` | JSON output | `--json number,title,state` |

**JSON Fields:**

`number`, `title`, `repository`, `state`, `url`, `createdAt`, `closedAt`, `author`, `assignees`, `labels`, `comments`, `additions`, `deletions`

**Example:**

```bash
gh search prs --author=@me --updated="2025-11-01..2025-11-05" \
  --json number,title,repository,state,url,createdAt,closedAt,author
```

### Search Issues

```bash
gh search issues [flags]
```

**Flags:**

| Flag | Description | Example |
|------|-------------|---------|
| `--author=USER` | Filter by author | `--author=@me` |
| `--involves=USER` | Author, assignee, mentions, comments | `--involves=@me` |
| `--assignee=USER` | Assigned to user | `--assignee=@me` |
| `--mentions=USER` | Mentioning user | `--mentions=@me` |
| `--commenter=USER` | Commented by user | `--commenter=@me` |
| `--state=STATE` | open or closed | `--state=open` |
| `--updated=DATE` | Date range | `--updated="2025-11-01.."` |

**JSON Fields:**

`number`, `title`, `repository`, `state`, `url`, `createdAt`, `closedAt`, `author`, `assignees`, `labels`, `comments`

**Example:**

```bash
gh search issues --involves=@me --updated="2025-11-01..2025-11-05" \
  --json number,title,repository,state,url,createdAt,author,comments
```

### Search Commits

```bash
gh search commits [flags]
```

**Flags:**

| Flag | Description | Example |
|------|-------------|---------|
| `--author=USER` | Commit author | `--author=@me` |
| `--committer=USER` | Commit committer | `--committer=@me` |
| `--author-date=DATE` | Author date range | `--author-date="2025-11-01.."` |
| `--committer-date=DATE` | Committer date range | `--committer-date="2025-11-01..2025-11-05"` |
| `--owner=ORG` | Organization filter | `--owner=delightroom` |
| `--repo=REPO` | Repository filter | `--repo=owner/repo` |

**JSON Fields:**

- `commit`: Object with `sha`, `message`, `author`, `committer`
- `repository`: Object with `owner`, `name`, `full_name`
- `url`, `html_url`

**Example:**

```bash
gh search commits --author=@me --committer-date="2025-11-01..2025-11-05" \
  --json commit,repository,url
```

## API Commands

### Get Current User

```bash
gh api user --jq '.login'
```

Returns: `login`, `name`, `email`, `bio`, `company`, `location`

### Get User Organizations

```bash
gh api user/orgs --jq '.[].login'
```

Returns: `login`, `description`, `url`

### Get PR Details

```bash
gh api repos/OWNER/REPO/pulls/NUMBER
```

Returns: `title`, `body`, `state`, `merged`, `merged_at`, `additions`, `deletions`, `changed_files`, `head`, `base`

### Get Issue Comments

```bash
gh api repos/OWNER/REPO/issues/NUMBER/comments
```

Returns: Array of comments with `user`, `created_at`, `updated_at`, `body`

## Repository Commands

### List PRs

```bash
gh pr list --author=@me --state=all
gh pr view NUMBER
gh pr status
```

### List Issues

```bash
gh issue list --assignee=@me
gh issue view NUMBER
```

## Date Formats

### Search Date Format

```
2025-11-01                    # Single date
2025-11-01..2025-11-05        # Range (inclusive)
>2025-11-01                   # After date
>=2025-11-01                  # From date
<2025-11-05                   # Before date
2025-11-01..                  # From date to now
```

### ISO 8601 Format

All JSON timestamps:

```
2025-11-01T10:30:00Z          # UTC
2025-11-01T10:30:00+09:00     # With timezone
```

## JSON Processing with jq

```bash
# Extract field
gh api user --jq '.login'

# Array processing
gh api user/orgs --jq '.[].login'

# Filter and transform
gh search prs --author=@me --json number,title,state \
  --jq '.[] | select(.state == "MERGED") | {number, title}'

# Format as table
gh search prs --author=@me --json number,title,state \
  --jq -r '.[] | "\(.number)\t\(.title)\t\(.state)"'
```

## Best Practices

### Use Specific Filters

```bash
# Good
gh search prs --author=@me --owner=delightroom --merged --updated="2025-11-01..2025-11-05"

# Bad
gh search prs --author=@me  # Searches all time
```

### Limit JSON Fields

```bash
# Good
gh search prs --author=@me --json number,title,state

# Bad
gh search prs --author=@me --json  # Gets all fields
```

### Batch Processing

```bash
# Sequential
gh api user/orgs --jq '.[].login' | while read -r org; do
  gh search prs --owner="$org" --author=@me --merged --json number,title
done

# Parallel (requires GNU parallel)
gh api user/orgs --jq '.[].login' | \
  parallel -j4 'gh search prs --owner={} --author=@me --merged --json number,title'
```

## Rate Limiting

Check status:

```bash
gh api rate_limit
```

Limits:
- Authenticated: 5,000 requests/hour
- Search API: 30 requests/minute

Strategies:
- Use `--json` to limit fields
- Add delays for large loops
- Use specific date ranges and filters

## Common Issues

**Authentication errors**: Check token scopes with `gh auth status -t`, re-authenticate with `gh auth logout && gh auth login`

**Empty results**: Verify date format, check if activities exist with `gh pr list --author=@me --state=all`

**Rate limit errors**: Use more specific filters, reduce parallel requests, add delays between calls

**Permission denied**: Ensure token has `repo` and `read:org` scopes

## References

- [GitHub CLI Manual](https://cli.github.com/manual/)
- [GitHub REST API](https://docs.github.com/rest)
- [GitHub Search Syntax](https://docs.github.com/search-github/getting-started-with-searching-on-github)
