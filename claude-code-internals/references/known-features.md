# Known Claude Code Features

Last updated: 2025-12 (v2.0.76)

## Table of Contents
1. [Slash Commands](#slash-commands)
2. [Settings](#settings)
3. [Environment Variables](#environment-variables)
4. [Beta Features](#beta-features)
5. [Hook Events](#hook-events)
6. [Internal Constants](#internal-constants)
7. [Debug & Session Internals](#debug--session-internals)

---

## Slash Commands

| Command | Description | Documented |
|---------|-------------|------------|
| `/help` | Show help | Yes |
| `/clear` | Clear conversation | Yes |
| `/compact` | Summarize and compress context | Yes |
| `/context` | Show context usage visualization | Yes |
| `/cost` | Show token usage stats | Yes |
| `/doctor` | Diagnose installation issues | Yes |
| `/init` | Initialize CLAUDE.md | Yes |
| `/ide` | Connect to IDE | Yes |
| `/login` | Authentication | Yes |
| `/logout` | Sign out | Yes |
| `/memory` | Manage memory files | Yes |
| `/model` | Switch model | Yes |
| `/permissions` | Manage permissions | Yes |
| `/pr-comments` | PR comment workflow | Yes |
| `/review` | Code review mode | Yes |
| `/rewind` | Rollback changes | Yes |
| `/status` | Show status | Yes |
| `/terminal-setup` | Configure terminal | Yes |
| `/usage` | Show plan usage | Yes |
| `/vim` | Vim keybindings | Yes |

## Settings

### Documented Settings

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `autoCompactEnabled` | boolean | `true` | Auto-compact when context full |
| `permissions` | object | - | Tool permissions |
| `theme` | string | - | Color theme |
| `model` | string | - | Default model |

### Undocumented/Internal Settings

| Key | Type | Default | Notes |
|-----|------|---------|-------|
| `contextWindow` | number | 200000 | Default context size |
| `warningThreshold` | number | 20000 | Tokens remaining for warning |
| `errorThreshold` | number | 20000 | Tokens remaining for error |

## Environment Variables

### Documented

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | API key |
| `ANTHROPIC_CUSTOM_HEADERS` | Custom headers (`Name: Value`) |
| `ANTHROPIC_AUTH_TOKEN` | Custom auth token |
| `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS` | Disable experimental betas |

### Undocumented/Internal

| Variable | Description | Notes |
|----------|-------------|-------|
| `CLAUDE_CODE_DEBUG` | Enable debug logging | Suspected |
| `CLAUDE_CODE_TELEMETRY` | Control telemetry | Suspected |

## Beta Features

### Active Betas (v2.0.59)

| Beta Header | Status | Description |
|-------------|--------|-------------|
| `claude-code-20250219` | Active | Claude Code identifier |
| `interleaved-thinking-2025-05-14` | Active | Interleaved thinking |
| `fine-grained-tool-streaming-2025-05-14` | Active | Tool streaming |
| `context-1m-2025-08-07` | Active | 1M context window |
| `structured-outputs-2025-09-17` | Active | Structured outputs |
| `tmp-preserve-thinking-2025-10-01` | Active | Preserve thinking |

### Inactive/Disabled Betas

| Beta Header | Status | Notes |
|-------------|--------|-------|
| `context-management-2025-06-27` | Defined but disabled | `cT0()` returns undefined |

## Hook Events

| Event | Trigger | Description |
|-------|---------|-------------|
| `PreCompact` | `manual`, `auto` | Before compaction |
| `PostCompact` | - | After compaction |
| `PreToolExecution` | - | Before tool runs |
| `PostToolExecution` | - | After tool completes |

## Internal Constants

Found in minified code:

| Variable (Minified) | Value | Meaning |
|---------------------|-------|---------|
| `tyI` | 20000 | Warning threshold (tokens) |
| `eyI` | 20000 | Error threshold (tokens) |
| `s4A()` | ~200000 | Default context window |

## Debug & Session Internals

### Session Definition

| Concept | Definition | Storage |
|---------|------------|---------|
| Session | Single `claude` process invocation | `~/.claude/debug/{UUID}.txt` |
| Conversation | Message history (may span sessions) | `~/.claude/projects/{project}/{UUID}.jsonl` |

- Each `claude` execution creates new session with `crypto.randomUUID()`
- `--continue` loads previous conversation but starts **new session**
- Multiple sessions can run in parallel (separate debug files)

### Debug File Mechanism

| Path | Purpose |
|------|---------|
| `~/.claude/debug/{UUID}.txt` | Session debug log |
| `~/.claude/debug/latest` | Symlink to most recent session |

**Symlink update timing**: Process startup only (not during session)

**Atomic update pattern**:
```javascript
// Race condition prevention
symlinkSync(target, `${path}.tmp.${pid}.${timestamp}`)
renameSync(`${path}.tmp...`, path)
```

### Debug Log Format

```
{ISO8601_TIMESTAMP} [{LOG_LEVEL}] {MESSAGE}
```

Example:
```
2025-12-29T05:00:36.987Z [DEBUG] [SLOW OPERATION DETECTED] execSyncWithDefaults_DEPRECATED (19.8ms): ...
```

### Parallel Session Behavior

| Scenario | Behavior |
|----------|----------|
| Multiple terminals | Each gets own session ID and debug file |
| `latest` symlink | Points to most recently **started** session |
| Existing sessions | Unaffected by new session starting |

---

## Update Checklist

When exploring new versions, check for:

- [ ] New slash commands
- [ ] New/changed settings keys
- [ ] New beta headers
- [ ] Changed thresholds/constants
- [ ] New hook events
- [ ] New environment variables
- [ ] New tool definitions
