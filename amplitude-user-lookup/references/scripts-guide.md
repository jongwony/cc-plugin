# Scripts Usage Guide

## Table of Contents

1. [Environment Setup](#environment-setup)
2. [user_search.py](#user_searchpy)
3. [user_activity.py](#user_activitypy)
4. [Combined Workflows](#combined-workflows)
5. [Output Filtering with jq](#output-filtering-with-jq)

---

## Environment Setup

### Required Variables

```bash
export AMPLITUDE_API_KEY="your-api-key"
export AMPLITUDE_SECRET_KEY="your-secret-key"
```

### Optional Variables

```bash
export AMPLITUDE_REGION="eu"  # Default: "us"
```

### Using .env File

```bash
# Create .env file
cat > .env << 'EOF'
AMPLITUDE_API_KEY=your-api-key
AMPLITUDE_SECRET_KEY=your-secret-key
AMPLITUDE_REGION=us
EOF

# Load before running scripts
source .env
```

---

## user_search.py

Search for users by Device ID or User ID.

### Basic Usage

```bash
# Search by Device ID
python scripts/user_search.py "9BE83E76-FB8D-488B-9C07-C2B178AFBBC4"

# Search by User ID
python scripts/user_search.py "user@example.com"
```

### Output Formats

```bash
# Human-readable (default)
python scripts/user_search.py "DEVICE-ID"
# Output:
# Search type: match_user_or_device_id
# Found 1 match(es)
#
# Match 1:
#   Amplitude ID: 1134643624824
#   User ID: user-123

# JSON format
python scripts/user_search.py "DEVICE-ID" --json
# Output:
# {
#   "matches": [...],
#   "type": "match_user_or_device_id"
# }
```

### Extract Amplitude ID

```bash
# Using jq
python scripts/user_search.py "DEVICE-ID" --json | jq -r '.matches[0].amplitude_id'

# Store in variable
AMP_ID=$(python scripts/user_search.py "DEVICE-ID" --json | jq -r '.matches[0].amplitude_id')
echo $AMP_ID
```

---

## user_activity.py

Retrieve user event stream by Amplitude ID.

### Basic Usage

```bash
# Default: latest 100 events
python scripts/user_activity.py 1134643624824

# Specify limit
python scripts/user_activity.py 1134643624824 --limit 50

# Get oldest events first
python scripts/user_activity.py 1134643624824 --direction earliest
```

### Pagination

```bash
# First 100 events
python scripts/user_activity.py 1134643624824 --limit 100 --offset 0

# Next 100 events
python scripts/user_activity.py 1134643624824 --limit 100 --offset 100

# Events 200-300
python scripts/user_activity.py 1134643624824 --limit 100 --offset 200
```

### JSON Output

```bash
# Full JSON response
python scripts/user_activity.py 1134643624824 --json

# Pretty print
python scripts/user_activity.py 1134643624824 --json | jq '.'
```

### Options Reference

| Option | Description | Default |
|--------|-------------|---------|
| `--limit N` | Number of events (max 1000) | 100 |
| `--offset N` | Skip first N events | 0 |
| `--direction` | `latest` or `earliest` | latest |
| `--json` | Output raw JSON | disabled |

---

## Combined Workflows

### Device ID to Full Activity

```bash
#!/bin/bash
DEVICE_ID="9BE83E76-FB8D-488B-9C07-C2B178AFBBC4"

# Step 1: Get Amplitude ID
AMP_ID=$(python scripts/user_search.py "$DEVICE_ID" --json | jq -r '.matches[0].amplitude_id')

if [ "$AMP_ID" = "null" ] || [ -z "$AMP_ID" ]; then
    echo "User not found for Device ID: $DEVICE_ID"
    exit 1
fi

echo "Found Amplitude ID: $AMP_ID"

# Step 2: Get activity
python scripts/user_activity.py "$AMP_ID" --limit 50
```

### Export Events to File

```bash
# Export as JSON
python scripts/user_activity.py 1134643624824 --json --limit 1000 > events.json

# Export user summary only
python scripts/user_activity.py 1134643624824 --json | jq '.userData' > user_summary.json

# Export events only
python scripts/user_activity.py 1134643624824 --json | jq '.events' > events_only.json
```

---

## Output Filtering with jq

### User Data Queries

```bash
# Get user summary
python scripts/user_activity.py $AMP_ID --json | jq '.userData'

# Get specific fields
python scripts/user_activity.py $AMP_ID --json | jq '{
  user_id: .userData.user_id,
  platform: .userData.platform,
  total_events: .userData.num_events,
  last_active: .userData.last_used
}'

# Get user properties
python scripts/user_activity.py $AMP_ID --json | jq '.userData.properties'
```

### Event Filtering

```bash
# Get all event types
python scripts/user_activity.py $AMP_ID --json | jq '[.events[].event_type] | unique'

# Filter by event type
python scripts/user_activity.py $AMP_ID --json | jq '.events | map(select(.event_type == "page_view"))'

# Get events with specific property
python scripts/user_activity.py $AMP_ID --json | jq '.events | map(select(.event_properties.screen_name == "home"))'

# Count events by type
python scripts/user_activity.py $AMP_ID --json | jq '.events | group_by(.event_type) | map({type: .[0].event_type, count: length})'
```

### Event Timeline

```bash
# Get event timeline (type + time)
python scripts/user_activity.py $AMP_ID --json | jq '.events | map({
  type: .event_type,
  time: (.event_time / 1000 | strftime("%Y-%m-%d %H:%M:%S"))
})'
```
