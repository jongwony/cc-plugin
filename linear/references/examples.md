# Linear Extended - Usage Examples

Real-world examples and workflows for using the Linear Extended skill.

---

## Complete Workflows

### Workflow 1: Project Documentation Setup

**Scenario:** Starting a new project with initial documentation.

```bash
# Step 1: Create project (using Linear MCP)
PROJECT_ID=$(curl -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -d '{
    "query": "mutation { projectCreate(input: { name: \"Mobile App Redesign\", description: \"Complete redesign of mobile experience\" }) { project { id } } }"
  }' | jq -r '.data.projectCreate.project.id')

# Step 2: Create technical spec document
DOC_ID=$(curl -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -d "{
    \"query\": \"mutation { documentCreate(input: { title: \\\"Technical Specification\\\", content: \\\"# Architecture\\n\\n## Overview\\nTBD\\n\\n## Components\\nTBD\\\", projectId: \\\"$PROJECT_ID\\\", icon: \\\"📐\\\" }) { success document { id url } } }\"
  }" | jq -r '.data.documentCreate.document.id')

echo "Created document: $DOC_ID"

# Step 3: Create project roadmap document
curl -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -d "{
    \"query\": \"mutation { documentCreate(input: { title: \\\"Project Roadmap\\\", content: \\\"# Q1 2025 Roadmap\\n\\n- Design phase\\n- Development\\n- Testing\\\", projectId: \\\"$PROJECT_ID\\\", icon: \\\"🗺️\\\" }) { success document { id url } } }\"
  }"

# Step 4: Create milestones
curl -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -d "{
    \"query\": \"mutation { projectMilestoneCreate(input: { projectId: \\\"$PROJECT_ID\\\", name: \\\"Design Complete\\\", targetDate: \\\"2025-02-28\\\" }) { success projectMilestone { id } } }\"
  }"

curl -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -d "{
    \"query\": \"mutation { projectMilestoneCreate(input: { projectId: \\\"$PROJECT_ID\\\", name: \\\"Development Complete\\\", targetDate: \\\"2025-04-30\\\" }) { success projectMilestone { id } } }\"
  }"

curl -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -d "{
    \"query\": \"mutation { projectMilestoneCreate(input: { projectId: \\\"$PROJECT_ID\\\", name: \\\"Beta Launch\\\", targetDate: \\\"2025-06-30\\\" }) { success projectMilestone { id } } }\"
  }"

echo "Project setup complete!"
```

---

### Workflow 2: Weekly Documentation Updates

**Scenario:** Update project documentation with weekly progress.

```bash
#!/bin/bash
# weekly-update.sh

PROJECT_ID="your-project-id"
WEEK_NUM=$(date +%V)
DATE=$(date +%Y-%m-%d)

# Get the project roadmap document
DOC_ID=$(curl -s -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -d "{
    \"query\": \"query { documents(filter: { project: { id: { eq: \\\"$PROJECT_ID\\\" } }, title: { contains: \\\"Roadmap\\\" } }) { nodes { id content } } }\"
  }" | jq -r '.data.documents.nodes[0].id')

CURRENT_CONTENT=$(curl -s -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -d "{
    \"query\": \"query { document(id: \\\"$DOC_ID\\\") { content } }\"
  }" | jq -r '.data.document.content')

# Append weekly update
NEW_CONTENT="$CURRENT_CONTENT\n\n## Week $WEEK_NUM Update ($DATE)\n\n### Completed\n- \n\n### In Progress\n- \n\n### Blockers\n- "

# Update document using temp file
TEMP_FILE=$(mktemp)
python3 << EOF > "$TEMP_FILE"
import json
data = {
    "query": """mutation DocumentUpdate(\$id: String!, \$input: DocumentUpdateInput!) {
        documentUpdate(id: \$id, input: \$input) {
            success
        }
    }""",
    "variables": {
        "id": "$DOC_ID",
        "input": {
            "content": """$NEW_CONTENT"""
        }
    }
}
print(json.dumps(data, ensure_ascii=False))
EOF

curl -X POST https://api.linear.app/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: $LINEAR_API_KEY" \
  -d @"$TEMP_FILE"

rm "$TEMP_FILE"
echo "Weekly update added to roadmap document"
```

---

### Workflow 3: Milestone Progress Report

**Scenario:** Generate a report of all milestones and their progress.

