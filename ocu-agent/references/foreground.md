# Resolving `blocked: needs real input`

Read by the session that delegated to `ocu-operator`, after the agent's report carries `blocked: needs real input`. The agent stays background-only. This session works the block out with the user, turn by turn, and does not run the foreground path on its own.

## Entry

The blocked report: the change the click should have produced (an AX attribute and its expected value), each element tried, each method, and the values read after it.

## Turns with the user

Each turn presents to the user:

- what was tried and what was observed, from the report and from any turn since;
- the case-record line below whose app and control match, if one does;
- one next hypothesis to test, with the read that would settle it — another element of the same control, a read taken after the UI settles, an unlock or other precondition, or real input.

The user's hint or decision sets the next turn. A hypothesis other than real input is tested in the background (directly or by delegating again) and its observation opens the next turn.

## Real input

Run only after the user's go-ahead for it in a turn that states these preconditions:

- **The user keeps off both keyboard and mouse until the run ends.** A real click makes the target window key, so any typed input lands in it and can change the control under focus; pointer movement between the verify read and the destructive press redirects the press.
- **The target region stays unobscured.** A global click lands on whatever window is topmost at that point.

Procedure:

1. Where the state lives in a store outside the window, read it there (read-only) and fix the exact item list from it before touching the UI.
2. Write one `ocu js` script per item. Bind the app with `cua.getApp(name, { initialState: false })`, find the item with `app.query({ text, exact: true, role })`, and match the element by its identifier where the app gives one.
3. `await app.click(index, { clickMethod: "global" })`, then read `app.getAXState({ includeScreenshot: false })` once the UI has settled.
4. Before a destructive press, assert from that state and `throw` on any mismatch: exactly one selected item, it is the intended one, and its own state matches the request.
5. Press the dependent control the same way (`clickMethod: "global"` on its queried index).
6. Run each script as `OPEN_COMPUTER_USE_ALLOW_GLOBAL_POINTER_FALLBACKS=1 ocu js --json --file <script.js>`; the variable enables the fallback for that call only. A thrown error ends the run with a nonzero exit, which is the check the shell reads; the value of the script's last expression does not reach stdout.
7. Confirm each item in the store before moving to the next; stop on the first item still present.
8. `window_id … is not a current window` mid-run → read the window again and rerun from the item that failed; the store says which items are done.
9. `ocu js` option keys are camelCase; a snake_case key is rejected.

- **An authentication prompt during the run** stops it and hands the prompt to the user.
- **A locked session (Locked Use) is outside this path**; real input on a locked Mac has not been tested.

After the block is resolved, add the control's line to the case record.

## Case record

One line per control confirmed to accept only real input: app · control · AX shape · what background methods did · what real input did. Entries are added as cases are confirmed.

- System Settings · Privacy & Security permission list (Full Disk Access) and its remove button · `AXOutline` of `AXRow`/`AXCell` · no background method selected a row, so the remove button stayed disabled · a global click selected the row, and a global click on the remove button removed it with no authentication prompt.
