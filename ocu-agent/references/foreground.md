# Foreground actions through ocu js

Read by the session that delegated to `ocu-operator`, after the agent reports `blocked: needs real input`. The agent stays background-only; this path runs in a session with a shell.

## Entry condition

Every background click method on the target element — `auto`, `accessibility`, `app_post`, `sky_click` — returned without error, and a fresh read (`query`, `get_app_state`) shows the target unchanged. Any other failure is outside this path.

## Preconditions for the run

- **The user's go-ahead for the run**, naming the app, the control and the items; a real click moves the user's cursor.
- **The user keeps off both keyboard and mouse until the run ends.** A real click makes the target window key, so typed input lands in it — a space can flip a toggle; pointer movement between the verify read and the destructive press redirects the press.
- **The target region stays unobscured.** A global click lands on whatever window is topmost at that point.

## Procedure

1. Where the state lives in a store outside the window, read it there (read-only) and fix the exact item list from it before touching the UI.
2. Write one `ocu js` script per item. Bind the app with `cua.getApp(name, { initialState: false })`, find the item with `app.query({ text, exact: true, role })`, and match the element by its identifier where the app gives one.
3. `await app.click(index, { clickMethod: "global" })`, wait a few hundred milliseconds, then read `app.getAXState({ includeScreenshot: false, maxTreeNodes: 300 })`.
4. Before a destructive press, assert from that state and `throw` on any mismatch: exactly one selected item, it is the intended one, and its own state matches the request.
5. Press the dependent control the same way (`clickMethod: "global"` on its queried index).
6. Run each script as `OPEN_COMPUTER_USE_ALLOW_GLOBAL_POINTER_FALLBACKS=1 ocu js --json --file <script.js>`; the variable enables the fallback for that call only. A thrown error ends the run with a nonzero exit, which is the check the shell reads; the value of the script's last expression does not reach stdout.
7. Confirm each item in the store before moving to the next; stop on the first item still present.
8. `window_id … is not a current window` mid-run → read the window again and rerun from the item that failed; the store says which items are done.
9. `ocu js` options are camelCase (`maxNodes`, `textLimit`, `includeScreenshot`); a snake_case key is rejected.

## Case record

One line per control confirmed to accept only real input: app · pane/control · AX shape · background methods · global click. Entries are added as cases are confirmed.

- System Settings · Privacy & Security › Full Disk Access permission list · `AXOutline` of `AXRow`/`AXCell`, the remove button (제거) below it · no background method selected a row (also raising the window, activating the app, `Tab`+`Down`; `set_value` writes `AXValue` only, `-25205` on a row), so the remove button stayed disabled · a global click on the row title selected the row (`row (selected) <name>`), and a global click on the remove button removed it with no authentication prompt; the store is the system TCC database (`sqlite3 -readonly`, `service='kTCCServiceSystemPolicyAllFiles'`, `auth_value` `0` off / `2` on).
