# NotebookLM Sources API Reference

Complete API reference for managing data sources within NotebookLM notebooks.

## Base URL

```
https://{ENDPOINT_LOCATION}-discoveryengine.googleapis.com/v1alpha/projects/{PROJECT_NUMBER}/locations/{LOCATION}/notebooks/{NOTEBOOK_ID}/sources
```

## Prerequisites

For Google Drive sources (Docs/Slides), authorize Drive access:
```bash
gcloud auth login --enable-gdrive-access
```

## Methods

### sources.batchCreate

Add multiple sources to a notebook in a single request.

**HTTP Request:**
```
POST /v1alpha/projects/{PROJECT_NUMBER}/locations/{LOCATION}/notebooks/{NOTEBOOK_ID}/sources:batchCreate
```

**Request Body:**
```json
{
  "userContents": [
    { /* source content */ }
  ]
}
```

### Source Types

#### 1. Google Drive Content (Docs/Slides)

```json
{
  "googleDriveContent": {
    "documentId": "DOCUMENT_ID",
    "mimeType": "application/vnd.google-apps.document",
    "sourceName": "Display Name"
  }
}
```

**MIME Types:**
| Type | MIME |
|------|------|
| Google Docs | `application/vnd.google-apps.document` |
| Google Slides | `application/vnd.google-apps.presentation` |

**Getting Document ID:**
Document URL format: `https://docs.google.com/{FILE_TYPE}/d/{DOCUMENT_ID}/edit?resourcekey={RESOURCE_KEY}`

**curl Example:**
```bash
curl -X POST \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  "https://global-discoveryengine.googleapis.com/v1alpha/projects/${PROJECT_NUMBER}/locations/global/notebooks/${NOTEBOOK_ID}/sources:batchCreate" \
  -d '{
    "userContents": [{
      "googleDriveContent": {
        "documentId": "1AbCdEfGhIjKlMnOpQrStUvWxYz",
        "mimeType": "application/vnd.google-apps.document",
        "sourceName": "Project Specification"
      }
    }]
  }'
```

---

#### 2. Raw Text Content

```json
{
  "textContent": {
    "sourceName": "Display Name",
    "content": "Your raw text content here..."
  }
}
```

**curl Example:**
```bash
curl -X POST \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  "https://global-discoveryengine.googleapis.com/v1alpha/projects/${PROJECT_NUMBER}/locations/global/notebooks/${NOTEBOOK_ID}/sources:batchCreate" \
  -d '{
    "userContents": [{
      "textContent": {
        "sourceName": "Meeting Notes",
        "content": "## Q4 Planning Meeting\n\n- Budget approved\n- Timeline: 3 months\n- Team size: 5 engineers"
      }
    }]
  }'
```

---

#### 3. Web Content

```json
{
  "webContent": {
    "url": "https://example.com/article",
    "sourceName": "Display Name"
  }
}
```

**curl Example:**
```bash
curl -X POST \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  "https://global-discoveryengine.googleapis.com/v1alpha/projects/${PROJECT_NUMBER}/locations/global/notebooks/${NOTEBOOK_ID}/sources:batchCreate" \
  -d '{
    "userContents": [{
      "webContent": {
        "url": "https://cloud.google.com/blog/products/ai-ml",
        "sourceName": "Google Cloud AI Blog"
      }
    }]
  }'
```

---

#### 4. YouTube Video Content

```json
{
  "videoContent": {
    "url": "https://www.youtube.com/watch?v=VIDEO_ID"
  }
}
```

**curl Example:**
```bash
curl -X POST \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  "https://global-discoveryengine.googleapis.com/v1alpha/projects/${PROJECT_NUMBER}/locations/global/notebooks/${NOTEBOOK_ID}/sources:batchCreate" \
  -d '{
    "userContents": [{
      "videoContent": {
        "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
      }
    }]
  }'
```

---

### sources.uploadFile

Upload a file directly as a source.

**HTTP Request:**
```
POST /upload/v1alpha/projects/{PROJECT_NUMBER}/locations/{LOCATION}/notebooks/{NOTEBOOK_ID}/sources:uploadFile
```

**Headers:**
| Header | Description |
|--------|-------------|
| `X-Goog-Upload-File-Name` | Display name for the file |
| `X-Goog-Upload-Protocol` | Must be `raw` |
| `Content-Type` | MIME type of the file |

