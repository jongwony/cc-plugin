---
name: notebooklm
description: NotebookLM Enterprise API
---

# NotebookLM Enterprise API Skill

Programmatically manage NotebookLM Enterprise notebooks and data sources via the Discovery Engine REST API.

## Prerequisites

Before using this skill:
1. Set up NotebookLM Enterprise in Google Cloud project
2. Obtain NotebookLM Enterprise license
3. Authenticate via `gcloud auth print-access-token`
4. For Google Drive sources: run `gcloud auth login --enable-gdrive-access`

## Core Concepts

### Endpoint Structure

```
https://{ENDPOINT_LOCATION}-discoveryengine.googleapis.com/v1alpha/projects/{PROJECT_NUMBER}/locations/{LOCATION}/...
```

| Parameter | Description | Values |
|-----------|-------------|--------|
| `ENDPOINT_LOCATION` | Multi-region prefix | `us-`, `eu-`, `global-` |
| `PROJECT_NUMBER` | GCP project number | Numeric ID |
| `LOCATION` | Data store location | `global`, `us`, `eu` |

### Resource Names

- **Notebook**: `projects/{PROJECT}/locations/{LOCATION}/notebooks/{NOTEBOOK_ID}`
- **Source**: `projects/{PROJECT}/locations/{LOCATION}/notebooks/{NOTEBOOK_ID}/sources/{SOURCE_ID}`

## Workflow Overview

### 1. Create Notebook

```bash
curl -X POST \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  "https://global-discoveryengine.googleapis.com/v1alpha/projects/${PROJECT_NUMBER}/locations/global/notebooks" \
  -d '{"title": "My Notebook"}'
```

Response includes `notebookId` for subsequent operations.

### 2. Add Sources

Sources can be added via `sources:batchCreate`:

| Source Type | Key Fields |
|-------------|------------|
| Google Docs/Slides | `googleDriveContent.documentId`, `mimeType` |
| Raw Text | `textContent.content`, `sourceName` |
| Web URL | `webContent.url`, `sourceName` |
| YouTube | `videoContent.url` |

For file uploads, use `sources:uploadFile` with multipart form data.

**Supported File Types:**
- Documents: `.pdf`, `.txt`, `.md`, `.docx`, `.pptx`, `.xlsx`
- Audio: `.mp3`, `.wav`, `.m4a`, `.ogg`, etc.
- Images: `.png`, `.jpg`, `.jpeg`

### 3. Manage Notebooks

| Operation | Method | Endpoint |
|-----------|--------|----------|
| Get | GET | `/notebooks/{id}` |
| List Recent | GET | `/notebooks:listRecentlyViewed` |
| Delete | POST | `/notebooks:batchDelete` |
| Share | POST | `/notebooks/{id}:share` |

### 4. Audio Overview (Preview)

Generate AI-powered audio summaries:
- `CreateAudioOverview` - Generate audio overview
- `DeleteAudioOverview` - Remove audio overview

## Usage Patterns

### Quick Notebook Creation

```bash
# Set environment variables
export PROJECT_NUMBER="123456789"
export LOCATION="global"
export ENDPOINT="global-discoveryengine.googleapis.com"

# Create notebook
curl -X POST \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  "https://${ENDPOINT}/v1alpha/projects/${PROJECT_NUMBER}/locations/${LOCATION}/notebooks" \
  -d '{"title": "Research Notes"}'
```

### Add Web Source

```bash
curl -X POST \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  "https://${ENDPOINT}/v1alpha/projects/${PROJECT_NUMBER}/locations/${LOCATION}/notebooks/${NOTEBOOK_ID}/sources:batchCreate" \
  -d '{
    "userContents": [{
      "webContent": {
        "url": "https://example.com/article",
        "sourceName": "Example Article"
      }
    }]
  }'
```

### Upload Local File

```bash
curl -X POST \
  --data-binary "@/path/to/document.pdf" \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "X-Goog-Upload-File-Name: My Document" \
  -H "X-Goog-Upload-Protocol: raw" \
  -H "Content-Type: application/pdf" \
  "https://${ENDPOINT}/upload/v1alpha/projects/${PROJECT_NUMBER}/locations/${LOCATION}/notebooks/${NOTEBOOK_ID}/sources:uploadFile"
```

### Share Notebook

```bash
curl -X POST \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  "https://${ENDPOINT}/v1alpha/projects/${PROJECT_NUMBER}/locations/${LOCATION}/notebooks/${NOTEBOOK_ID}:share" \
  -d '{
    "accountAndRoles": [
      {"email": "user@example.com", "role": "PROJECT_ROLE_WRITER"}
    ]
  }'
```

**Roles:** `PROJECT_ROLE_OWNER`, `PROJECT_ROLE_WRITER`, `PROJECT_ROLE_READER`, `PROJECT_ROLE_NOT_SHARED`

## Helper Script

Use `@scripts/notebooklm-api.sh` for common operations:

```bash
# Create notebook
./notebooklm-api.sh create "My Notebook"

# Add web source
./notebooklm-api.sh add-web <notebook_id> "https://example.com" "Source Name"

# Upload file
./notebooklm-api.sh upload <notebook_id> /path/to/file.pdf

# List notebooks
./notebooklm-api.sh list

# Share notebook
./notebooklm-api.sh share <notebook_id> user@example.com writer
```

## Error Handling

- **401 Unauthorized**: Refresh token with `gcloud auth print-access-token`
- **403 Forbidden**: Check IAM permissions (Cloud NotebookLM User role)
- **404 Not Found**: Verify notebook/source ID and location
- **Google Drive 403**: Run `gcloud auth login --enable-gdrive-access`

## Additional Resources

### Reference Files

For detailed API specifications:
- **`references/notebooks-api.md`** - Complete notebooks API reference
- **`references/sources-api.md`** - Sources management API details
- **`references/supported-formats.md`** - Supported file types and MIME types

### External Links

- [NotebookLM Enterprise Docs](https://docs.cloud.google.com/gemini/enterprise/notebooklm-enterprise/docs)
- [API Reference](https://docs.cloud.google.com/gemini/enterprise/docs/reference/rest/v1alpha/projects.locations.notebooks)

## Environment Setup

Before executing API calls, confirm required variables:

```bash
# Required environment variables
echo "PROJECT_NUMBER: ${PROJECT_NUMBER:-NOT SET}"
echo "LOCATION: ${LOCATION:-global}"

# Test authentication
gcloud auth print-access-token > /dev/null && echo "Auth: OK" || echo "Auth: FAILED"
```

When variables are missing, use `AskUserQuestion` to gather project configuration.
