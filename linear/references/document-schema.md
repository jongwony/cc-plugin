# Document GraphQL Schema Reference

Complete type definitions for Linear Document API.

---

## Document Type

```graphql
type Document implements Node {
  """
  The time at which the entity was archived. Null if the entity has not been archived.
  """
  archivedAt: DateTime

  """
  The color of the icon (hex format, e.g., "#FF6B6B")
  """
  color: String

  """
  Comments associated with the document.
  """
  comments(
    after: String
    before: String
    filter: CommentFilter
    first: Int
    includeArchived: Boolean
    last: Int
    orderBy: PaginationOrderBy
  ): CommentConnection!

  """
  The document's content in markdown format.
  """
  content: String

  """
  [Internal] The document's content as YJS state (base64 encoded).
  Used for collaborative editing.
  """
  contentState: String

  """
  The time at which the entity was created.
  """
  createdAt: DateTime!

  """
  The user who created the document.
  """
  creator: User

  """
  The ID of the document content associated with the document.
  Used for tracking content history.
  """
  documentContentId: String

  """
  The time at which the document was hidden. Null if not hidden.
  """
  hiddenAt: DateTime

  """
  The icon of the document (emoji or icon name).
  """
  icon: String

  """
  The unique identifier of the entity.
  """
  id: ID!

  """
  The initiative that the document is associated with.
  """
  initiative: Initiative

  """
  The issue that the document is associated with.
  """
  issue: Issue

  """
  The last template that was applied to this document.
  """
  lastAppliedTemplate: Template

  """
  The project that the document is associated with.
  """
  project: Project

  """
  The document's unique URL slug (short identifier).
  """
  slugId: String!

  """
  The order of the item in the resources list.
  """
  sortOrder: Float!

  """
  [Internal] The team that the document is associated with.
  """
  team: Team

  """
  The document title.
  """
  title: String!

  """
  A flag that indicates whether the document is in the trash bin.
  """
  trashed: Boolean

  """
  The last time at which the entity was meaningfully updated.
  """
  updatedAt: DateTime!

  """
  The user who last updated the document.
  """
  updatedBy: User

  """
  The canonical URL for the document (e.g., https://linear.app/workspace/doc/title-slug).
  """
  url: String!
}
```

---

## DocumentCreateInput

```graphql
input DocumentCreateInput {
  """
  The color of the icon (hex format, e.g., "#FF6B6B")
  """
  color: String

  """
  The document content in markdown format.
  Supports full markdown including headers, lists, code blocks, etc.
  """
  content: String

  """
  The icon of the document (emoji or icon name).
  Examples: "📄", "document", "note"
  """
  icon: String

  """
  The identifier in UUID v4 format. If not provided, one will be generated.
  """
  id: String

  """
  [Internal] The initiative to associate the document with.
  """
  initiativeId: String

  """
  [Internal] The issue to associate the document with.
  """
  issueId: String

  """
  The ID of the last template that was applied to the document.
  """
  lastAppliedTemplateId: String

  """
  The project to associate the document with.
  """
  projectId: String

  """
  [Internal] The resource folder to place the document in.
  """
  resourceFolderId: String

  """
  The order of the document in the list (float for flexibility).
  """
  sortOrder: Float

  """
  [INTERNAL] IDs of users to subscribe to the document.
  """
  subscriberIds: [String!]

  """
  [Internal] The team to associate the document with.
  """
  teamId: String

  """
  The title of the document (required).
  """
  title: String!
}
```

---

## DocumentUpdateInput

```graphql
input DocumentUpdateInput {
  """
  The new color of the icon.
  """
  color: String

  """
  The new document content in markdown format.
  """
  content: String

  """
  The time to hide the document. Set to null to unhide.
  """
  hiddenAt: DateTime

  """
  The new icon of the document.
  """
  icon: String

  """
  Move the document to a different initiative.
  """
  initiativeId: String

  """
  Move the document to a different issue.
  """
  issueId: String

  """
  Update the last applied template.
  """
  lastAppliedTemplateId: String

  """
  Move the document to a different project.
  """
  projectId: String

  """
  Move the document to a different resource folder.
  """
  resourceFolderId: String

  """
  Update the sort order.
  """
  sortOrder: Float

  """
  Update the list of subscribers.
  """
  subscriberIds: [String!]

  """
  Move the document to a different team.
  """
  teamId: String

  """
  The new title.
  """
  title: String

  """
  Move to trash (true) or restore from trash (false).
  """
  trashed: Boolean
}
```

---

## DocumentFilter

```graphql
input DocumentFilter {
  """
  Compound filter: all conditions must match.
  """
  and: [DocumentFilter!]

  """
  Filter by creation date.
  """
  createdAt: DateComparator

  """
  Filter by creator.
  """
  creator: UserFilter

  """
  Filter by ID.
  """
  id: IDComparator

  """
  Filter by associated initiative.
  """
  initiative: InitiativeFilter

  """
  Filter by associated issue.
  """
  issue: IssueFilter

  """
  Compound filter: any condition must match.
  """
  or: [DocumentFilter!]

  """
  Filter by associated project.
  """
  project: ProjectFilter

  """
  Filter by slug ID.
  """
  slugId: StringComparator

  """
  Filter by title.
  """
  title: StringComparator

  """
  Filter by last update date.
  """
  updatedAt: DateComparator
}
```

