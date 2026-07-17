# Network Deep Guides

Moved out of `SKILL.md` to keep the per-invocation quick reference lean. Covers CSRF-guarded
mutating requests and the virtualized-grid / network-body fallback pattern.

## Mutating API Calls via Page Session (CSRF)

A `fetch` issued via `v1 evaluate --await` with `credentials: 'include'` may return **403 Forbidden** on mutating endpoints (PUT/POST/DELETE) even though the cookie session is valid — many sites additionally require a CSRF token header on state-changing requests. The token lives in the page DOM (common locations: `<meta name="csrf-token">`, hidden inputs — verified example: Datadog stores it in the `_current_user_json` hidden input as `csrf_token`).

```
1. v1 evaluate "..."            → Locate + extract the CSRF token from page DOM
                                  (synchronous read; no --await needed)
2. v1 evaluate --await --stdin  → Retry the fetch with the token attached as the
                                  appropriate header (e.g. X-CSRF-Token)
3. Verify the response status / side effect
```

```bash
# Example (Datadog): extract token, then retry the mutating call
$V1 evaluate "JSON.parse(document.querySelector('input[name=_current_user_json]').value).csrf_token"
$V1 evaluate --await --stdin <<'JS'
var r = await fetch('/api/v1/resource', {
  method: 'PUT',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': '<token>' },
  body: JSON.stringify({ /* payload */ })
});
return r.status;
JS
```

> **Note**: the token's DOM location and header name are site-specific — capture a successful mutating request with `v3 network_start`, locate it via `network_list --filter <api-path>`, then read its request headers from `~/.cache/cdp-attach/network-events.jsonl` (the `Network.requestWillBeSent` entries carry the JS-set request headers — `X-CSRF-Token` and the like appear there, though browser-added headers arrive only via `Network.requestWillBeSentExtraInfo`, which the collector does not record; `network_list` itself prints only method/status/type/URL). If the tab holding the session is lifecycle-frozen (fetch hangs instead of returning 403), combine this with helper-tab routing (`references/recovery.md`): read the token from the frozen tab synchronously, then issue the fetch from a fresh same-origin tab.

## Virtualized Tables / Data Grids (rows missing from DOM)

Modern grid libraries (MUI X DataGrid, AG Grid, TanStack Table, react-virtualized) unmount offscreen rows. DOM queries return only the visible window — `querySelectorAll('[role=row]')` may yield 10 rows for a 100-row dataset, and `snapshot` / `scan_interactive` / `find_element` all hit the same limit because they walk the live DOM/AX tree.

The authoritative data lives in the XHR/Fetch response that populated the grid. `network_start` captures these bodies; retrieve them directly instead of fighting virtualization:

```
1. v1 select <tab>
2. v3 network_start             → Start collector BEFORE the request fires
3. v1 navigate "..."  or  v2 click "<search button>" → Trigger data fetch
4. v3 network_list --filter <api-path> --bodies → Find requestId (✓ = body saved)
5. v3 network_body <requestId>  → Print JSON; pipe to jq / Python for extraction
```

Body capture is constrained to XHR/Fetch/EventSource responses under 5MB. Bodies fetched before `network_start` are unrecoverable — CDP's `Network.getResponseBody` only works inside the same session that received the response, and `v1 cdp_call Network.getResponseBody` opens a fresh session whose body buffer is empty for past requests.

For server-paginated grids, each pagination click triggers a new request that the collector captures automatically — iterate the UI (or increase page size) and call `network_body` per request.

When the grid was already loaded before capture began (no fresh request available), fall back to scroll-and-harvest with `v2 scroll --selector "<scroller>"` + `v1 evaluate` between scrolls. This is reducible to existing primitives; no dedicated command.
