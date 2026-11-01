---
name: kakao-ad
description: >
  The kakao plugin's room commands run through a fixed subset of the agent-desktop
  CLI instead of its own Swift AX layer, for comparing the two. Use only when the
  user names kakao-ad or asks to compare it with the kakao plugin; for ordinary
  KakaoTalk room work use kakao.
---

# kakao-ad

## Prerequisites

- macOS with KakaoTalk running and the room's chat window already open; this tool never opens, closes or raises a window, so a person opens it.
- `swiftc` on PATH (`xcode-select --install`); the helper builds itself on first run.
- agent-desktop on PATH (`npm i -g agent-desktop`), or its path in `AGENT_DESKTOP_BIN`.
- Accessibility permission for the app that runs Claude Code, as `agent-desktop permissions` reports it; `agent-desktop permissions --guide` opens the settings page. Screen Recording for that app is optional and only enables a cross-check (`cg_cross_check`).

## Running

- Every command is one Bash call: `"${CLAUDE_PLUGIN_ROOT}/scripts/kakao-ad" <command> --room "<title>" [--window <id>] ...`. It prints one JSON object; `status` and the exit code say what happened.
- Run one command at a time for the room and read its JSON before the next.
- Text with newlines or quotes goes through `--text-file <path>` (or `--text-file -` with stdin) instead of `--text`.
- Comparing with the kakao plugin: `python3 "${CLAUDE_PLUGIN_ROOT}/scripts/compare.py" --room "<title>"` runs handshake, read, draft, clear and read-after on both and writes `report.md` and `report.json`. Add `--self-chat` only when the room is the person's own chat; it then sends one message per plugin, and three in total is the cap.

## Where each check lives

- The window and its elements — listing windows, the tree, the input's value, the send button's state, setting the value, pressing send — go through agent-desktop alone, with the commands `list-windows`, `snapshot`, `get`, `set-value`, `click` and the status check `permissions`. The helper refuses any other agent-desktop command or flag before it runs.
- The Swift helper keeps what agent-desktop does not report: the screen-lock state, the time since the last keyboard or pointer input, the app's version and frontmost state, the per-room lock and minimum send interval, and the CoreGraphics title cross-check.
- OCU is used where the kakao plugin uses it: one read-only `get_app_state` to wake the display on `screen_locked`, and read-only looks when a handshake is incomplete.

## Binding a room

- This session works one room. `handshake --room "<exact window title>"` binds it; keep `room` and `window_id` from the JSON and pass both to every later command.
- Exit 3 (`handshake_incomplete`): `missing` names the element the helper could not settle and `candidates` lists what it saw. Look at the same window with OCU read-only tools (`get_app_state`, `query`), then rerun `handshake` with `--send-label <label>`, `--input-identifier <id>` or `--list-identifier <id>`. The hints are stored for the room.
- Exit 9 `screen_locked`: with OCU Locked Use enabled, one OCU `get_app_state` call on KakaoTalk wakes the display; then retry the command once. If it is still locked, wait for a person to unlock the Mac.
- When the helper cannot do something, report its JSON. KakaoTalk is reached only through this helper — not keyboard input, OCU click/set_value/type_text/press_key, AppleScript or coordinates — because those act on whichever window has focus and break the other rooms.

## Sending and reading

- Default: `send --text <text>` drafts, verifies, presses the window's send button and confirms the text appeared. It waits out the room's minimum interval itself (`waited_seconds`; default 20 s, `KAKAO_MIN_INTERVAL`). `status: "sent"` decides; `press_reported: false` beside it only means the app answered the press with an error.
- Draft for a person to approve: `draft --text <text>`, wait for the person, then `send` without `--text`. If the person edited the draft, `send` returns exit 8; add `--accept-edited` only once the person approved the edited text. `clear` removes a draft this tool placed.
- `read` returns `messages` (oldest first; `text` is the message, `labels` the counters, times and names beside it) and a `marker`; pass the marker back as `--after` to get only newer rows.
- `read` sees only the rows the window has loaded, around what is on screen; the tool never scrolls, so history beyond them is out of reach. Read often enough that new rows arrive before older ones leave.
- `more: "newer"`: read again with the returned marker for the rest. `more: "older"`: loaded rows beyond `--limit` were left out; raise `--limit`. `marker_found: false`: the marker's rows left the loaded rows, so rows in between may have been missed and the rows loaded now come back instead; with `list_jumped: true` those rows are older than the marker, not new. `marker_ambiguous: true`: some returned rows may repeat earlier ones. `truncated: true`: the bubble ends in "…" and is cut; its full text is not reachable through this tool.

## Exit codes

| Exit | Status | Next |
| -- | -- | -- |
| 0 | ok, drafted, sent, cleared | continue |
| 2 | usage | fix the arguments |
| 3 | handshake_incomplete | OCU read-only look, rerun handshake with hints |
| 4 | handshake_again | rerun handshake; use the new `window_id`; `reason` says why |
| 5 | input_busy, person_active, input_changed, not_own_text | leave the input as is; retry after a few seconds; ask the person if it persists |
| 6 | draft_mismatch, send_button_disabled, clear_failed | nothing was sent; for draft_mismatch the box may hold text, so ask the person |
| 7 | send_unconfirmed | do not send again; `read` and look for the text before any next step |
| 8 | draft_changed, no_draft | the input is not this tool's draft; see draft-for-approval above |
| 9 | unavailable, screen_locked | act on `reason` (permission, app not running, toolchain); for screen_locked see Binding a room |
| 10 | room_not_unique | exactly one open window must carry the title; ask the person |
