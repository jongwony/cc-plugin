# Amplitude REST API Reference

## Table of Contents

1. [Authentication](#authentication)
2. [User Search API](#user-search-api)
3. [User Activity API](#user-activity-api)
4. [Error Codes](#error-codes)
5. [EU Region](#eu-region)

---

## Authentication

All APIs use **Basic Authentication** with API Key and Secret Key.

```bash
# Header format
Authorization: Basic $(echo -n "API_KEY:SECRET_KEY" | base64)

# Using curl -u shorthand
curl -u "API_KEY:SECRET_KEY" ...
```

---

## User Search API

Search for users by device_id or user_id to get their Amplitude ID.

### Endpoint

```
GET https://amplitude.com/api/2/usersearch
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `user` | string | Yes | Device ID or User ID to search |

### curl Example

```bash
curl -s -u "$AMPLITUDE_API_KEY:$AMPLITUDE_SECRET_KEY" \
  "https://amplitude.com/api/2/usersearch?user=YOUR_DEVICE_ID"
```

### Response Schema

```json
{
  "matches": [
    {
      "user_id": "user-123",
      "amplitude_id": 1234567890,
      "device_ids": ["device-1", "device-2"]
    }
  ],
  "type": "match_user_or_device_id"
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `matches` | array | List of matching users |
| `matches[].user_id` | string | User's custom user_id |
| `matches[].amplitude_id` | number | Amplitude's internal ID (use for User Activity API) |
| `matches[].device_ids` | array | Associated device IDs |
| `type` | string | Match type indicator |

---

## User Activity API

Retrieve event stream for a user by their Amplitude ID.

### Endpoint

```
GET https://amplitude.com/api/2/useractivity
```

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `user` | number | Yes | - | Amplitude ID (from User Search API) |
| `limit` | number | No | 1000 | Number of events to return (max 1000) |
| `offset` | number | No | 0 | Offset for pagination |
| `direction` | string | No | `latest` | `latest` or `earliest` |

### curl Examples

```bash
# Basic usage
curl -s -u "$AMPLITUDE_API_KEY:$AMPLITUDE_SECRET_KEY" \
  "https://amplitude.com/api/2/useractivity?user=1234567890"

# With pagination
curl -s -u "$AMPLITUDE_API_KEY:$AMPLITUDE_SECRET_KEY" \
  "https://amplitude.com/api/2/useractivity?user=1234567890&limit=100&offset=0"

# Oldest events first
curl -s -u "$AMPLITUDE_API_KEY:$AMPLITUDE_SECRET_KEY" \
  "https://amplitude.com/api/2/useractivity?user=1234567890&direction=earliest"
```

### Response Schema

```json
{
  "userData": {
    "user_id": "user-123",
    "canonical_amplitude_id": 1234567890,
    "num_events": 5432,
    "num_sessions": 234,
    "first_used": "2024-01-15",
    "last_used": "2024-12-01",
    "device_ids": ["device-1", "device-2"],
    "platform": "iOS",
    "country": "South Korea",
    "properties": {
      "subscription_status": "active",
      "plan_type": "premium"
    }
  },
  "events": [
    {
      "event_type": "page_view",
      "event_time": 1701432123456,
      "client_event_time": 1701432123400,
      "device_id": "device-1",
      "session_id": 1701430000000,
      "event_properties": {
        "screen_name": "home",
        "referrer": "settings"
      },
      "user_properties": {}
    }
  ]
}
```

### userData Fields

| Field | Type | Description |
|-------|------|-------------|
| `user_id` | string | Custom user identifier |
| `canonical_amplitude_id` | number | Primary Amplitude ID |
| `num_events` | number | Total event count |
| `num_sessions` | number | Total session count |
| `first_used` | string | First activity date (YYYY-MM-DD) |
| `last_used` | string | Last activity date (YYYY-MM-DD) |
| `device_ids` | array | All associated devices |
| `platform` | string | Primary platform (iOS, Android, Web) |
| `country` | string | User's country |
| `properties` | object | User properties |

### Event Fields

| Field | Type | Description |
|-------|------|-------------|
| `event_type` | string | Event name |
| `event_time` | number | Server timestamp (ms) |
| `client_event_time` | number | Client timestamp (ms) |
| `device_id` | string | Device that sent event |
| `session_id` | number | Session identifier |
| `event_properties` | object | Event-specific data |
| `user_properties` | object | User properties at event time |

---

## Error Codes

| HTTP Code | Meaning | Common Causes |
|-----------|---------|---------------|
| 400 | Bad Request | Invalid parameters |
| 401 | Unauthorized | Invalid API key or secret |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | User not found |
| 429 | Too Many Requests | Rate limit exceeded (360/hour) |
| 500 | Server Error | Amplitude service issue |

### Error Response Format

```json
{
  "error": "HTTP 401: Unauthorized",
  "details": "Invalid API credentials"
}
```

---

## EU Region

For EU data residency, use the EU endpoint:

```bash
# Standard (US)
https://amplitude.com/api/2/...

# EU Region
https://analytics.eu.amplitude.com/api/2/...
```

Set `AMPLITUDE_REGION=eu` environment variable to use EU endpoints automatically with the provided scripts.
