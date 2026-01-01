# NotebookLM Notebooks API Reference

Complete API reference for managing NotebookLM Enterprise notebooks.

## Base URL

```
https://{ENDPOINT_LOCATION}-discoveryengine.googleapis.com/v1alpha/projects/{PROJECT_NUMBER}/locations/{LOCATION}/notebooks
```

### Endpoint Locations

| Multi-Region | Prefix | Example |
|--------------|--------|---------|
| US | `us-` | `us-discoveryengine.googleapis.com` |
| EU | `eu-` | `eu-discoveryengine.googleapis.com` |
| Global | `global-` | `global-discoveryengine.googleapis.com` |

## Methods

### notebooks.create

Create a new notebook.

**HTTP Request:**
```
POST /v1alpha/projects/{PROJECT_NUMBER}/locations/{LOCATION}/notebooks
```

**Request Body:**
```json
{
  "title": "string"
}
```

**Response:**
```json
{
  "title": "NOTEBOOK_TITLE",
  "notebookId": "NOTEBOOK_ID",
  "emoji": "",
  "metadata": {
    "userRole": "PROJECT_ROLE_OWNER",
    "isShared": false,
    "isShareable": true
  },
  "name": "projects/{PROJECT}/locations/{LOCATION}/notebooks/{NOTEBOOK_ID}"
}
```

**curl Example:**
```bash
curl -X POST \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  "https://global-discoveryengine.googleapis.com/v1alpha/projects/${PROJECT_NUMBER}/locations/global/notebooks" \
  -d '{"title": "My Research Notebook"}'
```

---

### notebooks.get

Retrieve a specific notebook by ID.

**HTTP Request:**
```
GET /v1alpha/projects/{PROJECT_NUMBER}/locations/{LOCATION}/notebooks/{NOTEBOOK_ID}
```

**Response:**
```json
{
  "title": "NOTEBOOK_TITLE",
  "notebookId": "NOTEBOOK_ID",
  "emoji": "",
  "metadata": {
    "userRole": "PROJECT_ROLE_OWNER",
    "isShared": false,
    "isShareable": true,
    "lastViewed": "2025-01-01T00:00:00Z",
    "createTime": "2025-01-01T00:00:00Z"
  },
  "name": "projects/{PROJECT}/locations/{LOCATION}/notebooks/{NOTEBOOK_ID}"
}
```

If notebook has sources, response includes source details. If CMEK is configured, CMEK information is also included.

**curl Example:**
```bash
curl -X GET \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  "https://global-discoveryengine.googleapis.com/v1alpha/projects/${PROJECT_NUMBER}/locations/global/notebooks/${NOTEBOOK_ID}"
```

---

### notebooks.listRecentlyViewed

List recently viewed notebooks. Returns up to 500 notebooks by default.

**HTTP Request:**
```
GET /v1alpha/projects/{PROJECT_NUMBER}/locations/{LOCATION}/notebooks:listRecentlyViewed
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `pageSize` | integer | Number of results per page (default: 500) |
| `pageToken` | string | Token for pagination |

**Response:**
```json
{
  "notebooks": [
    {
      "title": "NOTEBOOK_TITLE_1",
      "notebookId": "NOTEBOOK_ID_1",
      "emoji": "",
      "metadata": {
        "userRole": "PROJECT_ROLE_OWNER",
        "isShared": false,
        "isShareable": true,
        "lastViewed": "2025-01-01T00:00:00Z",
        "createTime": "2025-01-01T00:00:00Z"
      },
      "name": "projects/{PROJECT}/locations/{LOCATION}/notebooks/{NOTEBOOK_ID_1}"
    }
  ],
  "nextPageToken": "..."
}
```

**curl Example:**
```bash
curl -X GET \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  "https://global-discoveryengine.googleapis.com/v1alpha/projects/${PROJECT_NUMBER}/locations/global/notebooks:listRecentlyViewed?pageSize=10"
```

---

### notebooks.batchDelete

Delete multiple notebooks at once.

**HTTP Request:**
```
POST /v1alpha/projects/{PROJECT_NUMBER}/locations/{LOCATION}/notebooks:batchDelete
```

**Request Body:**
```json
{
  "names": [
    "projects/{PROJECT}/locations/{LOCATION}/notebooks/{NOTEBOOK_ID_1}",
    "projects/{PROJECT}/locations/{LOCATION}/notebooks/{NOTEBOOK_ID_2}"
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
  "https://global-discoveryengine.googleapis.com/v1alpha/projects/${PROJECT_NUMBER}/locations/global/notebooks:batchDelete" \
  -d '{
    "names": [
      "projects/'"${PROJECT_NUMBER}"'/locations/global/notebooks/abc123",
      "projects/'"${PROJECT_NUMBER}"'/locations/global/notebooks/def456"
    ]
  }'
```

---

### notebooks.share

Share a notebook with other users.

**Prerequisites:**
- Target users must have `Cloud NotebookLM User` IAM role

**HTTP Request:**
```
POST /v1alpha/projects/{PROJECT_NUMBER}/locations/{LOCATION}/notebooks/{NOTEBOOK_ID}:share
```

**Request Body:**
```json
{
  "accountAndRoles": [
    {
      "email": "user1@example.com",
      "role": "PROJECT_ROLE_WRITER"
    },
    {
      "email": "user2@example.com",
      "role": "PROJECT_ROLE_READER"
    }
  ]
}
```

**Roles:**
| Role | Description |
|------|-------------|
| `PROJECT_ROLE_OWNER` | Full ownership |
| `PROJECT_ROLE_WRITER` | Read and write access |
| `PROJECT_ROLE_READER` | Read-only access |
| `PROJECT_ROLE_NOT_SHARED` | Remove access |

**Response:**
Empty JSON object `{}` on success.

**curl Example:**
```bash
curl -X POST \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  "https://global-discoveryengine.googleapis.com/v1alpha/projects/${PROJECT_NUMBER}/locations/global/notebooks/${NOTEBOOK_ID}:share" \
  -d '{
    "accountAndRoles": [
      {"email": "colleague@company.com", "role": "PROJECT_ROLE_WRITER"}
    ]
  }'
```

---

## Accessing Notebooks in Browser

### Google Identity URLs

```
https://notebooklm.cloud.google.com/{LOCATION}/?project={PROJECT_NUMBER}
https://notebooklm.cloud.google.com/{LOCATION}/notebook/{NOTEBOOK_ID}?project={PROJECT_NUMBER}
```

### Third-Party Identity URLs

```
https://notebooklm.cloud.google/{LOCATION}/?project={PROJECT_NUMBER}
https://notebooklm.cloud.google/{LOCATION}/notebook/{NOTEBOOK_ID}?project={PROJECT_NUMBER}
```

---

## Response Fields

### Notebook Object

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Notebook title |
| `notebookId` | string | Unique identifier |
| `emoji` | string | Emoji associated with notebook |
| `metadata` | object | Metadata including role, sharing status |
| `name` | string | Full resource name |

### Metadata Object

| Field | Type | Description |
|-------|------|-------------|
| `userRole` | string | Current user's role |
| `isShared` | boolean | Whether notebook is shared |
| `isShareable` | boolean | Whether notebook can be shared |
| `lastViewed` | timestamp | Last viewed time |
| `createTime` | timestamp | Creation time |

---

## Error Codes

| Code | Description | Resolution |
|------|-------------|------------|
| 401 | Unauthorized | Refresh access token |
| 403 | Forbidden | Check IAM permissions |
| 404 | Not Found | Verify notebook ID and location |
| 429 | Rate Limited | Implement exponential backoff |
