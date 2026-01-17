# Search Patterns for Claude Code Internals

## Prerequisites

Set up the binary path before searching:

```bash
# Get latest binary path
BINARY="$HOME/.local/share/claude/versions/$(ls -t ~/.local/share/claude/versions | head -1)"

# Performance: Cache strings output for multiple searches
strings "$BINARY" > /tmp/claude-strings.txt
```

After caching, use `grep PATTERN /tmp/claude-strings.txt` instead of `strings "$BINARY" | grep`.

## Table of Contents
1. [Beta Headers](#beta-headers)
2. [Settings & Configuration](#settings--configuration)
3. [Commands](#commands)
4. [Context Management](#context-management)
5. [API Integration](#api-integration)
6. [Hooks & Events](#hooks--events)
7. [Tool System](#tool-system)
8. [Model Configuration](#model-configuration)

---

## Beta Headers

Beta headers enable experimental features. Search patterns:

```bash
# Find all beta header definitions
strings "$BINARY" | grep -E "anthropic-beta|beta.*20[0-9]{2}"

# Known beta headers (as of 2.0.59)
# - claude-code-20250219
# - interleaved-thinking-2025-05-14
# - fine-grained-tool-streaming-2025-05-14
# - context-1m-2025-08-07
# - context-management-2025-06-27
# - structured-outputs-2025-09-17
# - tmp-preserve-thinking-2025-10-01
```

## Settings & Configuration

```bash
# Find setting keys
strings "$BINARY" | grep -E "autoCompact|permission|model|theme"

# Find default values
strings "$BINARY" | grep -E "default.*true|default.*false|default.*:"

# Settings file locations
# ~/.claude/settings.json (global)
# .claude/settings.json (project)
```

## Commands

```bash
# Find slash command definitions
strings "$BINARY" | grep -E 'name:\s*"[a-z]+".*description:'
strings "$BINARY" | grep -E "type.*local.*name"

# Known commands: /help, /clear, /compact, /context, /cost, /doctor, etc.
```

## Context Management

```bash
# Context window thresholds
strings "$BINARY" | grep -E "[0-9]{5,6}" | grep -iE "context|token|window"

# Compaction logic
strings "$BINARY" | grep -E "compact|compaction|summarize"

# Auto-compact settings
strings "$BINARY" | grep -E "autoCompact"
```

## API Integration

```bash
# API endpoint patterns
strings "$BINARY" | grep -E "api\.anthropic|messages|completions"

# Request construction
strings "$BINARY" | grep -E "model.*claude|max_tokens|temperature"

# Error handling
strings "$BINARY" | grep -E "APIError|rate.*limit|retry"
```

## Hooks & Events

```bash
# Hook event names
strings "$BINARY" | grep -E "PreCompact|PostCompact|Pre.*Hook|Post.*Hook"

# Event triggers
strings "$BINARY" | grep -E "trigger.*manual|trigger.*auto"

# Hook configuration
strings "$BINARY" | grep -E "hook_event_name|matcherMetadata"
```

## Tool System

```bash
# Built-in tools
strings "$BINARY" | grep -E "\"Read\"|\"Write\"|\"Edit\"|\"Bash\"|\"Glob\"|\"Grep\"|\"Task\""

# Tool definitions
strings "$BINARY" | grep -E "tool.*name.*description"

# Permission system
strings "$BINARY" | grep -E "permission|allow|deny|approve"
```

## Model Configuration

```bash
# Model names
strings "$BINARY" | grep -E "claude-[0-9]|opus|sonnet|haiku"

# Extended context
strings "$BINARY" | grep -E "\[1m\]|1000000|context.*1m"

# Thinking mode
strings "$BINARY" | grep -E "thinking|extended.*thinking|ultrathink"
```

---

## Tips for Searching Binaries

1. **Cache strings output**: Extract once, grep many times
   ```bash
   strings "$BINARY" > /tmp/claude-strings.txt
   grep "pattern1" /tmp/claude-strings.txt
   grep "pattern2" /tmp/claude-strings.txt
   ```

2. **Use context flags**: `-B2 -A2` shows surrounding lines
   ```bash
   grep -B2 -A2 "context-management" /tmp/claude-strings.txt
   ```

3. **Chain searches**: Find one pattern, then search nearby
   ```bash
   grep -n "anthropic-beta" /tmp/claude-strings.txt | head -5
   # Note line numbers, then examine context
   sed -n '1000,1010p' /tmp/claude-strings.txt
   ```

4. **Version check**: Always verify which version you're analyzing
   ```bash
   ls -t ~/.local/share/claude/versions | head -1
   ```
