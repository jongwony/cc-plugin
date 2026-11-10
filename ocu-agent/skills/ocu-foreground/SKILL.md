---
name: ocu-foreground
description: Use when an ocu action in a macOS app window reports success but its effect does not land — a row that stays unselected, a button that stays disabled after the control it depends on was clicked — after the background click methods have been tried on the element. Drives that control with a real-pointer click through `ocu js` from the main session's shell, with the user's go-ahead.
---

# ocu foreground

The `ocu-operator` agent works in the background and has no shell; this path runs in the main session, which has one. `references/foreground.md` carries the full procedure and a worked case.

- **A background action did not land.** The action returned without error but a fresh read (`query`, `get_app_state`) shows the target unchanged after `auto`, `accessibility`, `app_post` and `sky_click` on the element → treat the control as one that accepts only real input; continue below rather than repeating background variants.
- **A real-pointer click moves the user's cursor.** Before the first one, ask the user for the run, naming the app and what will be clicked; while it runs the user keeps off the mouse.
- **Run it through `ocu js` with the fallback enabled for that call only**: `OPEN_COMPUTER_USE_ALLOW_GLOBAL_POINTER_FALLBACKS=1 ocu js --file <script.js>`, the script calling `app.click(index, { clickMethod: "global" })` on an index from `app.query` in the same run. The MCP server's own environment is left as it is.
- **Before a destructive press, assert the state it acts on** in the same script: read `app.getAXState({ includeScreenshot: false })` and `throw` unless exactly the intended item is selected and its own state matches the request. A thrown error ends the run with a nonzero exit, which is the check the shell reads.
- **After each act, confirm it in the system that holds the state** — the store the UI edits, read-only — not only in the window.
- **`window_id … is not a current window`** mid-run → read the window again and rerun from the item that failed; the store says which items are already done.
- **`ocu js` options are camelCase** (`maxNodes`, `textLimit`, `includeScreenshot`); a snake_case key is rejected.
