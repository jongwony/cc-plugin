---
name: claude-code-internals
description: >-
  This skill should be used when the user asks to "explore claude code source",
  "find internal features", "investigate cli.js", "check beta headers",
  "discover hidden settings", or mentions "minified code analysis",
  "anthropic-beta headers", "context management internals".
context: fork
---

<constraints>
- **Output limit**: Always use `| head -N` (SIGTRAP risk from session bloat)
- **Relative paths**: Use `scripts/`, `references/` (not absolute paths)
</constraints>

# Claude Code Internals Explorer

Procedures for analyzing Claude Code's standalone binary.

## Quick Start

> **Note**: All script paths are relative to this skill's directory (where SKILL.md resides).

**Delegate all binary exploration to subagent:**

```
Task tool (subagent_type: Explore)
Prompt: "Run scripts/find_installation.sh to get binary path.
        Then search for [keyword] using: strings $BINARY | grep -E '[pattern]' | head -50
        Return: version, matching lines with context (-B2 -A2)."
```

The subagent handles token-heavy strings output; main context receives only summarized findings.

## Zero-Context Mode (Recommended)

**Problem**: Subagent output is recorded in session logs. Binary analysis can cause session file bloat → SIGTRAP crashes.

**Solution**: Write prompt to temp file, then execute via Headless CLI wrapper. Script internals are not logged; only final stdout is recorded.

### Workflow

1. **Write prompt** to temp file (supports multiline)
2. **Execute** `scripts/analyze-binary.sh <prompt_file> [allowed_tools]`

### Script Interface

| Argument | Description | Default |
|----------|-------------|---------|
| `$1` | Prompt file path (required) | - |
| `$2` | Allowed tools (comma-separated) | `Bash,Read,Glob,Grep` |

The script injects `BINARY_PATH` automatically.

### Example

```bash
# Use unique ID in filename for parallel independence
PROMPT_FILE="/tmp/internals_prompt_$$.txt"

# 1. Write prompt to temp file
cat > "$PROMPT_FILE" << 'EOF'
Search the binary for beta headers.

Instructions:
1. Use: strings "$BINARY_PATH" | grep -E "anthropic-beta|20[0-9]{2}-[0-9]{2}" | head -30
2. List all matching headers with their apparent status
3. Note any patterns suggesting feature flags
EOF

# 2. Execute with tool restriction
scripts/analyze-binary.sh "$PROMPT_FILE" "Bash,Read,Glob,Grep"

# 3. Cleanup (optional - /tmp clears on reboot)
rm -f "$PROMPT_FILE"
```

### Dynamic Prompting

The agent constructs prompts dynamically based on investigation context.

**File naming convention**: `/tmp/internals_prompt_<unique_id>.txt`
- Use `$$` (PID) or UUID for parallel execution independence
- Multiple concurrent investigations won't conflict

```bash
PROMPT_FILE="/tmp/internals_prompt_$(date +%s%N).txt"

cat > "$PROMPT_FILE" << 'EOF'
Investigate context management settings.
1. Search for contextWindow, warningThreshold, errorThreshold
2. Find related numeric constants (5-6 digit numbers)
3. Return: setting name, value, surrounding context
EOF

scripts/analyze-binary.sh "$PROMPT_FILE"
```

### Tool Inheritance

Agent's tool restrictions are passed to Headless CLI via `--allowedTools`:

| Agent tools | Script invocation |
|-------------|-------------------|
| `[Bash, Read, Glob, Grep]` | `analyze-binary.sh /tmp/p.txt "Bash,Read,Glob,Grep"` |
| `[Read, Grep]` | `analyze-binary.sh /tmp/p.txt "Read,Grep"` |

> **Why this works**: Bash subagent executes the script as an external process. Only the script's stdout appears in session logs, not the intermediate 350K+ lines from `strings`.

## Common Investigations

| Task | Approach |
|------|----------|
| Check feature enabled | `strings $BINARY_PATH \| grep "feature_name"` |
| Find default values | See `references/search-patterns.md` Settings section |
| Discover new commands | See `references/search-patterns.md` Commands section |
| Compare release notes | Search mentioned features -> compare with `references/known-features.md` |

## Resources

- **scripts/find_installation.sh**: Locate Claude Code binary
- **references/search-patterns.md**: Comprehensive search patterns by category
- **references/known-features.md**: Baseline of known features for comparison

## Resource Map

| Resource | Path | Load When |
|----------|------|-----------|
| **Zero-context analyzer** | `scripts/analyze-binary.sh` | **Recommended default** |
| Known features baseline | `references/known-features.md` | Comparing with new discoveries |
| Search pattern library | `references/search-patterns.md` | Investigating specific category |
| Installation finder | `scripts/find_installation.sh` | Starting investigation |

## Tips

1. **Cache strings**: `strings $BINARY_PATH > /tmp/claude-strings.txt` once, grep multiple times
2. **Start narrow**: Specific terms before broad exploration
3. **Chain searches**: Find one string, search nearby for related code
4. **Clean up**: Remove `/tmp/claude-strings.txt` after investigation
