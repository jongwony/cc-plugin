# Search Patterns for Claude Code Internals

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
grep -E "anthropic-beta|beta.*20[0-9]{2}" cli.js

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
grep -E "autoCompact|permission|model|theme" cli.js

# Find default values
grep -E "default.*true|default.*false|default.*:" cli.js

# Settings file locations
# ~/.claude/settings.json (global)
# .claude/settings.json (project)
```

## Commands

```bash
# Find slash command definitions
grep -E 'name:\s*"[a-z]+".*description:' cli.js
grep -E "type.*local.*name" cli.js

# Known commands: /help, /clear, /compact, /context, /cost, /doctor, etc.
```

## Context Management

```bash
# Context window thresholds
grep -E "[0-9]{5,6}" cli.js | grep -i "context\|token\|window"

# Compaction logic
grep -E "compact|compaction|summarize" cli.js

# Auto-compact settings
grep -E "autoCompact" cli.js
```

## API Integration

```bash
# API endpoint patterns
grep -E "api\.anthropic|messages|completions" cli.js

# Request construction
grep -E "model.*claude|max_tokens|temperature" cli.js

# Error handling
grep -E "APIError|rate.*limit|retry" cli.js
```

## Hooks & Events

```bash
# Hook event names
grep -E "PreCompact|PostCompact|Pre.*Hook|Post.*Hook" cli.js

# Event triggers
grep -E "trigger.*manual|trigger.*auto" cli.js

# Hook configuration
grep -E "hook_event_name|matcherMetadata" cli.js
```

## Tool System

```bash
# Built-in tools
grep -E "Read|Write|Edit|Bash|Glob|Grep|Task" cli.js

# Tool definitions
grep -E "tool.*name.*description" cli.js

# Permission system
grep -E "permission|allow|deny|approve" cli.js
```

## Model Configuration

```bash
# Model names
grep -E "claude-[0-9]|opus|sonnet|haiku" cli.js

# Extended context
grep -E "\[1m\]|1000000|context.*1m" cli.js

# Thinking mode
grep -E "thinking|extended.*thinking|ultrathink" cli.js
```

---

## Tips for Searching Minified Code

1. **Variable names are obfuscated**: Look for string literals instead
2. **Use context**: Search for surrounding known strings
3. **Chain searches**: Find one pattern, then search nearby code
4. **Use line numbers**: `grep -n` to locate, then read context with `sed`

```bash
# Example: Find a pattern and show context
grep -n "context-management" cli.js | head -1
# Then read lines around it:
sed -n '650,660p' cli.js
```