---

## DocumentPayload

```graphql
type DocumentPayload {
  """
  The identifier of the last sync operation.
  """
  lastSyncId: Float!

  """
  The document that was created or updated.
  """
  document: Document!

  """
  Whether the operation was successful.
  """
  success: Boolean!
}
```

---

## DocumentArchivePayload

```graphql
type DocumentArchivePayload {
  """
  The identifier of the last sync operation.
  """
  lastSyncId: Float!

  """
  Whether the operation was successful.
  """
  success: Boolean!

  """
  The archived or restored document.
  """
  entity: Document
}
```

---

## Mutations

### documentCreate

```graphql
documentCreate(input: DocumentCreateInput!): DocumentPayload!
```

Creates a new document.

**Example:**
```graphql
mutation CreateDocument($input: DocumentCreateInput!) {
  documentCreate(input: $input) {
    success
    lastSyncId
    document {
      id
      title
      url
      slugId
      content
      createdAt
      creator {
        id
        name
        email
      }
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
  "input": {
    "title": "Technical Design",
    "content": "# Design\n\nDetails here.",
    "projectId": "abc-123",
    "icon": "📐",
    "color": "#4A90E2"
  }
}
```

---

### documentUpdate

```graphql
documentUpdate(
  id: String!
  input: DocumentUpdateInput!
): DocumentPayload!
```

Updates an existing document.

**Parameters:**
- `id`: Document ID or URL slug

**Example:**
```graphql
mutation UpdateDocument($id: String!, $input: DocumentUpdateInput!) {
  documentUpdate(id: $id, input: $input) {
    success
    document {
      id
      title
      content
      updatedAt
      updatedBy {
        name
      }
    }
  }
}
```

---

### documentDelete

```graphql
documentDelete(id: String!): DocumentArchivePayload!
```

Permanently deletes (archives) a document.

**Example:**
```graphql
mutation DeleteDocument($id: String!) {
  documentDelete(id: $id) {
    success
    lastSyncId
  }
}
```

---

### documentUnarchive

```graphql
documentUnarchive(id: String!): DocumentArchivePayload!
```

Restores an archived document.

**Example:**
```graphql
mutation UnarchiveDocument($id: String!) {
  documentUnarchive(id: $id) {
    success
    entity {
      id
      title
      archivedAt
    }
  }
}
```

---

## Queries

### document

```graphql
document(id: String!): Document!
```

Fetches a single document by ID or slug.

**Example:**
```graphql
query GetDocument($id: String!) {
  document(id: $id) {
    id
    title
    content
    slugId
    url
    createdAt
    updatedAt
    creator {
      name
    }
    project {
      name
    }
    comments {
      nodes {
        body
        createdAt
        user {
          name
        }
      }
    }
  }
}
```

---

### documents

```graphql
documents(
  after: String
  before: String
  filter: DocumentFilter
  first: Int
  includeArchived: Boolean
  last: Int
  orderBy: PaginationOrderBy
): DocumentConnection!
```

Lists documents with pagination and filtering.

**Example:**
```graphql
query ListDocuments($first: Int, $filter: DocumentFilter) {
  documents(first: $first, filter: $filter) {
    nodes {
      id
      title
      slugId
      url
      createdAt
      project {
        name
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

---

### documentContentHistory

```graphql
documentContentHistory(id: String!): DocumentContentHistoryPayload!
```

Retrieves the content history for a document.

**Example:**
```graphql
query DocumentHistory($id: String!) {
  documentContentHistory(id: $id) {
    history {
      id
      content
      createdAt
      updatedAt
    }
  }
}
```

---

## Tips

### Working with Markdown Content

**Line breaks:** Use `\n` for newlines in JSON:
```json
{
  "content": "# Title\n\nParagraph 1\n\nParagraph 2"
}
```

**Code blocks:**
```json
{
  "content": "# Code Example\n\n```javascript\nconst x = 1;\n```"
}
```

**Tables:**
```json
{
  "content": "| Column 1 | Column 2 |\n|----------|----------|\n| Value 1  | Value 2  |"
}
```

### Document URLs

Documents have predictable URLs:
```
https://linear.app/{workspace}/doc/{title-slug}-{slugId}
```

You can access a document by:
- Full ID: `doc_abc123xyz`
- Slug ID only: `abc123xyz`

### Ordering Documents

Use `sortOrder` to control position:
- Lower values appear first
- Use floats for flexible reordering: `1.0`, `1.5`, `2.0`
- Default increment: 1000

### Document States

A document can be in several states:
- **Active**: `archivedAt: null`, `trashed: false`
- **Trashed**: `trashed: true` (can be restored)
- **Archived**: `archivedAt: DateTime` (permanently deleted)
- **Hidden**: `hiddenAt: DateTime` (hidden from view)
