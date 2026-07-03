# Known Claude Code Features

Last updated: 2026-07 (v2.1.199)

## Table of Contents
1. [Slash Commands](#slash-commands)
2. [Settings](#settings)
3. [Environment Variables](#environment-variables)
4. [Beta Features](#beta-features)
5. [Hook Events](#hook-events)
6. [Internal Constants](#internal-constants)
7. [Debug & Session Internals](#debug--session-internals)
8. [Skill & Plugin System](#skill--plugin-system)
9. [Context Display Behavior](#context-display-behavior)
10. [MCP Elicitation](#mcp-elicitation)
11. [Bundled dataviz Skill](#bundled-dataviz-skill-v21198)
12. [Artifact Tool (frame / cobalt_plinth)](#artifact-tool--frame--cobalt_plinth-v21199)

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
| `/skills` | List available skills | Yes |
| `/tasks` | Show background tasks | Yes |

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
| `PreToolUse` | Before tool execution | Validate/modify tool input |
| `PostToolUse` | After tool execution | Process tool output |
| `PostToolUseFailure` | After tool execution fails | Handle tool errors |
| `Stop` | Agent completion | Final processing |
| `SubagentStart` | Subagent starts | Subagent initialization |
| `SubagentStop` | Subagent completion | Subagent result handling |
| `PreCompact` | `manual`, `auto` | Before context compaction |
| `PostCompact` | After compaction | Post-compaction processing |
| `SessionStart` | Session begins | Initialization |
| `SessionEnd` | Session ends | Cleanup |
| `UserPromptSubmit` | User sends message | Pre-process user input |
| `Notification` | System notification | Handle notifications |
| `PermissionRequest` | Permission dialog shown | Programmatic allow/deny |
| `Setup` | `init`, `maintenance` | Repo setup hooks |
| `TeammateIdle` | Teammate about to idle | Prevent idle |
| `TaskCompleted` | Task marked completed | Prevent/observe completion |
| `Elicitation` | MCP server requests user input | Auto-respond accept/decline/cancel |
| `ElicitationResult` | User responds to elicitation | Override response before sending |
| `ConfigChange` | Config file changes | Block/allow config changes |
| `WorktreeCreate` | Git worktree created | Handle worktree creation |
| `WorktreeRemove` | Git worktree removed | Handle worktree removal |
| `InstructionsLoaded` | CLAUDE.md/rule loaded | Observe instruction loading |

**Note**: `PreToolExecution`/`PostToolExecution` are deprecated names for `PreToolUse`/`PostToolUse`.

**Notification types**: `permission_prompt`, `idle_prompt`, `auth_success`, `elicitation_dialog`, `elicitation_complete`, `elicitation_response`.

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

## Skill & Plugin System

### Skill Injection Mechanism

Skills with `type:"prompt"` inject content into **main agent context** (user message role):

```
Skill Tool invoked
    ↓
SKILL.md content → Main agent context (user message)
    ↓
Main agent executes (same context as conversation)
```

**Key properties**:
- Skills are NOT separate execution environments
- Main agent CAN call subagents when following skill instructions
- Subagents CANNOT use: `AskUserQuestion`, `EnterPlanMode`, `ExitPlanMode`

### Progressive Disclosure (3-Tier)

| Tier | Content | When Loaded | Token Impact |
|------|---------|-------------|--------------|
| **1** | Metadata (name + description) | Session start | ~100 tokens/skill |
| **2** | Full SKILL.md | Skill activation | 1-5k tokens |
| **3** | references/, scripts/ | Demand (Read/Bash) | Variable |

**Verification**: `/context` Skills section shows "potential tokens if invoked", NOT actually loaded.

### Plugin Variables

| Variable | Expansion | Use Case |
|----------|-----------|----------|
| `${CLAUDE_PLUGIN_ROOT}` | Plugin installation path | Reference bundled scripts/assets |

---

## Context Display Behavior

### /context Output Structure

The `/context` command shows context breakdown:

```
Main Breakdown (ACTUAL context):
├─ System prompt:   3.1k
├─ System tools:   17.5k  ← Skill tool metadata only
├─ Memory files:    4.6k
└─ Messages:       82.1k

Skills Section (INFORMATIONAL):
├─ Skill A: 5.5k  ← "tokens if invoked"
└─ Skill B: 3.2k
```

**Important**: Skills section total is NOT included in Main Breakdown. It shows potential token cost, not actual loaded content.

### XML Tags in Injections

All injections use `user` role messages (Claude API only has system/user/assistant). XML tags are semantic markers:

| Tag | Purpose |
|-----|---------|
| `<system-reminder>` | System-injected instructions |
| `<command-message>` | Skill/command content |
| `<bash-stdout>` | Shell output |
| `<tool-result>` | Tool execution result |

**Internal flag**: `isMeta: true` distinguishes system injections from user input (not exposed in API).

---

## Agent Memory (v2.1.37+)

### Frontmatter Field

Agents support a `memory` field in YAML frontmatter:

```yaml
---
name: my-agent
memory: project   # "user" | "project" | "local"
---
```

Valid values: `["user", "project", "local"]`. Invalid values produce an error log.

### Memory Scopes

| Scope | Storage Path | Characteristics |
|-------|-------------|-----------------|
| `user` | `~/.claude/agent-memory/{agent-name}/` | Shared across all projects; general learnings |
| `project` | `{project}/.claude/agent-memory/{agent-name}/` | Project-specific; checked into VCS (team shared) |
| `local` | `{project}/.claude/agent-memory-local/{agent-name}/` | Project-specific; NOT in VCS (personal) |

Each directory auto-creates `MEMORY.md` (with `memory.md` → `MEMORY.md` migration).

### Implementation Details

| Aspect | Behavior |
|--------|----------|
| **Tool auto-injection** | When `memory` is set, `Read`, `Write`, `Edit` tools are auto-added to agent's tool list |
| **System prompt** | Memory instructions appended to agent's system prompt via `Lq1()` |
| **Permission** | Agent memory paths auto-allowed for read/write (no user confirmation needed) |
| **Feature flag** | Gated by `tengu_oboe` flag; disabled via `CLAUDE_CODE_DISABLE_AUTO_MEMORY` env var |
| **Scope guideline (user)** | "keep learnings general since they apply across all projects" |
| **Scope guideline (project)** | "tailor your memories to this project (shared via version control)" |
| **Scope guideline (local)** | "tailor your memories to this project and machine (not checked into VCS)" |

### Agent Creation Wizard

Memory scope selection step in wizard UI:

| Option | Value |
|--------|-------|
| Enable (~/.claude/agent-memory/) **(Recommended)** | `user` |
| None (no persistent memory) | `none` |
| Project scope (.claude/agent-memory/) | `project` |
| Local scope (.claude/agent-memory-local/) | `local` |

### Internal Functions

| Function (Minified) | Purpose |
|---------------------|---------|
| `f0A(agentName, scope)` | Resolve memory directory path for agent+scope |
| `Lq1(agentType, scope)` | Generate memory instructions for system prompt |
| `Ub1(path)` | Check if path is an agent-memory path |
| `GQ7(file, ...)` | Parse agent .md file including memory frontmatter |
| `G0A({displayName, memoryDir, extraGuidelines})` | Generate memory prompt block |

---

## MCP Elicitation

**Confidence**: Confirmed (v2.1.76)
**Feature flag**: `tengu_mcp_elicitation`

MCP Elicitation allows MCP servers to request user input during tool execution. Claude Code implements both the **form mode** and **URL mode** from the MCP specification.

### Two Modes

| Mode | MCP Method | Description | Use Case |
|------|-----------|-------------|----------|
| **Form** | `elicitation/create` | Server sends message + JSON schema; client renders form UI | Configuration, preferences, simple input |
| **URL** | `elicitation/create` + `notifications/elicitation/complete` | Server sends URL; user completes flow in browser | OAuth, API keys, payments (sensitive data) |

### Protocol Flow

#### Form Mode

```
MCP Server                          Claude Code (Client)
    │                                      │
    │── elicitation/create ──────────────>  │
    │   {message, requestedSchema}         │
    │                                      │── [Elicitation hook] ──>
    │                                      │<── hook response (optional auto-respond)
    │                                      │
    │                                      │── UI: "Claude Code needs your input"
    │                                      │   [Accept] [Decline]
    │                                      │
    │  <── result {action, content} ─────  │── [ElicitationResult hook] ──>
    │      action: accept|decline|cancel   │
```

#### URL Mode

```
MCP Server                          Claude Code (Client)
    │                                      │
    │── tools/call ────────────────────>   │
    │                                      │
    │  <── error -32042 ─────────────────  │
    │      (UrlElicitationRequired)        │
    │      {elicitations: [{id, url}]}     │
    │                                      │── UI: elicitation_url_dialog
    │                                      │   [Reopen URL] [Cancel] [Accept] [Decline]
    │                                      │
    │  <── notifications/elicitation/      │   (user completes flow in browser)
    │      complete {elicitationId}        │
    │                                      │── Retry original tool call
```

### Capability Declaration

Client declares `elicitation` capability during MCP `initialize` handshake. The server checks:
- `Client does not support form elicitation.` — form mode not declared
- `Client does not support url elicitation.` — URL mode not declared
- `Client does not support elicitation (required for ...)` — no elicitation capability at all

### Hook Integration

Two dedicated hook events provide programmatic control:

| Hook Event | Input | Output Actions | Use Case |
|------------|-------|---------------|----------|
| `Elicitation` | `{mcp_server_name, message, requested_schema}` | `accept`, `decline`, `cancel` | Auto-respond without showing dialog |
| `ElicitationResult` | `{mcp_server_name, action, content, mode, elicitation_id}` | `accept`, `decline`, `cancel` + optional content override | Modify/block response before sending to server |

**Exit codes**:
- `0` — use hook response if provided
- `2` — deny the elicitation / block the response
- Other — show stderr to user only

Both hooks support `matcherMetadata` on `mcp_server_name`, allowing per-server hook targeting.

### UI Components

| Component | Notification Type | Description |
|-----------|------------------|-------------|
| Form dialog | `elicitation_dialog` | Renders JSON schema as form fields (string, number, boolean) |
| URL dialog | `elicitation_url_dialog` | Shows URL with open/reopen/cancel/accept/decline buttons |
| Active state | `elicitation_active` | Status indicator while elicitation is pending |

**Form dialog features**:
- Field validation: `isRequired`, `minItems`, `maxItems`
- Error messages: "This field is required", "Select at least N item(s)"
- Scrollable lists with "N more above/below" indicators

### Telemetry Events

| Event | When |
|-------|------|
| `tengu_mcp_elicitation` | Feature flag check |
| `tengu_mcp_elicitation_shown` | Dialog displayed to user |
| `tengu_mcp_elicitation_response` | User response recorded |

### Error Handling

| Error Code | Name | Meaning |
|------------|------|---------|
| `-32042` | `UrlElicitationRequired` | MCP server requires URL-mode elicitation (returned as tools/call error) |

**Validation**:
- `Invalid elicitation request` — malformed request params
- `Elicitation response content does not match requested schema` — response validation against JSON schema
- `Error validating elicitation response` — schema validation failure
- `Ignoring completion notification for unknown elicitation` — stale/unknown elicitation ID

### Internal Functions (Minified)

| Context | Function/Method | Purpose |
|---------|----------------|---------|
| MCP SDK | `elicitInput()` | Send elicitation request to client |
| MCP SDK | `createElicitationCompletionNotifier()` | Create URL-mode completion notifier |
| MCP SDK | `elicitInputStream` | Stream-based elicitation input |
| Capability | `assertCapabilityForMethod("elicitation/create")` | Check client capability |

### MCP Protocol Methods

| Method | Direction | Purpose |
|--------|-----------|---------|
| `elicitation/create` | Server → Client | Request user input |
| `notifications/elicitation/complete` | Client → Server | Notify URL-mode elicitation completed |

---

## Bundled dataviz Skill (v2.1.198)

**Confidence**: Confirmed (v2.1.198; binary RE cross-checked against materialized files and a live invocation transcript)
**Feature flag**: `tengu_cobalt_plinth_dataviz` — gates only the Artifacts-skill callout, NOT the skill itself
**Introduced**: observed in v2.1.198; exact first-shipping version unverified (v2.1.196/.197 binary diff pending)

`/dataviz` turns chart-making into a checked procedure (form first → color by job → scripted palette validation → mark specs → hover layer → a11y pass → render check). Registered unconditionally at startup (`registerDatavizSkill()`, `userInvocable: true`, no disable env var); only name + description are context-resident until invoked, with the prompt assembled lazily by `getPromptForCommand`.

### Dual-Channel Delivery

The skill body and its support files ship through different channels (separate `SKILL_MD` / `SKILL_FILES` exports in the bundle):

| Channel | Content | On disk? |
|---------|---------|----------|
| Prompt injection (`SKILL_MD`) | SKILL.md body | **No** — injected at invocation, never materialized |
| Filesystem (`SKILL_FILES`) | 7 references + 2 scripts | Yes — `$TMPDIR/claude-{uid}/bundled-skills/{version}/{content-hash}/dataviz/` (same content hash → path reuse) |

Consequence: the materialized directory contains NO SKILL.md — by design, not a bug. A transcript of a dataviz-following session shows `Read`/`Bash` tool_use on the materialized files but never a `Skill` tool entry; subagents (which cannot invoke Skill) get equivalent delivery by being handed the files plus the skill body as text.

### File Manifest

- `references/` (7): `palette.md`, `color-formula.md`, `choosing-a-form.md`, `marks-and-anatomy.md`, `anti-patterns.md`, `interaction.md`, `components.md`
- `scripts/` (2): `validate_palette.js` (Node CLI + browser `data-palette` module, dual entry), `validate_palette.py`

### Palette Validator Contract (`validate_palette.js`)

| Check | Threshold |
|-------|-----------|
| Lightness band (OKLCH L) | light 0.43–0.77 · dark 0.48–0.67 |
| Chroma floor (OKLCH C) | ≥ 0.10 |
| CVD separation (Machado-2009 protan/deutan; tritan advisory) | ΔE ≥ 12 target; 8–12 floor legal only with secondary encoding |
| Contrast vs surface (WCAG relative luminance) | ≥ 3:1; WARN obligates visible labels or a table view |
| `--ordinal` (separate check set) | monotonic lightness, ΔL ≥ 0.06 steps, lightest end ≥ 2:1, single hue ≤ 40° drift |

Exit-code contract: hard FAIL → exit 1; WARN → exit 0 with obligations. Default surfaces `#fcfcfb` (light) / `#1a1a19` (dark). Flags: `--mode light|dark`, `--pairs adjacent|all`, `--ordinal`.

### Rollout Gate Position

`tengu_cobalt_plinth_dataviz` (Statsig, default false) sits on the ROUTING edge, not on the skill: it gates the `<!-- dataviz-callout -->` substitution inside the Artifacts skill (the auto-recommendation nudge). The skill itself is registered and user-invocable regardless of the flag.

### Measured Value (zero-context A/B, 2026-07)

Two zero-context sonnet subagents, identical dashboard task and data with 5 embedded traps; the only difference was providing the dataviz package files. The bare arm failed 3 traps (built a dual-axis combo chart; its dark palette flunked the validator with exit 1; reused status hues as series colors); the dataviz arm failed 0. The bare arm's light palette still passed CVD at 24.1 — latent model knowledge covers light-palette basics. The skill's value therefore concentrates in failure-mode elimination (dual-axis refusal, dark-mode recalibration, status-color discipline); it is maximal in empty contexts, and in a pre-saturated context the knowledge-injection component collapses toward zero, leaving procedure enforcement (validator run, render check).

---

## Artifact Tool — `frame` / `cobalt_plinth` (v2.1.199)

**Confidence**: Confirmed (v2.1.199 standalone binary RE; all quoted strings verbatim via `strings -n 6` against `~/.local/share/claude/versions/2.1.199`)
**Internal codename**: `frame` (API/network surface) · `cobalt_plinth` (feature flags)
**Feature flag**: `tengu_cobalt_plinth` (Statsig, default false) + paid account tier

The `Artifact` tool renders an HTML/Markdown file to a **default-private page hosted on claude.ai**. Both the model-facing `name` and `userFacingName` are literally `Artifact` (symbol `S2o`, `yb="Artifact"`). It is `isReadOnly:false` and `isConcurrencySafe:false` — each publish mutates server state.

### Input Schema (`T2o`, Zod `strictObject`)

| Param | Req | Notes |
|-------|-----|-------|
| `file_path` | yes | `.html`/`.md` path; basename is fallback `<title>` |
| `favicon` | yes | 1–2 emoji, max 32 chars, no markup; keep stable across redeploys |
| `description` | no | max 1000; gallery-card subtitle |
| `label` | no | max 60; version name shown in the claude.ai **version picker** |
| `url` | no | redeploy target; **must be an artifact the user owns** (`role==="owner"`) |
| `force` | no | skip baseVersion/conflict check (overwrite) |
| `capabilities` | no | added only when `Xfe.isFrameMcpEnabled()` — MCP/connector grants |

Output schema (`T$m`): `{url, path, title?, version?, capabilities?, stored?}`.

### Deploy Flow & Network Destinations — the "where does it go" answer

Flow: permission gate → read file → wrap in `<!doctype html>` skeleton (viewport meta + minimal CSS reset `eOm` injected) → size check (**`MAX_ARTIFACT_BYTES` = 16 MB**, over → `"too large: rendered page is XMB (max 16MB)"`) → deploy → return `{url, slug, version}`.

Upload is **two-phase**, hitting two distinct hosts:

| Endpoint | Method | Host | Purpose |
|----------|--------|------|---------|
| `/api/frame/deploy/init` | POST | `api.anthropic.com` | Request signed upload URL (15 s) |
| *(signed PUT)* | PUT | `storage.googleapis.com` | HTML blob upload (GCS signed URL) |
| `/api/frame/deploy/complete` | POST | `api.anthropic.com` | Finalize `{slug, version, ok}` |
| `/api/frame/deploy/direct` | POST | `api.anthropic.com` | Inline fallback (60 s, 32 MB body) |
| `/api/frame/read/${slug}` | GET | `api.anthropic.com` | Read-back of current version |
| `/api/frame/track` | POST | `api.anthropic.com` | Telemetry |

The HTML body itself goes to **Google Cloud Storage** (`storage.googleapis.com`) via a signed PUT with `Content-Type: text/html; charset=utf-8` and `Cache-Control: public, max-age=31536000, immutable`; the `/api/frame/*` control plane resolves to **`api.anthropic.com`** (confirmed by the fallback string `"signed upload to storage.googleapis.com failed (…); inline fallback via api.anthropic.com also failed:"`). Frame API base overridable via env `CLAUDE_CODE_ARTIFACTS_API_BASE_URL`.

**Auth**: OAuth session token (not API key) — endpoint config `{auth:"required", refreshOAuth:true}`; failure message `"not authenticated — run /login"`.

### Public URL Structure (dual-host)

| Layer | Host / path | Confidence |
|-------|-------------|------------|
| Viewer / gallery URL (user-visible, `nUo`) | `https://claude.ai/code/artifact/<slug>` | HIGH |
| Content serving (sandboxed per-slug origin) | `<slug>.frame.claudeusercontent.com/_f/<version>/?__frame_t=<token>` | HIGH |

Content is served from an **isolated origin per slug** under a strict CSP (blocks all external-host requests — CDN scripts, fonts, fetch/XHR). Staging host: `<slug>.frame.staging.claudeusercontent.com`.

### Versioning & Conflict

- **baseVersion staleness** gated by flag `tengu_cobalt_plinth_fern` (default false). When on, publish sends the version this session last *read*; if the session hasn't viewed the latest, throws `"This session hasn't viewed the latest version of the artifact. WebFetch the URL first, or pass force:true to overwrite."`
- **409 conflict**: server 409 → client parses `{conflict:true, live:<version>}`, tags telemetry `"conflict"` / `"publish_conflict"`, returns `liveVersion` for reconciliation.
- **`force:true`** bypasses the check (overwrite). **`label`** names a per-version entry in the version picker.
- Each version is written as an **immutable GCS object** (create-only precondition, HTTP 412 `"this version was already written (create-only precondition)…"`) → old versions are not overwritten client-side.

### Retention & Deletion — server-side, NOT determinable from client

- **No delete/TTL/expiry/retention logic exists in the client.** No artifact-deletion endpoint (`frame/delete` absent). The only delete-flavored strings are 404 messages (`"artifact not found — it may have been deleted…"`).
- `Cache-Control: max-age=31536000, immutable` is a **1-year browser/CDN cache** on the immutable blob — a caching directive, **not** an artifact-retention policy.
- **Conclusion**: retention duration, expiry, and server-side deletion are entirely server-side and cannot be read from the binary. Deletion is presumably via the claude.ai web UI. Safe operating assumption: **published content persists until the user deletes it in the web UI.**

### Privacy / Sharing Model

- **Default-private** (`"a default-private web page hosted on claude.ai"`).
- **Permission gate** (`checkPermissions`): first publish → `behavior:"ask"`. Only auto-`allow` case: **same-session redeploy of an already-published, non-shared artifact**.
- **Share modes** (`_2o` probe): `owner` · `users` (specific users) · `org` (organization) · `unknown`. Publishing to a **shared-live** artifact forces confirmation even on same-session redeploy.
- **Ownership**: the `url` (cross-session update) path requires `role==="owner"`.
- **Connector grants** (MCP-gated): a page may carry a "stored connector grant"; permission text warns `"granting the page access to your connectors…"` — a data-exposure surface.
- **Org compliance block** (`uOm`): `compliance_restricted`, `org_mismatch`, `org_toggle_disabled` — server can refuse publish under org policy (e.g. HIPAA).

### Feature Gating (`isEnabled = e5()`)

All must pass: (1) not hard-disabled AND eligible (`ega`); (2) Statsig `tengu_cobalt_plinth` true (`tga`); (3) `allow_cobalt_plinth` AND paid tier — `Mi()` ∈ `{team, enterprise, pro, max, null}` (free excluded, `rga`); (4) settings override `enableArtifact` precedence `policySettings > flagSettings > userSettings`, default on if unset; else `f6t()` returns true.

| Kill switch / override | Effect |
|------------------------|--------|
| env `CLAUDE_CODE_DISABLE_ARTIFACT` | hard disable |
| env `CLAUDE_CODE_ARTIFACT_DIRECT_UPLOAD` | force inline (`deploy/direct`) path |
| env `CLAUDE_CODE_ARTIFACTS_API_BASE_URL` | override frame API base |
| env `CLAUDE_CODE_ARTIFACT_AUTO_OPEN` | auto-open published page |
| settings `enableArtifact`/`disableArtifact` | policy > flag > user precedence |

Related flags: `tengu_cobalt_plinth_fern` (baseVersion), `tengu_frame_publish_context`, `tengu_slate_lantern` (live-subscribe), `tengu_cobalt_plinth_reader_persist` (read-version disk persistence, default false), `tengu_cobalt_plinth_putguard` (default true), `tengu_saffron_anchor` (capabilities), `tengu_cobalt_plinth_dataviz` (dataviz callout, see prior section).

### Local Traces — session-scoped RAM only

- `file_path → url` mapping lives in **in-memory app state** (`frameUrls[file_path] = {url, updatedAt, title, favicon, capabilities}`), not on disk → this is why "same file path redeploys to the same URL **within a session**."
- Version-view map `artifactReadVersions[slug]` (for baseVersion checks) is likewise app state.
- **No `~/.claude` cache of artifact URLs/IDs**; a fresh session mints a new URL and the `url` param is the only way to target an existing artifact. (`tengu_cobalt_plinth_reader_persist`, default off, hints at future disk persistence.)

### Key Symbols (re-location)

`S2o`/`yb="Artifact"` (tool) · `T2o` (input schema) · `T$m` (output) · `eOm` (CSS reset) · `oee=16777216` (16 MB cap) · `nUo` (viewer URL) · `e5`/`ega`/`tga`/`rga`/`f6t` (enable gate) · `frameUrls`/`artifactReadVersions` (state) · `_2o` (share probe) · `uOm` (compliance block).

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

**Methodology**: Never judge change scope from release notes alone. Binary occurrence comparison (e.g., string count diff between versions) is essential — release notes may list items as "Added" that already existed in prior versions (observed in v2.1.33: 4 of 6 "Added" items were already present in v2.1.32).
