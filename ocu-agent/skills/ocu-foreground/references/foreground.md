# Foreground actions through ocu js

## Signs that a control needs real input

- The ocu action returns normally, yet a fresh read shows no change: the row carries no `(selected)` mark, the dependent button is still `(disabled)`.
- The window turns inactive after each background click (grey traffic-light buttons in the screenshot) and the selection never moves.
- `set_value` on a row fails with `AXUIElementIsAttributeSettable(AXValue) failed with -25205`: `set_value` writes `AXValue` only, and a row's selection is not its value.
- Raising the window, activating the app and moving focus with keys (`Tab`, then `Down`) can put focus on the list and still select nothing.

## Procedure

1. Read the target's state from its owning store where one exists (read-only), and fix the exact item list from it before touching the UI.
2. Ask the user for the run: the app, the items, that the real pointer will move.
3. Write one `ocu js` script per item. Bind the app with `cua.getApp(name, { initialState: false })`, find the item with `app.query({ text, exact: true, role })`, and match the element by its identifier where the app gives one.
4. `await app.click(index, { clickMethod: "global" })`, wait a few hundred milliseconds, then read `app.getAXState({ includeScreenshot: false, maxTreeNodes: 300 })`.
5. Assert from that state, and `throw` on any mismatch: exactly one selected item, it is the intended one, and its own state matches the request.
6. Press the dependent button the same way (`clickMethod: "global"` on its queried index).
7. Run with `OPEN_COMPUTER_USE_ALLOW_GLOBAL_POINTER_FALLBACKS=1 ocu js --json --file <script.js>`. A nonzero exit stops the loop. The value of the script's last expression does not reach stdout; the exit status and thrown messages are the channel.
8. Confirm each item in the store before moving to the next; stop the loop on the first item still present.

## Worked case — System Settings privacy list

Privacy & Security → Full Disk Access lists one row per granted client, each with a toggle. Removing a row takes selecting it, then the `-` (제거 / Remove) button below the list.

- Background clicks on the row, on its cell, on its title and at its coordinates (`auto`, `app_post`, `sky_click`) left the row unselected and the remove button disabled.
- A `global` click on the row's title element (`<name>_Title`) selected it: the tree then showed `row (selected) <name>`, with the toggle as `ID: <name>_Toggle, Value: off`.
- A `global` click on the remove button removed the row with no authentication prompt.
- The store is the system TCC database, readable with `sqlite3 -readonly "/Library/Application Support/com.apple.TCC/TCC.db"`: rows have `service='kTCCServiceSystemPolicyAllFiles'`, `client` is a bundle id or a binary path, and `auth_value` is `0` when off and `2` when on. Removal deletes the row. Writing the database directly is blocked while SIP is on, and `tccutil reset` takes bundle ids only, so path clients leave through the UI.
- One run removed 46 rows this way, one script per row; it stopped once on `window_id … is not a current window`, and a rerun from the database's remaining list finished it.
