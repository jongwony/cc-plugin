# Linear Activity Reporter

Linear MCP and GraphQL API integration for activity reports, documents, and milestones.

## Activity Reports

Generate time-based activity reports using Linear MCP.

### Workflow

#### 1. Fetch User and Team Data

```python
user = mcp__linear__get_user(query="me")
teams = mcp__linear__list_teams(limit=250)
```

- **Error**: See [Troubleshooting](#troubleshooting)
- **Multiple teams**: Use `AskUserQuestion` with multiSelect for team selection

#### 2. Calculate Date Range

| User Request | Action |
|--------------|--------|
| Explicit date | Use as target_date |
| Relative ("yesterday") | Calculate with `date` command |
| Not specified | Use `AskUserQuestion` to prompt |

Convert to ISO 8601: `YYYY-MM-DDTHH:MM:SSZ`

#### 3. Collect Activity Data

Execute parallel MCP calls for each team:

| Data Type | MCP Function | Key Filters |
|-----------|--------------|-------------|
| Issues Created | `list_issues` | `assignee="me"`, `createdAt` |
| Issues Updated | `list_issues` | `assignee="me"`, `updatedAt` |
| Comments | `list_comments` | `issueId` (filter by date client-side) |
| Projects | `list_projects` | `member="me"`, `createdAt`/`updatedAt` |
| Cycles | `list_cycles` | `teamId`, filter date client-side |

For API details: [references/api-reference.md](references/api-reference.md)

#### 4. Process and Group Data

1. **Convert UTC to local timezone** (detect with `datetime.now().astimezone()`)
2. **Group by hour** (00-23) and team
3. **Categorize** by activity type

#### 5. Generate Reports

Output to `~/.claude/tmp/linear-activity/reports/`:
- `YYYY-MM-DD.md` - Human-readable markdown
- `YYYY-MM-DD.json` - Machine-readable (for calendar-sync)

For format specification: [references/output-template.md](references/output-template.md)

**Activity Icons:**
| Icon | Type |
|------|------|
| 🆕 | Issue Created |
| 📝 | Issue Updated |
| 💬 | Issue Comment |
| 📊 | Project Created |
| 🔧 | Project Updated |
| 🔄 | Cycle Created/Updated |

### Usage Examples

| Request | Result |
|---------|--------|
| "Linear activity yesterday" | Yesterday's activities, all teams |
| "2025-11-01 to today issues report" | Date range report |
| "Last week's Linear activity" | Last 7 days report |
| "Engineering team activity summary" | Specific team filter |

---

## Document Operations

Extends Linear MCP with document write operations via GraphQL API.

**Prerequisites:**
1. Linear API Key from https://linear.app/settings/api
2. Set environment variable: `export LINEAR_API_KEY="lin_api_xxxxx"`

### Creating a Document

**Basic example:**
```bash
curl -X POST https://api.linear.app/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: $LINEAR_API_KEY" \
  -d '{
    "query": "mutation DocumentCreate($input: DocumentCreateInput!) { documentCreate(input: $input) { success document { id title url slugId createdAt creator { name } } } }",
    "variables": {
      "input": {
        "title": "API Design Document"
      }
    }
  }'
```

**With content and project:**
```bash
curl -X POST https://api.linear.app/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: $LINEAR_API_KEY" \
  -d '{
    "query": "mutation DocumentCreate($input: DocumentCreateInput!) { documentCreate(input: $input) { success document { id title url slugId } } }",
    "variables": {
      "input": {
        "title": "Q4 Roadmap",
        "content": "# Q4 Goals\n\n- Launch feature X\n- Improve performance by 30%",
        "projectId": "PROJECT_ID_HERE",
        "color": "#FF6B6B"
      }
    }
  }'
```

**Available parameters:**
- `title` (required): Document title
- `content`: Markdown content
- `projectId`: Attach to project
- `initiativeId`: Attach to initiative
- `issueId`: Attach to issue
- `color`: Icon color (hex format)
- `icon`: Icon emoji (optional, some may fail validation)
- `sortOrder`: Display order (float)

### Updating a Document

```bash
curl -X POST https://api.linear.app/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: $LINEAR_API_KEY" \
  -d '{
    "query": "mutation DocumentUpdate($id: String!, $input: DocumentUpdateInput!) { documentUpdate(id: $id, input: $input) { success document { id title updatedAt } } }",
    "variables": {
      "id": "DOCUMENT_ID_OR_SLUG",
      "input": {
        "title": "Updated Title",
        "content": "# Updated Content\n\nNew information here."
      }
    }
  }'
```

### Deleting a Document

```bash
curl -X POST https://api.linear.app/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: $LINEAR_API_KEY" \
  -d '{
    "query": "mutation DocumentDelete($id: String!) { documentDelete(id: $id) { success } }",
    "variables": {
      "id": "DOCUMENT_ID"
    }
  }'
```

---

## Project Milestone Operations

### Creating a Milestone

**Basic milestone:**
```bash
curl -X POST https://api.linear.app/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: $LINEAR_API_KEY" \
  -d '{
    "query": "mutation ProjectMilestoneCreate($input: ProjectMilestoneCreateInput!) { projectMilestoneCreate(input: $input) { success projectMilestone { id name status progress targetDate project { id name } } } }",
    "variables": {
      "input": {
        "projectId": "PROJECT_ID_HERE",
        "name": "Beta Release"
      }
    }
  }'
```

**With description and target date:**
```bash
curl -X POST https://api.linear.app/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: $LINEAR_API_KEY" \
  -d '{
    "query": "mutation ProjectMilestoneCreate($input: ProjectMilestoneCreateInput!) { projectMilestoneCreate(input: $input) { success projectMilestone { id name status progress targetDate } } }",
    "variables": {
      "input": {
        "projectId": "PROJECT_ID_HERE",
        "name": "MVP Launch",
        "description": "# MVP Goals\n\n- Core features complete\n- 10 beta users onboarded",
        "targetDate": "2025-06-30"
      }
    }
  }'
```

**Available parameters:**
- `projectId` (required): Parent project ID
- `name` (required): Milestone name
- `description`: Markdown description
- `targetDate`: Target date (YYYY-MM-DD format)
- `sortOrder`: Display order (float)

**Status values (auto-calculated):**
- `unstarted`: No progress yet
- `next`: Next milestone to work on
- `overdue`: Past target date
- `done`: All issues completed

### Updating a Milestone

```bash
curl -X POST https://api.linear.app/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: $LINEAR_API_KEY" \
  -d '{
    "query": "mutation ProjectMilestoneUpdate($id: String!, $input: ProjectMilestoneUpdateInput!) { projectMilestoneUpdate(id: $id, input: $input) { success projectMilestone { id name status targetDate } } }",
    "variables": {
      "id": "MILESTONE_ID",
      "input": {
        "name": "MVP Launch - Extended",
        "targetDate": "2025-07-15"
      }
    }
  }'
```

### Listing Milestones

```bash
curl -X POST https://api.linear.app/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: $LINEAR_API_KEY" \
  -d '{
    "query": "query ProjectMilestones($first: Int) { projectMilestones(first: $first) { nodes { id name status progress targetDate project { id name } issues { nodes { id title } } } } }",
    "variables": {
      "first": 50
    }
  }'
```

### Deleting a Milestone

```bash
curl -X POST https://api.linear.app/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: $LINEAR_API_KEY" \
  -d '{
    "query": "mutation ProjectMilestoneDelete($id: String!) { projectMilestoneDelete(id: $id) { success } }",
    "variables": {
      "id": "MILESTONE_ID"
    }
  }'
```

---

## Usage Guidelines

### When to use this skill

**Activity reports:**
- User asks for "Linear activity" or "activity report"
- User wants activity summary for a date range

**Document operations:**
- User asks to "create a document" or "write a doc"
- User wants to "update document content"
- User needs to "delete" or "archive" a document

**Milestone operations:**
- User asks to "create a milestone" or "add milestone"
- User wants to "set target date for milestone"
- User needs to "list project milestones" or "show milestone progress"

### How to use

1. **Always check for LINEAR_API_KEY (for GraphQL operations):**
   ```bash
   if [ -z "$LINEAR_API_KEY" ]; then
     echo "Error: LINEAR_API_KEY not set. Get key from https://linear.app/settings/api"
     exit 1
   fi
   ```

2. **Get IDs first:**
   - Use Linear MCP's `list_projects` to get project IDs
   - Use Linear MCP's `list_issues` to get issue IDs
   - Use `list_documents` to get document IDs/slugs

3. **For milestone operations, use AskUserQuestion:**
   - When creating a milestone, ask for targetDate
   - Parse the user's response and include in the mutation

---

## Troubleshooting

### Linear MCP Connection Error

**Symptom**: `mcp__linear__get_user` fails

**Solutions**:
1. Verify MCP configuration in `~/.claude.json`
2. Test connection: `mcp__linear__list_teams()`
3. Check Linear workspace access
4. Re-authenticate if needed

### Authentication Errors (GraphQL)

```json
{"errors": [{"message": "Authentication required"}]}
```
Check if LINEAR_API_KEY is set and valid

### No Activities Found

**Cause**: No activities in date range or filters too restrictive

**Solutions**:
- Expand date range
- Check `assignee="me"` filter
- Verify team access

### Rate Limiting

```json
{"errors": [{"message": "Rate limit exceeded"}]}
```
Wait and retry after a few seconds

---

## Integration with calendar-sync

Generated JSON reports are compatible with calendar-sync skill:

```
1. Generate report -> ~/.claude/tmp/linear-activity/reports/YYYY-MM-DD.json
2. Run calendar-sync -> Generates gcalcli commands -> Adds to Google Calendar
```

---

## References

- [references/api-reference.md](references/api-reference.md) - Linear MCP API functions
- [references/output-template.md](references/output-template.md) - Report format specification
- [references/document-schema.md](references/document-schema.md) - Document type definitions
- [references/milestone-schema.md](references/milestone-schema.md) - Milestone type definitions
- [references/examples.md](references/examples.md) - Additional usage examples