```bash
#!/bin/bash
# milestone-report.sh

echo "=== Milestone Progress Report ==="
echo "Generated: $(date)"
echo ""

curl -s -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -d '{
    "query": "query { projectMilestones(first: 100) { nodes { name status progress targetDate project { name } issues { nodes { id state { type } } } } } }"
  }' | jq -r '
    .data.projectMilestones.nodes[] |
    "Project: \(.project.name)\n" +
    "Milestone: \(.name)\n" +
    "Status: \(.status | ascii_upcase)\n" +
    "Progress: \((.progress * 100 | round))%\n" +
    "Target Date: \(.targetDate // "Not set")\n" +
    "Issues: \(.issues.nodes | length)\n" +
    "---"
  '
```

**Output:**
```
=== Milestone Progress Report ===
Generated: 2025-01-17

Project: Mobile App Redesign
Milestone: Design Complete
Status: DONE
Progress: 100%
Target Date: 2025-02-28
Issues: 12
---

Project: Mobile App Redesign
Milestone: Development Complete
Status: NEXT
Progress: 45%
Target Date: 2025-04-30
Issues: 28
---

Project: Mobile App Redesign
Milestone: Beta Launch
Status: UNSTARTED
Progress: 0%
Target Date: 2025-06-30
Issues: 8
---
```

---

### Workflow 4: Document Template Application

**Scenario:** Create multiple documents from a template.

```bash
#!/bin/bash
# create-from-template.sh

TEMPLATE_CONTENT='# Meeting Notes

## Date
[DATE]

## Attendees
-

## Agenda
1.

## Discussion
-

## Action Items
- [ ]

## Next Meeting
TBD'

PROJECTS=("proj-123" "proj-456" "proj-789")
DATE=$(date +%Y-%m-%d)

for PROJECT_ID in "${PROJECTS[@]}"; do
  # Get project name
  PROJECT_NAME=$(curl -s -X POST https://api.linear.app/graphql \
    -H "Authorization: $LINEAR_API_KEY" \
    -d "{
      \"query\": \"query { project(id: \\\"$PROJECT_ID\\\") { name } }\"
    }" | jq -r '.data.project.name')

  # Replace [DATE] placeholder
  CONTENT="${TEMPLATE_CONTENT//\[DATE\]/$DATE}"

  # Create document using temp file
  TEMP_FILE=$(mktemp)
  python3 << EOF > "$TEMP_FILE"
import json
data = {
    "query": """mutation DocumentCreate(\$input: DocumentCreateInput!) {
        documentCreate(input: \$input) {
            success
            document { id url }
        }
    }""",
    "variables": {
        "input": {
            "title": f"Meeting Notes - {$DATE}",
            "content": """$CONTENT""",
            "projectId": "$PROJECT_ID"
        }
    }
}
print(json.dumps(data, ensure_ascii=False))
EOF

  curl -X POST https://api.linear.app/graphql \
    -H "Content-Type: application/json" \
    -H "Authorization: $LINEAR_API_KEY" \
    -d @"$TEMP_FILE"

  rm "$TEMP_FILE"
  echo "Created meeting notes for $PROJECT_NAME"
done
```

---

### Workflow 5: Milestone Burndown Data

**Scenario:** Extract milestone progress for burndown chart.

```bash
#!/bin/bash
# milestone-burndown.sh

MILESTONE_ID="$1"

if [ -z "$MILESTONE_ID" ]; then
  echo "Usage: $0 <milestone-id>"
  exit 1
fi

# Get milestone with issues
DATA=$(curl -s -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -d "{
    \"query\": \"query { projectMilestone(id: \\\"$MILESTONE_ID\\\") { name targetDate progressHistory issues { nodes { id completedAt } } } }\"
  }")

echo "Milestone: $(echo $DATA | jq -r '.data.projectMilestone.name')"
echo "Target: $(echo $DATA | jq -r '.data.projectMilestone.targetDate')"
echo ""
echo "Date,Remaining Issues"

# Extract progress history and calculate remaining
echo $DATA | jq -r '
  .data.projectMilestone |
  .progressHistory as $history |
  (.issues.nodes | length) as $total |
  $history[] |
  "\(.date),\($total - ($total * .progress | floor))"
'
```

---

## Advanced Techniques

### Using jq for Complex Transformations

**Extract document IDs by project:**
```bash
curl -s -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -d '{
    "query": "query { documents(first: 100) { nodes { id title project { id name } } } }"
  }' | jq -r '
    [.data.documents.nodes[] | {project: .project.name, id, title}] |
    group_by(.project) |
    map({
      project: .[0].project,
      documents: [.[] | {id, title}]
    })
  '
```

**Output:**
```json
[
  {
    "project": "Mobile App Redesign",
    "documents": [
      { "id": "doc-123", "title": "Technical Spec" },
      { "id": "doc-456", "title": "Project Roadmap" }
    ]
  }
]
```

---

### Batch Operations