**curl Example:**
```bash
curl -X POST \
  --data-binary "@/path/to/document.pdf" \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "X-Goog-Upload-File-Name: Quarterly Report" \
  -H "X-Goog-Upload-Protocol: raw" \
  -H "Content-Type: application/pdf" \
  "https://global-discoveryengine.googleapis.com/upload/v1alpha/projects/${PROJECT_NUMBER}/locations/global/notebooks/${NOTEBOOK_ID}/sources:uploadFile"
```

**Response:**
```json
{
  "sourceId": {
    "id": "SOURCE_ID"
  }
}
```

---

### sources.get

Retrieve details about a specific source.

**HTTP Request:**
```
GET /v1alpha/projects/{PROJECT_NUMBER}/locations/{LOCATION}/notebooks/{NOTEBOOK_ID}/sources/{SOURCE_ID}
```

**Response:**
```json
{
  "sources": [{
    "sourceId": {
      "id": "SOURCE_ID"
    },
    "title": "Display Name",
    "metadata": {
      "wordCount": 148,
      "tokenCount": 160
    },
    "settings": {
      "status": "SOURCE_STATUS_COMPLETE"
    },
    "name": "projects/{PROJECT}/locations/{LOCATION}/notebooks/{NOTEBOOK_ID}/sources/{SOURCE_ID}"
  }]
}
```

**curl Example:**
```bash
curl -X GET \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  "https://global-discoveryengine.googleapis.com/v1alpha/projects/${PROJECT_NUMBER}/locations/global/notebooks/${NOTEBOOK_ID}/sources/${SOURCE_ID}"
```

---

### sources.batchDelete

Delete multiple sources from a notebook.

**HTTP Request:**
```
POST /v1alpha/projects/{PROJECT_NUMBER}/locations/{LOCATION}/notebooks/{NOTEBOOK_ID}/sources:batchDelete
```

**Request Body:**
```json
{
  "names": [
    "projects/{PROJECT}/locations/{LOCATION}/notebooks/{NOTEBOOK_ID}/sources/{SOURCE_ID_1}",
    "projects/{PROJECT}/locations/{LOCATION}/notebooks/{NOTEBOOK_ID}/sources/{SOURCE_ID_2}"
  ]
}
```

**Response:**
Empty JSON object `{}` on success.

**curl Example:**
```bash
curl -X POST \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  "https://global-discoveryengine.googleapis.com/v1alpha/projects/${PROJECT_NUMBER}/locations/global/notebooks/${NOTEBOOK_ID}/sources:batchDelete" \
  -d '{
    "names": [
      "projects/'"${PROJECT_NUMBER}"'/locations/global/notebooks/'"${NOTEBOOK_ID}"'/sources/source123"
    ]
  }'
```

---

## Batch Create Response

Successful `batchCreate` returns:
```json
{
  "sources": [{
    "sourceId": {
      "id": "SOURCE_ID"
    },
    "title": "DISPLAY_NAME",
    "metadata": {
      "xyz": "abc"
    },
    "settings": {
      "status": "SOURCE_STATUS_COMPLETE"
    },
    "name": "projects/{PROJECT}/locations/{LOCATION}/notebooks/{NOTEBOOK_ID}/sources/{SOURCE_ID}"
  }]
}
```

---

## Source Status Values

| Status | Description |
|--------|-------------|
| `SOURCE_STATUS_UNSPECIFIED` | Status not set |
| `SOURCE_STATUS_PENDING` | Processing in progress |
| `SOURCE_STATUS_COMPLETE` | Successfully processed |
| `SOURCE_STATUS_FAILED` | Processing failed |

---

## Adding Multiple Sources

Add different source types in a single request:

```bash
curl -X POST \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  "https://global-discoveryengine.googleapis.com/v1alpha/projects/${PROJECT_NUMBER}/locations/global/notebooks/${NOTEBOOK_ID}/sources:batchCreate" \
  -d '{
    "userContents": [
      {
        "webContent": {
          "url": "https://example.com/article1",
          "sourceName": "Article 1"
        }
      },
      {
        "textContent": {
          "sourceName": "Custom Notes",
          "content": "Important notes for the project..."
        }
      },
      {
        "videoContent": {
          "url": "https://www.youtube.com/watch?v=abc123"
        }
      }
    ]
  }'
```

---

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| 400 Bad Request | Invalid source format | Check source type fields |
| 401 Unauthorized | Token expired | Refresh access token |
| 403 Forbidden (Drive) | No Drive access | Run `gcloud auth login --enable-gdrive-access` |
| 404 Not Found | Invalid notebook ID | Verify notebook exists |
| 413 Payload Too Large | File too big | Reduce file size |
