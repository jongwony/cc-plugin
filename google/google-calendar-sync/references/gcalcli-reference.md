# gcalcli Command Reference

Quick reference for gcalcli commands used in activity calendar synchronization.

## Installation

```bash
brew install gcalcli              # macOS
pip install gcalcli[vobject]      # Linux/macOS with OAuth
```

## Authentication

```bash
gcalcli init                      # Manual authentication
gcalcli list                      # Auto-triggers OAuth on first run
```

Credentials: `~/.gcalcli_oauth`

## Add Event

```bash
gcalcli add --title "TITLE" \
  --when "YYYY-MM-DD HH:MM" \
  --duration MINUTES \
  --description "DESCRIPTION" \
  --where "LOCATION"
```

### Parameters

| Parameter | Type | Description | Required |
|-----------|------|-------------|----------|
| `--title` | string | Event title | Yes |
| `--when` | datetime | Start time (ISO/natural language) | Yes |
| `--duration` | integer | Duration in minutes (default: 60) | No |
| `--description` | string | Event details (supports \n) | No |
| `--where` | string | Location/platform | No |
| `--calendar` | string | Calendar name (default: primary) | No |
| `--reminder` | string | Reminder time (e.g., "30m", "1h") | No |
| `--allday` | flag | All-day event | No |
| `--color` | integer | Color ID (1-11) | No |
| `--private` | flag | Mark as private | No |

### Date/Time Formats

```bash
--when "2025-11-01 10:30"         # ISO format (recommended for scripting)
--when "tomorrow 2pm"             # Natural language
--when "next Monday 9am"          # Natural language
--when "11/01/2025 10:30am"       # US format
```

## Viewing Events

```bash
gcalcli list                      # List calendars
gcalcli agenda                    # Today's agenda
gcalcli agenda "2025-11-01" "2025-11-07"  # Date range
gcalcli calw                      # Calendar week view
gcalcli calm                      # Calendar month view
```

## Searching & Deleting

```bash
gcalcli search "meeting"          # Search by title
gcalcli search "meeting" "2025-11-01" "2025-11-30"  # With date range
gcalcli delete "Test Event"       # Delete (interactive)
gcalcli delete --iamaexpert "Test Event"  # Delete without confirmation
```

## Batch Operations

```bash
#!/bin/bash
set -e

events=(
  "Meeting:2025-11-05 14:00:60"
  "Review:2025-11-05 16:00:30"
)

for event in "${events[@]}"; do
  IFS=':' read -r title when duration <<< "$event"
  gcalcli add --title "$title" --when "$when" --duration "$duration"
done
```

## Activity-Specific Examples

### GitHub PR Created
```bash
gcalcli add --title "🔀 PR #234: Add user auth" \
  --when "2025-11-01 10:30" \
  --duration 60 \
  --description "Created PR in delightroom/backend\nhttps://github.com/delightroom/backend/pull/234" \
  --where "GitHub"
```

### Commits Batch
```bash
gcalcli add --title "🔨 3 commits in delightroom/backend" \
  --when "2025-11-01 09:00" \
  --duration 30 \
  --description "Setup auth middleware, Add tests, Update docs\nhttps://github.com/delightroom/backend" \
  --where "GitHub"
```

### Issue Comment
```bash
gcalcli add --title "💬 Issue #456: Bug in login" \
  --when "2025-11-01 14:20" \
  --duration 15 \
  --description "Commented on issue in org/project\nhttps://github.com/org/project/issues/456" \
  --where "GitHub"
```

### All-day Event
```bash
gcalcli add --title "Conference" --when "2025-11-10" --allday
```

### Recurring Event
```bash
gcalcli add --title "Weekly Standup" \
  --when "2025-11-06 09:00" \
  --duration 15 \
  --recur "weekly" \
  --until "2025-12-31"
```

### With Reminders
```bash
gcalcli add --title "Dentist" \
  --when "2025-11-08 15:00" \
  --duration 30 \
  --reminder "1h" \
  --reminder "10m"
```

## Advanced Options

### Multiple Calendars
```bash
gcalcli list                      # List available calendars
gcalcli --calendar "Work" add --title "Meeting" --when "tomorrow 3pm"
```

### Output Formats
```bash
gcalcli agenda              # Tab-separated values
gcalcli agenda | jq -R 'split("\t")'  # JSON with jq
```

### Timezone
```bash
TZ="Asia/Seoul" gcalcli add --title "Event" --when "2025-11-05 10:00"
export TZ="Asia/Seoul"            # Set default
```

### Escaping Special Characters
```bash
gcalcli add --title "PR #123: Add feature" --when "..."

# Multiline descriptions
gcalcli add --title "Event" --when "..." --description "$(cat <<'EOF'
Line 1
Line 2
https://example.com
EOF
)"
```

## Common Issues

**OAuth Errors**: `rm ~/.gcalcli_oauth && gcalcli init`

**Time Zone**: Set `TZ` environment variable explicitly

**Special Characters**: Use quotes and heredoc for complex strings

## Best Practices

- Use ISO format (`YYYY-MM-DD HH:MM`) for scripting
- Set duration explicitly
- Include URLs in description for easy access
- Use `--where` for platform/location context
- Test single event before batch import
- Use `set -e` in scripts to stop on first error
- Add logging: `echo` each event before adding

## Performance Tips

- Use `--calendar` to specify target (faster than auto-detect)
- Batch imports: Run sequentially with minimal delay
- Large imports: Add sleep between commands to avoid rate limits

## References

- [Official Documentation](https://github.com/insanum/gcalcli)
- Man Page: `man gcalcli`
- Help: `gcalcli --help`
