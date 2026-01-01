# ProjectMilestone GraphQL Schema Reference

Complete type definitions for Linear ProjectMilestone API.

---

## ProjectMilestone Type

```graphql
type ProjectMilestone implements Node {
  """
  The time at which the entity was archived.
  """
  archivedAt: DateTime

  """
  The time at which the entity was created.
  """
  createdAt: DateTime!

  """
  [Internal] The current progress of the project milestone as a JSON object.
  Contains detailed progress information including completed/total counts.
  """
  currentProgress: JSONObject!

  """
  The project milestone's description in markdown format.
  """
  description: String

  """
  [Internal] The project milestone's description as YJS state.
  Used for collaborative editing.
  """
  descriptionState: String

  """
  The content of the project milestone description.
  Links to DocumentContent for rich formatting.
  """
  documentContent: DocumentContent

  """
  The unique identifier of the entity.
  """
  id: ID!

  """
  Issues associated with the project milestone.
  """
  issues(
    after: String
    before: String
    filter: IssueFilter
    first: Int
    includeArchived: Boolean
    last: Int
    orderBy: PaginationOrderBy
  ): IssueConnection!

  """
  The name of the project milestone.
  """
  name: String!

  """
  The progress percentage of the project milestone (0.0 to 1.0).
  Calculated from completed vs total issues.
  """
  progress: Float!

  """
  [Internal] The progress history of the project milestone as JSON.
  Tracks progress over time for reporting.
  """
  progressHistory: JSONObject!

  """
  The project of the milestone.
  """
  project: Project!

  """
  The order of the milestone in relation to other milestones within a project.
  """
  sortOrder: Float!

  """
  The status of the project milestone.
  Auto-calculated based on progress and target date.
  """
  status: ProjectMilestoneStatus!

  """
  The planned completion date of the milestone (date only, no time).
  """
  targetDate: TimelessDate

  """
  The last time at which the entity was meaningfully updated.
  """
  updatedAt: DateTime!
}
```

---

## ProjectMilestoneStatus

```graphql
enum ProjectMilestoneStatus {
  """
  Milestone is complete (all issues done).
  """
  done

  """
  Next milestone to work on (automatically determined).
  """
  next

  """
  Milestone is past its target date and not complete.
  """
  overdue

  """
  Milestone hasn't been started yet (no progress).
  """
  unstarted
}
```

**Status is auto-calculated based on:**
- `done`: `progress == 1.0` (100%)
- `overdue`: `targetDate < today` AND `progress < 1.0`
- `next`: The earliest incomplete milestone
- `unstarted`: `progress == 0.0` (0%)

---

## ProjectMilestoneCreateInput

```graphql
input ProjectMilestoneCreateInput {
  """
  The description in markdown format.
  """
  description: String

  """
  [Internal] Prosemirror document for the description.
  Used by Linear's internal editor.
  """
  descriptionData: JSONObject

  """
  The identifier in UUID v4 format. If not provided, one will be generated.
  """
  id: String

  """
  The name of the milestone (required).
  """
  name: String!

  """
  The project ID to create the milestone in (required).
  """
  projectId: String!

  """
  The order of the milestone (float for flexibility).
  """
  sortOrder: Float

  """
  The planned completion date (YYYY-MM-DD format).
  """
  targetDate: TimelessDate
}
```

---

## ProjectMilestoneUpdateInput

```graphql
input ProjectMilestoneUpdateInput {
  """
  The updated description in markdown format.
  """
  description: String

  """
  [Internal] Updated Prosemirror document.
  """
  descriptionData: JSONObject

  """
  The updated name.
  """
  name: String

  """
  Move to a different project (use projectMilestoneMove instead).
  """
  projectId: String

  """
  The updated sort order.
  """
  sortOrder: Float

  """
  The updated target date (YYYY-MM-DD format).
  """
  targetDate: TimelessDate
}
```

---

## ProjectMilestoneFilter

```graphql
input ProjectMilestoneFilter {
  """
  Compound filter: all conditions must match.
  """
  and: [ProjectMilestoneFilter!]

  """
  Filter by creation date.
  """
  createdAt: DateComparator

  """
  Filter by ID.
  """
  id: IDComparator

  """
  Filter by name.
  """
  name: NullableStringComparator

  """
  Compound filter: any condition must match.
  """
  or: [ProjectMilestoneFilter!]

  """
  Filter by target date.
  """
  targetDate: NullableDateComparator

  """
  Filter by last update date.
  """
  updatedAt: DateComparator
}
```

---

## ProjectMilestoneMoveInput

