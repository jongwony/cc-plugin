---
name: codex-session
description: |
  This skill should be used when the user asks to "find codex session", "codex session context", "lookup codex session", "show codex history", "codex session summary", or provides a Codex session UUID. Finds and summarizes OpenAI Codex session files from ~/.codex/sessions/.
---

# Codex Session Lookup

Retrieve context from Codex CLI session history stored at `~/.codex/sessions/`.

## Session Structure

```
~/.codex/sessions/YYYY/MM/DD/rollout-{timestamp}-{UUID}.jsonl
```

Each JSONL file contains:
- `session_meta`: id, cwd, model, cli_version, instructions, git info
- `event_msg` (agent_message): final agent output
- `event_msg` (agent_reasoning): thinking/reasoning blocks
- `response_item`: user prompts, function calls
- `turn_context`: per-turn metadata (model, effort, sandbox)

## Workflow

### 1. Identify Session

Determine what the user wants to find:

| Input | Action |
|-------|--------|
| Partial/full UUID | Direct lookup |
| "recent" / "latest" | Show recent sessions |
| Topic/keyword | Search via grep across sessions |

### 2. Execute Extraction

Use the helper script:

```bash
# Find by UUID (partial match supported)
python3 ${CLAUDE_PLUGIN_ROOT}/scripts/codex-session-extract.py <partial-uuid>

# Include reasoning blocks
python3 ${CLAUDE_PLUGIN_ROOT}/scripts/codex-session-extract.py <partial-uuid> --full

# List matches only (no content extraction)
python3 ${CLAUDE_PLUGIN_ROOT}/scripts/codex-session-extract.py <partial-uuid> --list

# Show recent sessions
python3 ${CLAUDE_PLUGIN_ROOT}/scripts/codex-session-extract.py --recent [N]
```

For keyword-based search (no UUID provided):
```bash
grep -rl "keyword" ~/.codex/sessions/ --include="*.jsonl" | head -10
```

### 3. Present Results

Summarize the extracted context:
- Session metadata (model, cwd, git branch, instructions)
- User prompts that initiated the session
- Agent output (final messages)
- Function calls summary
- Token usage stats

### 4. Follow-up Options

After presenting context, offer via `AskUserQuestion`:
- **Resume session**: hand off to `/codex` skill with `--resume`
- **View reasoning**: re-run with `--full` flag
- **Extract specific content**: grep for particular sections
- **Copy to current context**: incorporate findings into current task

## Error Handling

- No matches: suggest `--recent` to browse available sessions
- Multiple matches: display list table, use first match or ask user to pick
- Large output (>500 lines): truncate agent messages and offer `--full` separately