**Create multiple milestones at once:**
```bash
#!/bin/bash
# batch-create-milestones.sh

PROJECT_ID="$1"
MILESTONES_FILE="$2"

# milestones.json format:
# [
#   {"name": "Phase 1", "targetDate": "2025-03-31"},
#   {"name": "Phase 2", "targetDate": "2025-06-30"}
# ]

jq -c '.[]' "$MILESTONES_FILE" | while read milestone; do
  NAME=$(echo $milestone | jq -r '.name')
  TARGET=$(echo $milestone | jq -r '.targetDate')

  TEMP_FILE=$(mktemp)
  python3 << EOF > "$TEMP_FILE"
import json
data = {
    "query": """mutation ProjectMilestoneCreate(\$input: ProjectMilestoneCreateInput!) {
        projectMilestoneCreate(input: \$input) {
            success
            projectMilestone { id name }
        }
    }""",
    "variables": {
        "input": {
            "projectId": "$PROJECT_ID",
            "name": "$NAME",
            "targetDate": "$TARGET"
        }
    }
}
print(json.dumps(data, ensure_ascii=False))
EOF

  curl -X POST https://api.linear.app/graphql \
    -H "Content-Type: application/json" \
    -H "Authorization: $LINEAR_API_KEY" \
    -d @"$TEMP_FILE" | jq -r '.data.projectMilestoneCreate.projectMilestone | "Created: \(.name) (\(.id))"'

  rm "$TEMP_FILE"
  sleep 0.5  # Rate limiting
done
```

---

### Document Content Management

**Search and replace in document:**
```bash
#!/bin/bash
# document-search-replace.sh

DOC_ID="$1"
SEARCH_TERM="$2"
REPLACE_TERM="$3"

# Get current content
CONTENT=$(curl -s -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -d "{
    \"query\": \"query { document(id: \\\"$DOC_ID\\\") { content } }\"
  }" | jq -r '.data.document.content')

# Replace
NEW_CONTENT="${CONTENT//$SEARCH_TERM/$REPLACE_TERM}"

# Update
curl -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -d "{
    \"query\": \"mutation { documentUpdate(id: \\\"$DOC_ID\\\", input: { content: $(echo "$NEW_CONTENT" | jq -Rs .) }) { success } }\"
  }"

echo "Replaced '$SEARCH_TERM' with '$REPLACE_TERM' in document $DOC_ID"
```

---

### Milestone Dependencies

**Create dependent milestones with sort order:**
```bash
#!/bin/bash
# create-milestone-chain.sh

PROJECT_ID="$1"
shift
MILESTONE_NAMES=("$@")

SORT_ORDER=1000.0

for NAME in "${MILESTONE_NAMES[@]}"; do
  curl -X POST https://api.linear.app/graphql \
    -H "Authorization: $LINEAR_API_KEY" \
    -d "{
      \"query\": \"mutation { projectMilestoneCreate(input: { projectId: \\\"$PROJECT_ID\\\", name: \\\"$NAME\\\", sortOrder: $SORT_ORDER }) { success projectMilestone { id name sortOrder } } }\"
    }" | jq -r '.data.projectMilestoneCreate.projectMilestone | "Created: \(.name) (order: \(.sortOrder))"'

  SORT_ORDER=$(echo "$SORT_ORDER + 1000" | bc)
  sleep 0.5
done

# Usage: ./create-milestone-chain.sh proj-123 "Design" "Development" "Testing" "Launch"
```

---

## Integration Examples

### Slack Notification on Milestone Completion

```bash
#!/bin/bash
# notify-milestone-completion.sh

MILESTONE_ID="$1"
SLACK_WEBHOOK="$2"

# Get milestone details
DATA=$(curl -s -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -d "{
    \"query\": \"query { projectMilestone(id: \\\"$MILESTONE_ID\\\") { name status progress project { name } } }\"
  }")

STATUS=$(echo $DATA | jq -r '.data.projectMilestone.status')

if [ "$STATUS" = "done" ]; then
  NAME=$(echo $DATA | jq -r '.data.projectMilestone.name')
  PROJECT=$(echo $DATA | jq -r '.data.projectMilestone.project.name')

  curl -X POST "$SLACK_WEBHOOK" \
    -H "Content-Type: application/json" \
    -d "{
      \"text\": \"🎉 Milestone completed!\",
      \"blocks\": [
        {
          \"type\": \"section\",
          \"text\": {
            \"type\": \"mrkdwn\",
            \"text\": \"*$NAME* has been completed in project *$PROJECT*!\"
          }
        }
      ]
    }"

  echo "Slack notification sent"
else
  echo "Milestone not yet complete (status: $STATUS)"
fi
```

---

### Export Milestones to CSV