```graphql
input ProjectMilestoneMoveInput {
  """
  The target project ID to move the milestone to (required).
  """
  projectId: String!
}
```

---

## Mutations

### projectMilestoneCreate

```graphql
projectMilestoneCreate(
  input: ProjectMilestoneCreateInput!
): ProjectMilestonePayload!
```

Creates a new project milestone.

**Example:**
```graphql
mutation CreateMilestone($input: ProjectMilestoneCreateInput!) {
  projectMilestoneCreate(input: $input) {
    success
    lastSyncId
    projectMilestone {
      id
      name
      status
      progress
      targetDate
      sortOrder
      createdAt
      project {
        id
        name
        state
      }
      issues {
        nodes {
          id
          title
        }
      }
    }
  }
}
```

**Variables:**
```json
{
  "input": {
    "projectId": "project-123",
    "name": "MVP Launch",
    "description": "# Milestone Goals\n\n- Core features\n- Beta testing",
    "targetDate": "2025-06-30"
  }
}
```

---

### projectMilestoneUpdate

```graphql
projectMilestoneUpdate(
  id: String!
  input: ProjectMilestoneUpdateInput!
): ProjectMilestonePayload!
```

Updates an existing project milestone.

**Example:**
```graphql
mutation UpdateMilestone($id: String!, $input: ProjectMilestoneUpdateInput!) {
  projectMilestoneUpdate(id: $id, input: $input) {
    success
    projectMilestone {
      id
      name
      description
      status
      progress
      targetDate
      updatedAt
    }
  }
}
```

**Variables:**
```json
{
  "id": "milestone-xyz",
  "input": {
    "name": "MVP Launch - Extended",
    "targetDate": "2025-07-15",
    "description": "Updated goals and timeline"
  }
}
```

---

### projectMilestoneDelete

```graphql
projectMilestoneDelete(id: String!): DeletePayload!
```

Deletes a project milestone.

**Example:**
```graphql
mutation DeleteMilestone($id: String!) {
  projectMilestoneDelete(id: $id) {
    success
    lastSyncId
  }
}
```

**Note:** This permanently deletes the milestone. Issues associated with it will not be deleted, but will lose their milestone association.

---

### projectMilestoneMove

```graphql
projectMilestoneMove(
  id: String!
  input: ProjectMilestoneMoveInput!
): ProjectMilestoneMovePayload!
```

Moves a milestone to a different project.

**Example:**
```graphql
mutation MoveMilestone($id: String!, $input: ProjectMilestoneMoveInput!) {
  projectMilestoneMove(id: $id, input: $input) {
    success
    projectMilestone {
      id
      name
      project {
        id
        name
      }
    }
  }
}
```

**Variables:**
```json
{
  "id": "milestone-xyz",
  "input": {
    "projectId": "new-project-456"
  }
}
```

---

## Queries

### projectMilestone

```graphql
projectMilestone(id: String!): ProjectMilestone!
```

Fetches a single project milestone by ID.

**Example:**
```graphql
query GetMilestone($id: String!) {
  projectMilestone(id: $id) {
    id
    name
    description
    status
    progress
    progressHistory
    currentProgress
    targetDate
    sortOrder
    createdAt
    updatedAt
    archivedAt
    project {
      id
      name
      state
      startDate
      targetDate
    }
    documentContent {
      id
      content
    }
    issues {
      nodes {
        id
        identifier
        title
        state {
          name
          type
        }
        assignee {
          id
          name
        }
        completedAt
      }
    }
  }
}
```

---

### projectMilestones

```graphql
projectMilestones(
  after: String
  before: String
  filter: ProjectMilestoneFilter
  first: Int
  includeArchived: Boolean
  last: Int
  orderBy: PaginationOrderBy
): ProjectMilestoneConnection!
```

Lists all project milestones with pagination and filtering.

