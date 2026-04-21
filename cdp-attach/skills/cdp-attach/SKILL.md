---
name: cdp-attach
description: |
  This skill should be used when the user asks to "take browser screenshot",
  "list browser tabs", "click page element", "navigate browser",
  "automate browser", "inspect accessibility tree", "monitor network",
  "run JavaScript in browser", "fill form in browser", "debug web page",
  or mentions CDP. Attaches to a running CDP instance for browser automation.
user_invocable: true
context: fork
argument-hint: "<operation> [args...]"
---

# CDP Attach

Attach to a running Chrome DevTools Protocol instance. Immune to frozen-tab timeouts.

## Prerequisites

A **visible** (headed) CDP-enabled browser must be running. Headless instances are blocked — silent execution without user visibility is a security risk.

```bash
# Manual launch (visible browser)
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
```

> **Note**: `claude --chrome` may launch a headless instance. If `v1 version` shows `HeadlessChrome`, use the manual launch method above instead.

## Scope Guard

cdp-attach is for **acting on** the attached browser, not for **researching through** it.

**WILL** use cdp-attach for:
- Capturing current state (screenshot, snapshot, network/console logs)
- Interacting with attached page (click, fill, JS evaluate, dialog handling)
- Navigating as a workflow step (e.g., form submit → result page, SPA state transitions)
- Monitoring (network_start/stop, console, performance tracing)
- Error diagnosis (screenshot + Read of error pages during automation)
- API response debugging (navigate to endpoint as part of debugging workflow)

**WILL NOT** use cdp-attach for:
- Browsing documentation or API references
- Searching for information via web pages
- Opening new tabs to research topics
- Reading web content for knowledge gathering

**Litmus test**: "Am I acting on the page, or learning from it?"
If learning → switch to Tavily MCP (`tavily_search`, `tavily_extract`) or Prothesis for multi-perspective investigation.

**Redirect rule**: When a research need arises mid-workflow, pause the cdp-attach context, resolve via Tavily, then resume cdp-attach with the findings.

## Execution

Each Bash call is a separate shell. Always combine the variable assignment with the command:
```bash
V1="${CLAUDE_PLUGIN_ROOT}/scripts/v1_core.py" && $V1 list
V2="${CLAUDE_PLUGIN_ROOT}/scripts/v2_interact.py" && $V2 click --selector "a"
V3="${CLAUDE_PLUGIN_ROOT}/scripts/v3_advanced.py" && $V3 network_start
```

## Quick Reference

### v1 — Core (`v1_core.py`)

```bash
V1="${CLAUDE_PLUGIN_ROOT}/scripts/v1_core.py"

$V1 version                                    # Browser info
$V1 list                                       # List tabs (default: first 50 pages)
$V1 list --search "github" --limit 20          # Search tabs
$V1 list --type all                            # Include iframes, workers
$V1 select 0                                   # Select tab by index
$V1 select AB71CD183BCE05DD...                  # Select by target ID
$V1 screenshot                                 # PNG of selected tab
$V1 screenshot --full-page --format jpeg -o /tmp/page.jpg
$V1 snapshot --depth 3                         # Accessibility tree
$V1 evaluate "document.title"                  # Run JavaScript
$V1 evaluate "fetch('/api').then(r=>r.json())" --await
$V1 evaluate --stdin <<< 'var x = document.title; x'  # Stdin mode
$V1 evaluate --no-rewrite "const x = 1"       # Skip var rewriting
$V1 navigate "https://example.com"             # Navigate
$V1 navigate "https://example.com" --wait-for none

$V1 evaluate "document.title" --frame "iframe.embedded"   # Evaluate inside an iframe
$V1 evaluate --frame main "location.href"                 # Explicit top frame

$V1 wait --selector "div.loaded" --timeout-ms 10000       # Element appears
$V1 wait --text "Order complete"                          # Text appears somewhere
$V1 wait --url-contains "/dashboard"                      # URL navigation
$V1 wait --load-state networkidle                         # Page lifecycle state
$V1 wait --function "window.__APP_READY__ === true"       # Custom JS predicate
```

> **Note on `--frame`**: accepts a CSS selector matching a frame owner (e.g. `iframe`, `frame`, `object`, `embed`) or the literal `main` for the top-level document. Cross-origin frames resolve the same way because CDP exposes per-frame execution contexts regardless of origin.

### Common Mistakes

**Commands that do NOT exist:**
- `read_screenshot` — use `v1 screenshot` then `Read /tmp/cdp-screenshot-*.png`