```bash
#!/bin/bash
# export-milestones-csv.sh

OUTPUT_FILE="${1:-milestones.csv}"

echo "Project,Milestone,Status,Progress,Target Date,Issues" > "$OUTPUT_FILE"

curl -s -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -d '{
    "query": "query { projectMilestones(first: 200) { nodes { name status progress targetDate project { name } issues { nodes { id } } } } }"
  }' | jq -r '
    .data.projectMilestones.nodes[] |
    [
      .project.name,
      .name,
      .status,
      (.progress * 100 | tostring + "%"),
      (.targetDate // ""),
      (.issues.nodes | length | tostring)
    ] |
    @csv
  ' >> "$OUTPUT_FILE"

echo "Exported milestones to $OUTPUT_FILE"
```

---

### Generate Markdown Report

```bash
#!/bin/bash
# generate-project-report.sh

PROJECT_ID="$1"
OUTPUT_FILE="${2:-project-report.md}"

# Fetch all data
DATA=$(curl -s -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -d "{
    \"query\": \"query { project(id: \\\"$PROJECT_ID\\\") { name description state startDate targetDate projectMilestones { nodes { name status progress targetDate issues { nodes { id } } } } } }\"
  }")

# Generate markdown
cat > "$OUTPUT_FILE" << EOF
# $(echo $DATA | jq -r '.data.project.name')

**Status:** $(echo $DATA | jq -r '.data.project.state')
**Start Date:** $(echo $DATA | jq -r '.data.project.startDate // "Not set"')
**Target Date:** $(echo $DATA | jq -r '.data.project.targetDate // "Not set"')

## Description

$(echo $DATA | jq -r '.data.project.description // "No description"')

## Milestones

EOF

echo $DATA | jq -r '
  .data.project.projectMilestones.nodes[] |
  "### \(.name)\n\n" +
  "- **Status:** \(.status)\n" +
  "- **Progress:** \((.progress * 100 | round))%\n" +
  "- **Target:** \(.targetDate // "Not set")\n" +
  "- **Issues:** \(.issues.nodes | length)\n"
' >> "$OUTPUT_FILE"

echo "Report generated: $OUTPUT_FILE"
```

---

## Troubleshooting Examples

### Verify API Key

```bash
curl -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -d '{"query": "{ viewer { id name email } }"}' \
  | jq '.'
```

**Expected output:**
```json
{
  "data": {
    "viewer": {
      "id": "user-123",
      "name": "Your Name",
      "email": "your.email@example.com"
    }
  }
}
```

---

### Debug Failed Mutation

```bash
# Enable verbose output
curl -v -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -d '{
    "query": "mutation { documentCreate(input: { title: \"Test\" }) { success } }"
  }' 2>&1 | grep -E '(HTTP|success|error)'
```

---

### Check Rate Limits

```bash
curl -I -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -d '{"query": "{ viewer { id } }"}' \
  | grep -i 'x-ratelimit'
```

**Headers to watch:**
- `X-RateLimit-Limit`: Total requests allowed
- `X-RateLimit-Remaining`: Remaining requests
- `X-RateLimit-Reset`: When limit resets (Unix timestamp)

---

## Tips and Tricks

### 1. Use Shell Functions

Add to `.bashrc` or `.zshrc`:
```bash
linear_doc_create() {
  local title="$1"
  local project="$2"
  curl -X POST https://api.linear.app/graphql \
    -H "Authorization: $LINEAR_API_KEY" \
    -d "{
      \"query\": \"mutation { documentCreate(input: { title: \\\"$title\\\", projectId: \\\"$project\\\" }) { success document { id url } } }\"
    }" | jq -r '.data.documentCreate.document.url'
}

# Usage: linear_doc_create "My Doc" "proj-123"
```

### 2. Store Common IDs

```bash
# ~/.linear-ids
export MY_PROJECT="proj-abc123"
export DESIGN_TEAM="team-xyz789"

# In your scripts
source ~/.linear-ids
curl ... -d "{ \"query\": \"mutation { ... projectId: \\\"$MY_PROJECT\\\" ... }\" }"
```

### 3. Pretty Print All Responses

```bash
alias linear='curl -X POST https://api.linear.app/graphql -H "Authorization: $LINEAR_API_KEY" -d'

# Usage
linear '{"query": "{ viewer { name } }"}' | jq '.'
```

### 4. Save GraphQL Queries

```bash
# queries/create-document.graphql
mutation DocumentCreate($input: DocumentCreateInput!) {
  documentCreate(input: $input) {
    success
    document {
      id
      title
      url
    }
  }
}

# Use with jq
QUERY=$(jq -Rs . < queries/create-document.graphql)
curl ... -d "{\"query\": $QUERY, \"variables\": {\"input\": {...}}}"
```
