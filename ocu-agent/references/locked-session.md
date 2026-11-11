# Working a locked or dark Mac

Read by the session that is about to read or drive a window — an ocu call, a raw Accessibility read, an app plugin's AX helper, or a delegation to `ocu-operator` — when `ocu locked-use status --json` reads `session.state` locked, and after such an act failed. `ocu-operator` has no shell and cannot read this file: every step here is the delegating session's.

## The two states

- `caffeinate -u` turns the display on. The lock opens through an ocu call under Locked Use. Read the lock again after that call and before an act through another reader.
- Lock readers: `ocu locked-use status --json` (`session.state`), or `CGSSessionScreenIsLocked` in `ioreg -n Root -d1`, a key present only while locked. `IOConsoleLocked` reads `No` on a locked Mac.

## Before the act

- Locked, `available` true → start `caffeinate -u -t <seconds>` detached, sized to the run and 120 at least, unless `pgrep -f 'caffeinate -u'` finds one (only a `-u` caffeinate keeps the display on); wait 2 s; then make the ocu call or the delegation.
- Locked, `available` false → make no such act; report the cause. Enabling Locked Use (`ocu locked-use enable`) is the user's act.
- An act through a reader other than ocu follows one ocu call that has opened the session; a read-only call serves.

## What the lock closes

- Window content, to Accessibility readers other than Locked Use. A process calling `AXUIElement` directly gets each window back as the application element with only the menu bar beneath it, and a helper built on that can return stale rows.
- Once an ocu call has opened the session, raw AX and the helpers read normally.

## Failures

- **"Locked Use could not observe a protected GUI session becoming unlocked"** means Locked Use did not see the session open. A dark display causes it, and so does a call made in the second the display comes on: wake the display again as above and retry once.
- The same failure on the retry is the finding. Report it with the lock state, the last `Display is turned` line of `pmset -g log`, the power source and the lid state: it has also occurred with the display reported on, and on battery with the lid closed `caffeinate -u` did not light the display.

## After the run

- Locked Use opens the session for the run and leaves it open after the run. The Mac's own auto-lock closes it again. Add no relock step.
