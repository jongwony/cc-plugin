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
- ALWAYS delegate: strings output is 350K+ lines, never run in main context
- Binary format: Use `strings` to extract readable text from standalone binary
- Version-specific: findings may change between CLI versions
</constraints>

# Claude Code Internals Explorer

Analyze Claude Code's standalone binary to understand internal behavior and discover features.

## Important Caveats

- **ALWAYS delegate**: `strings` output is 350,000+ lines — running in main context wastes tokens
- **Standalone binary**: Claude Code ships as a compiled binary, not readable JavaScript
- **Version-specific**: Findings may change between versions
- **Unofficial**: Discovered features may be unsupported/unstable

## Quick Start

**Delegate all binary exploration to subagent:**

```
Task tool (subagent_type: Explore)
Prompt: "Run ${CLAUDE_PLUGIN_ROOT}/scripts/find_installation.sh to get binary path.
        Then search for [keyword] using: strings $BINARY | grep -E '[pattern]'
        Return: version, matching lines with context (-B2 -A2)."
```

The subagent handles token-heavy strings output; main context receives only summarized findings.

## Workflow

### 1. Delegate Binary Exploration (Required)

**Principle**: strings output (350K+ lines) consumes tokens in subagent context, preserving main context for analysis.

Call Task tool with:
- `subagent_type`: `Explore`
- `prompt`: Specify search target and expected output format

Example delegations:

```
# Feature investigation
Find Claude Code binary using ${CLAUDE_PLUGIN_ROOT}/scripts/find_installation.sh.
Search for "anthropic-beta" using: strings $BINARY | grep -E "anthropic-beta|20[0-9]{2}-[0-9]{2}"
Return: version, all matching lines.

# Settings discovery
Run find_installation.sh, then search for setting patterns:
strings $BINARY | grep -E "autoCompact|permission|default.*:"
Return: setting names and apparent default values.
```

The subagent will:
1. Execute shell scripts and strings commands
2. Filter results with grep
3. Return summarized findings to main context

Main agent then performs interpretation and decision-making.

### 2. Subagent Search Commands (Reference)

> **Note**: These commands are for subagent execution, not main context.

```bash
# Get binary path
BINARY="$HOME/.local/share/claude/versions/$(ls -t ~/.local/share/claude/versions | head -1)"

# Search with context
strings "$BINARY" | grep -B2 -A2 "pattern"

# Cache for multiple searches (within subagent session)
strings "$BINARY" > /tmp/claude-strings.txt
grep "pattern1" /tmp/claude-strings.txt
grep "pattern2" /tmp/claude-strings.txt
```

### 3. Investigation Types

| Goal | Approach |
|------|----------|
| **Specific feature** | Search for known keywords with `strings \| grep` |
| **New version changes** | Compare with `known-features.md`, check release notes |
| **Hidden settings** | Search for setting patterns |
| **Beta features** | Search for beta headers |

### 4. Analyze Findings

When you find relevant strings:

1. Note context with `grep -B2 -A2` for surrounding lines
2. Search for related strings to understand feature scope
3. Compare findings with `references/known-features.md`

### 5. Document Discoveries

Update `references/known-features.md` with:
- New features found
- Changed defaults/thresholds
- New beta headers
- Corrected information

## Common Investigations

| Task | Approach |
|------|----------|
| Check feature enabled | `strings $BINARY \| grep "feature_name"` |
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
| Known features baseline | `references/known-features.md` | Comparing with new discoveries |
| Search pattern library | `references/search-patterns.md` | Investigating specific category |
| Installation finder | `scripts/find_installation.sh` | Starting investigation |

## Tips

1. **Cache strings output**: Run `strings $BINARY > /tmp/claude-strings.txt` once, grep multiple times
2. **Start narrow**: Search specific terms before broad exploration
3. **Chain searches**: Find one string, search nearby for related code
4. **Save findings**: Update known-features.md to track discoveries
5. **Version awareness**: Note version when documenting findings