**Arguments that do NOT exist:**
- `click --coordinates x y` — use positional: `click 100 200`
- `click --text "..."` — use `click --selector` with a CSS selector instead
- `screenshot --selector` — not supported; screenshot captures the full viewport (or `--full-page`)
- `find_element --id` — use `--node-id` or `--backend-node-id` in `get_bounds`
- `scan_interactive --selector` — not supported; use `find_element --selector` instead
- `get_bounds --text` — use `find_element --text` first, then `get_bounds --node-id`

**JavaScript in evaluate:**
- `const`/`let` are auto-rewritten to `var` by default (prevents re-declaration errors on repeated calls). Use `--no-rewrite` to disable.
- For complex JS with quotes/backticks, use `--stdin` with heredoc:
  ```bash
  $V1 evaluate --stdin <<'JS'
  document.querySelectorAll('a').forEach(a => console.log(a.href))
  JS
  ```
- Use `--await` flag for promises (auto-wraps in async IIFE if needed):
  ```bash
  $V1 evaluate --await "await fetch('/api').then(r => r.json())"
  ```

### v2 — Interaction (`v2_interact.py`)

```bash
V2="${CLAUDE_PLUGIN_ROOT}/scripts/v2_interact.py"

$V2 click 100 200                              # Click at coordinates
$V2 click --selector "button.submit"           # Click CSS selector
$V2 fill --selector "input[name=q]" "search query"
$V2 press_key Enter                            # Press key
$V2 press_key a --modifiers ctrl               # Ctrl+A
$V2 hover --selector "a.nav-link"
$V2 new_page "https://example.com"             # Open new tab
$V2 close_page                                 # Close selected tab
```

### v2 — Element Discovery (`v2_interact.py`)

When CSS selectors fail (collapsed SPA panels, shadow DOM, hashed classes), use CDP DOM/Accessibility API.

```bash
V2="${CLAUDE_PLUGIN_ROOT}/scripts/v2_interact.py"

# find_element — semantic element search
$V2 find_element --name "Search" --role button     # accessible name + role
$V2 find_element --text "Property Info"            # visible text
$V2 find_element --xpath "//button[contains(.,'Search')]"
$V2 find_element --selector "div.panel" --pierce   # pierce shadow DOM

# get_bounds — coordinate resolution + auto scroll-into-view
$V2 get_bounds --node-id 42                    # use find_element result
$V2 get_bounds --backend-node-id 87
$V2 get_bounds --selector "button.submit"
$V2 get_bounds --selector "button.submit" --no-scroll

# scan_interactive — enumerate interactive elements
$V2 scan_interactive                           # all
$V2 scan_interactive --viewport                # viewport-visible only
$V2 scan_interactive --role button,link        # filter by role
$V2 scan_interactive --limit 30
```

### v3 — Advanced (`v3_advanced.py`)

```bash
V3="${CLAUDE_PLUGIN_ROOT}/scripts/v3_advanced.py"

# Network monitoring (background collector)
$V3 network_start                              # Start collecting
$V3 network_list --filter "api"                # View requests
$V3 network_stop                               # Stop + summary

# Console monitoring
$V3 console_start
$V3 console_list --level error                 # Errors only
$V3 console_stop

# Performance tracing
$V3 perf_start --categories "devtools.timeline"
$V3 perf_stop -o /tmp/trace.json               # Save trace

# Device / environment emulation
$V3 emulate --width 375 --height 812 --scale 3 --mobile  # Viewport + device
$V3 emulate --geolocation "37.5665,126.9780"             # Override geolocation
$V3 emulate --offline true                               # Simulate offline
$V3 emulate_reset                                        # Reset device, geo, and network conditions

# Pre-load script injection (runs before each new document loads)
$V3 add_init_script "window.__TEST_HOOK__ = true"
$V3 add_init_script --stdin <<'JS'
Object.defineProperty(navigator, 'webdriver', { get: () => false });
JS
$V3 remove_init_script "1"                     # Identifier returned by add_init_script

# Download synchronization (blocks until downloadProgress completes)
$V3 download_wait --timeout-ms 60000
$V3 download_wait --download-path /tmp/my-dl --timeout-ms 30000

# Session state archive (cookies + localStorage + sessionStorage, batch only)
$V3 state_save ~/.cache/my-session.json
$V3 state_load ~/.cache/my-session.json

# Drag and dialog
$V3 drag 100 100 300 300 --steps 20
$V3 dialog accept                              # Handle alert/confirm
$V3 dialog accept "prompt input"               # Handle prompt
```