**Example:**
```graphql
query ListMilestones($first: Int, $filter: ProjectMilestoneFilter) {
  projectMilestones(first: $first, filter: $filter) {
    nodes {
      id
      name
      status
      progress
      targetDate
      sortOrder
      project {
        id
        name
      }
      issues {
        nodes {
          id
          title
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

**Filter by project:**
```json
{
  "first": 50,
  "filter": {
    "project": {
      "id": {
        "eq": "project-123"
      }
    }
  }
}
```

---

### Milestones via Project

You can also access milestones through the parent project:

```graphql
query ProjectWithMilestones($projectId: String!) {
  project(id: $projectId) {
    id
    name
    projectMilestones {
      nodes {
        id
        name
        status
        progress
        targetDate
        issues {
          nodes {
            id
            title
            state {
              name
            }
          }
        }
      }
    }
  }
}
```

---

## Understanding Progress

### Progress Calculation

Progress is automatically calculated:
```
progress = completedIssues / totalIssues
```

**Example:**
- 3 issues completed, 10 total → `progress = 0.3` (30%)
- All issues completed → `progress = 1.0` (100%)
- No issues → `progress = 0.0` (0%)

### Current Progress Object

The `currentProgress` field contains:
```json
{
  "total": 10,
  "completed": 3,
  "inProgress": 4,
  "todo": 3,
  "percentage": 30
}
```

### Progress History

The `progressHistory` field tracks progress over time:
```json
[
  { "date": "2025-01-01", "progress": 0.1 },
  { "date": "2025-01-15", "progress": 0.3 },
  { "date": "2025-02-01", "progress": 0.6 }
]
```

Useful for generating progress charts and reports.

---

## Status Logic

### How Status is Determined

```
if progress == 1.0:
    status = "done"
elif targetDate && targetDate < today && progress < 1.0:
    status = "overdue"
elif is_earliest_incomplete_milestone:
    status = "next"
else:
    status = "unstarted"
```

### Status Transitions

```
unstarted → next → overdue/done
              ↓
            done
```

- **unstarted**: No work started
- **next**: Next in line to work on
- **overdue**: Past target date, not complete
- **done**: All issues completed

---

## Best Practices

### Naming Milestones

Good names:
- ✅ "MVP Launch"
- ✅ "Beta Release"
- ✅ "Q1 2025 Goals"

Avoid:
- ❌ "Milestone 1" (not descriptive)
- ❌ "TODO" (too generic)

### Setting Target Dates

- Use realistic dates based on team capacity
- Consider buffer time for unexpected issues
- Review and adjust dates as needed

### Organizing Issues

1. Assign issues to milestones
2. Keep milestone scope focused
3. Break down large milestones into smaller ones
4. Review progress regularly

### Sort Order

Use `sortOrder` to control milestone sequence:
```
1000.0 - Phase 1: Research
2000.0 - Phase 2: Development
3000.0 - Phase 3: Testing
4000.0 - Phase 4: Launch
```

Using increments of 1000 allows inserting new milestones between existing ones.

---

## Examples

### Create Milestone with Issues

```bash
# 1. Create the milestone
curl -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -d '{
    "query": "mutation { projectMilestoneCreate(input: { projectId: \"proj-123\", name: \"Beta Release\", targetDate: \"2025-06-30\" }) { success projectMilestone { id } } }"
  }' | jq -r '.data.projectMilestoneCreate.projectMilestone.id'

# Save the milestone ID
MILESTONE_ID="..."

# 2. Assign issues to the milestone (using Linear MCP)
# Use Linear MCP's update_issue to set projectMilestoneId
```

### Track Milestone Progress

```bash
# Get milestone with progress details
curl -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -d '{
    "query": "query { projectMilestone(id: \"milestone-xyz\") { name progress currentProgress issues { nodes { id title state { type } } } } }"
  }' | jq '.data.projectMilestone | {
    name,
    progress: (.progress * 100 | tostring + "%"),
    issues: .currentProgress
  }'
```

### List Overdue Milestones

```bash
TODAY=$(date +%Y-%m-%d)

curl -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -d "{
    \"query\": \"query { projectMilestones(first: 50, filter: { targetDate: { lt: \\\"$TODAY\\\" } }) { nodes { name status targetDate progress project { name } } } }\"
  }" | jq '.data.projectMilestones.nodes[] | select(.status == "overdue")'
```

---

## Tips

### Milestone vs Project

**Project**: Long-term effort with multiple milestones
```
Project: "Mobile App Redesign"
├─ Milestone: "Design Phase" (2025-02-28)
├─ Milestone: "Development Phase" (2025-04-30)
└─ Milestone: "Beta Testing" (2025-06-30)
```

**Milestone**: Specific deliverable or goal within a project

### Integration with Issues

Issues can be assigned to milestones:
```graphql
mutation UpdateIssue($id: String!, $projectMilestoneId: String!) {
  issueUpdate(id: $id, input: { projectMilestoneId: $projectMilestoneId }) {
    success
  }
}
```

### Archiving Milestones

Milestones are automatically archived when their parent project is archived. You can query archived milestones with:
```graphql
{
  projectMilestones(includeArchived: true) {
    nodes {
      id
      name
      archivedAt
    }
  }
}
```
