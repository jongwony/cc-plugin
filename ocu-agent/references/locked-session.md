# Working a locked or dark Mac

Read by the session that is about to read or drive a window — an ocu call, a raw Accessibility read, an app plugin's AX helper, or a delegation to `ocu-operator` — when `ocu locked-use status --json` reads `session.state` locked, and after such an act failed. `ocu-operator` has no shell and cannot read this file: every step here is the delegating session's.

## The two states

- `caffeinate -u` turns the display on. The lock opens through an ocu call under Locked Use. Read the lock again after that call and before an act through another reader.
- Lock readers: `ocu locked-use status --json` (`session.state`), answered through ocu's shared app agent and so silent while that agent is stuck, or `CGSSessionScreenIsLocked` in `ioreg -n Root -d1`, a key present only while locked. `IOConsoleLocked` reads `No` on a locked Mac.

## Before the act

- Locked, `available` true → start `caffeinate -u -t <seconds>` detached, sized to the run and 120 at least, unless `pgrep -f 'caffeinate -u'` finds one (only a `-u` caffeinate keeps the display on); wait 2 s; then make the ocu call or the delegation. The first call is a read-only `ocu js --timeout <ms>`: an MCP tool call that stalls is aborted only at the harness's 1800 s idle limit.
- Locked, `available` false → make no such act; report the cause. Enabling Locked Use (`ocu locked-use enable`) is the user's act.
- An act through a reader other than ocu follows one ocu call that has opened the session; a read-only call serves.

## What the lock closes

- Window content, to Accessibility readers other than Locked Use. A process calling `AXUIElement` directly gets each window back as the application element with only the menu bar beneath it, and a helper built on that can return stale rows.
- Once an ocu call has opened the session, raw AX and the helpers read normally.

## Failures

- **"Locked Use could not observe a protected GUI session becoming unlocked"** means Locked Use did not see the session open. A dark display causes it, and so does a call made in the second the display comes on: wake the display again as above and retry once.
- The same failure on the retry is the finding. Report it with the lock state, the last `Display is turned` line of `pmset -g log`, the power source and the lid state: it has also occurred with the display reported on, and on battery with the lid closed `caffeinate -u` did not light the display; on AC power with the lid closed it did.
- **`native MCP initialize timed out after 30000 ms`** on every ocu call, a trivial one included, follows an ocu call that did not return: the shared app agent (`OpenComputerUse __open-computer-use-app-agent`) still holds that request. `sample <agent pid> 3` names the frame it waits in. Once the old agent ends, the next call starts a new one that answers `initialize`; the agent serves every session's ocu on the Mac, so ending it is asked of the user first.
- A frame through `TCCDatabase.authorization` down to `__guarded_open_np` waits on opening `/Library/Application Support/com.apple.TCC/TCC.db`, and a new agent reaches the same frame on its first query: ending the agent does not clear it. Confirm it from the shell — `perl -e 'alarm 10; open(F, "<", "/Library/Application Support/com.apple.TCC/TCC.db"); print "$!\n"'` printing `Interrupted system call` after about 5 s. Report the frame and that result, and make no further ocu call until the user has acted. (open-computer-use 1.1.3, macOS 27.0.1, host.)

## After the run

- Locked Use opens the session for the run and leaves it open after the run. The Mac's own auto-lock closes it again. Add no relock step.
