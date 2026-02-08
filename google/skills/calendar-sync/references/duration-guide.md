# Activity Duration Guidelines

Duration estimation rules for converting activities into calendar events.

## Core Principle: Backdate from Timestamp

Activity timestamps = **completion time**. Calculate start time by subtracting duration:

```
start_time = timestamp - duration
end_time = timestamp
```

Example: PR created at 10:00 with 60min duration → Calendar block: 09:00-10:00

## GitHub Activity Types

| Activity Type | Icon | Default | Range | Grouping | Complexity Adjustments |
|---------------|------|---------|-------|----------|------------------------|
| Commits | 🔨 | 30 min | 15-60 min | 2-hour window | 1 commit: 15min, 2-3: 30min, 4-6: 45min, 7+: 60min |
| PR Created | 🔀 | 60 min | 30-240 min | Per PR | <2 files/<50 lines: 30min, 3-5 files/50-200: 60min, 6-10/200-500: 120min, >10/>500: 180-240min |
| PR Merged | ✅ | 15 min | 10-30 min | Per event | Standard merge: 15min, conflicts: 20-30min |
| PR Review | 🔍 | 45 min | 30-90 min | Per review | <5 files/<50 lines: 30min, 5-10/50-200: 45min, >10/>200: 60-90min |
| Issue Comment | 💬 | 15 min | 5-30 min | 1-hour window | <100 words: 5-10min, 100-300: 15min, >300: 20-30min |
| Issue Created | 🆕 | 30 min | 15-60 min | Per issue | Quick bug: 20min, standard: 30min, detailed: 45-60min |

## Linear Activity Types

| Activity Type | Icon | Default | Range | Notes |
|---------------|------|---------|-------|-------|
| Issue Created | 🎫 | 30 min | 15-60 min | Triage/Planning: 30-45min |
| Issue Comment | 💬 | 15 min | 5-30 min | Same as GitHub |
| Issue Completed | ✅ | 15 min | 10-30 min | Completion marker |
| Status Change | 🔄 | 5 min | 5-15 min | Quick update |

## Grouping Rules (Session-Based)

**Repository boundary**: Only merge activities within the same repository/project. Cross-repository activities are always separate calendar events, even when temporally adjacent (gap ≤ 30min).

**Commits**: Group within 2-hour window, same repo, backdate to session start
```
Timestamps (completion times, same repo):
  09:15 Commit A (15min) → backdated 09:00-09:15
  09:30 Commit B (15min) → backdated 09:15-09:30
  10:00 Commit C (15min) → backdated 09:45-10:00

Result: "09:00-10:00 🔨 3 commits in org/repo"
        (session spans earliest start to latest end)
```

**Issue Comments**: Group same issue within 1-hour window
```
Timestamps:
  14:00 Comment 1 (10min) → 13:50-14:00
  14:20 Comment 2 (15min) → 14:05-14:20
  14:35 Comment 3 (10min) → 14:25-14:35

Result: "13:50-14:35 💬 Discussion on issue #123"
```

**Sequential Work**: commits → PR naturally form session (same repo)
```
Timestamps (same repo):
  09:30 Commit (30min)     → 09:00-09:30
  10:00 PR Created (60min) → 09:00-10:00  ← overlaps!

Result: "09:00-10:00 🔨🔀 Work session: 1 commit + PR #234"
        (merge overlapping backdated ranges)
```

**Cross-repository isolation**:
```
Timestamps (different repos):
  09:39 PR merged in org/foundation
  10:08 PR merged in user/ClaudeTasks  ← 29min gap, different repo

Result: TWO separate events (never merged across repos)
  09:15-09:39 ✅ PR in org/foundation
  09:45-10:08 ✅ PR in user/ClaudeTasks
```

**Max session duration**: 4 hours (split if exceeded)

## Duration Estimation Logic

```python
def calculate_time_block(activity):
    """Backdate: timestamp is end time, calculate start."""
    duration = estimate_duration(activity)
    end_time = activity.timestamp
    start_time = end_time - timedelta(minutes=duration)
    # Snap to 15-minute grid
    start_time = snap_to_grid(start_time, 15)
    return TimeBlock(start_time, end_time, activity)

def estimate_duration(activity):
    base = DEFAULT_DURATIONS[activity.type]
    # PR complexity adjustment
    if activity.type == "pr_created":
        files = activity.metadata.files_changed
        base = 30 if files <= 2 else 60 if files <= 5 else 120 if files <= 10 else min(240, 60 + files * 10)
    return activity.duration_minutes or round(base / 5) * 5

def build_sessions(activities):
    """Group overlapping backdated blocks into sessions, respecting repo boundaries."""
    blocks = sorted([calculate_time_block(a) for a in activities], key=lambda b: b.start)

    # Group by repository/project first
    repo_groups = defaultdict(list)
    for block in blocks:
        repo_key = block.activity.repository or block.activity.project or "unknown"
        repo_groups[repo_key].append(block)

    # Merge within each repository group
    sessions = []
    for repo, repo_blocks in repo_groups.items():
        current = None
        for block in sorted(repo_blocks, key=lambda b: b.start):
            if current and blocks_overlap_or_adjacent(current, block, gap=30):
                current = merge_blocks(current, block)
            else:
                if current:
                    sessions.append(current)
                current = block
        if current:
            sessions.append(current)

    return sorted(sessions, key=lambda s: s.start)
```

## Best Practices

- Round to 5-minute increments (15, 30, 45, 60)
- Cap maximum at 4 hours per event
- Use defaults unless metadata indicates otherwise
- Group micro-activities into sessions
- Preserve event type with icons in title

## gcalcli Examples (Backdated Sessions)

```bash
# Work session: commits completed at 09:30, backdated 30min
gcalcli add --title "🔨 3 commits in org/repo" \
  --when "2025-11-01 09:00" --duration 30 \
  --description "Session: 09:00-09:30
09:10 → Commit: Setup auth
09:20 → Commit: Add tests
09:30 → Commit: Update docs"

# PR created at 10:30, backdated 60min (includes coding time)
gcalcli add --title "🔀 PR #234: Add user auth" \
  --when "2025-11-01 09:30" --duration 60 \
  --description "Session: 09:30-10:30
Work completed at 10:30
5 files, 150 lines
https://github.com/org/repo/pull/234"

# Combined session: commits (09:00-09:30) + PR (09:00-10:30) overlap
gcalcli add --title "🔨🔀 Work session: 3 commits + PR #234" \
  --when "2025-11-01 09:00" --duration 90 \
  --description "Session: 09:00-10:30
09:10 → 🔨 Commit: Setup auth
09:20 → 🔨 Commit: Add tests
09:30 → 🔨 Commit: Update docs
10:30 → 🔀 PR #234 created
https://github.com/org/repo/pull/234"
```

## User Override

Allow explicit duration in activity data:
```json
{
  "type": "pr_created",
  "title": "PR #123",
  "timestamp": "2025-11-01T10:00:00Z",
  "duration_minutes": 90,
  "url": "https://..."
}
```