> **Note on `state_save` / `state_load`**: batch session packaging only. Individual cookie or storage reads/writes go through `v1 evaluate` (browser is the authoritative state holder). `state_save` captures **current-tab origin cookies** (via `Network.getCookies` URL filter) plus that tab's `localStorage` / `sessionStorage`; pass `--all-cookies` to capture the entire browser cookie jar instead. IndexedDB is not included in v1 of the state snapshot.

> **Note**: `dialog` is reactive — it handles an already-open dialog. It will fail if no dialog is currently visible. Trigger the dialog first (e.g., via `evaluate` or navigation), then call `dialog` to respond.

## Typical Workflows

### Screenshot Analysis
```
1. v1 list --search "target"    → Find the tab
2. v1 select <index>            → Select it
3. v1 screenshot                → Capture PNG
4. Read /tmp/cdp-screenshot-*.png → View in Claude
```

### Form Interaction
```
1. v1 select <tab>
2. v1 snapshot --depth 3        → Understand page structure
3. v2 fill --selector "input" "text"
4. v2 click --selector "button[type=submit]"
5. v1 screenshot                → Verify result
```

### SPA / Dynamic Page Interaction
When CSS selector fails (zero-dimension, hashed class, shadow DOM):
```
1. v2 scan_interactive                  → List interactive elements + coordinates
2. v2 click <x> <y>                     → Click by coordinates

Or:
1. v2 find_element --name "Search"       → Discover backendNodeId
2. v2 get_bounds --backend-node-id <id>  → Resolve coordinates
3. v2 click <x> <y>                     → Click
```

### Vision Fallback (last resort)
When all programmatic approaches fail:
```
1. v1 screenshot -o /tmp/page.png       → Capture page
2. Read /tmp/page.png                   → AI visually estimates coordinates
3. v2 click <x> <y>                     → Click estimated coordinates
4. v1 screenshot                        → Verify result
```

**Known Limitations:**
- During React hydration, `find_element --name/--role` may return empty results. Wait for hydration via `v1 evaluate`, then retry.
- `scan_interactive` makes a CDP call per element; use `--limit` to constrain (default 50).
- nodeId is invalidated on DOM changes. For stable references, use backendNodeId.

### Network Debugging
```
1. v1 select <tab>
2. v3 network_start             → Begin capture
3. v1 navigate "https://..."    → Trigger requests
4. v3 network_list --filter "api" → Inspect
5. v3 network_stop              → Cleanup
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `CDP_HOST` | `127.0.0.1` | Chrome DevTools host |
| `CDP_PORT` | `9222` | Chrome DevTools port |

Or use `--host` / `--port` flags on any command.

## State

- Selected tab: `~/.cache/cdp-attach/state.json`
- Network events: `~/.cache/cdp-attach/network-events.jsonl`
- Console events: `~/.cache/cdp-attach/console-events.jsonl`

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| CDP HTTP endpoint unreachable | Browser not running with `--remote-debugging-port` | Start browser with CDP enabled |
| Timeout waiting for response | Tab frozen/suspended | Select a different active tab |
| WebSocket connection failed | Tab closed or navigated away | Re-select tab with `list` + `select` |
| Element not found | Invalid CSS selector | Check selector with `evaluate` + `querySelector` |

### Fallback Strategy

Tab attachment and screenshot capture are inherently flaky. When a CDP operation fails after 2 attempts, escalate through the fallback chain before abandoning CDP entirely.

| Symptom | 1st fallback (stay in CDP) | 2nd fallback (leave CDP) |
|---------|---------------------------|--------------------------|
| Tab attachment fails | `v1 list` → re-select a different tab index | Ask user to manually navigate, then retry |
| Screenshot capture times out | `v1 evaluate "document.title"` to extract DOM text directly | Ask user to capture screenshot manually |
| DOM navigation unreliable (react-select, dynamic SPAs) | `v2 scan_interactive` or `v2 find_element --name/--role` to discover elements via CDP DOM/Accessibility API | Vision fallback: screenshot → Read → click coordinates |
| HTTP/TLS inspection needed | `v1 evaluate` with `fetch()` to inspect responses | `curl` / `openssl s_client` as CLI alternative |

## Protocol Reference

For CDP domain methods, key codes, and device presets, see `references/cdp-protocol.md`.

## Argument Dispatch

When user provides arguments to `/cdp-attach`:
- Single word matching a subcommand → run directly (e.g., `/cdp-attach list`)
- Free-form request → map to appropriate v1/v2/v3 command sequence
