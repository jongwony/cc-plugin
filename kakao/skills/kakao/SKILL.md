---
name: kakao
description: >
  Open, read, draft, send and screenshot one macOS KakaoTalk chat room window from
  this session in the background, while other sessions work other rooms in parallel.
  Use when the user asks this session to talk in, watch, or send to a KakaoTalk
  chat room ("카톡 방", "카카오톡으로 보내", a chat room title).
---

# kakao

## Prerequisites

- macOS with KakaoTalk running and its main window open (it holds the chat list a closed room is opened from).
- `swiftc` on PATH (`xcode-select --install`); the helper builds itself on first run.
- Accessibility permission for the terminal app that runs Claude Code (System Settings → Privacy & Security → Accessibility). Screen Recording for that app enables `shot` and the title cross-check (`cg_cross_check`).

## Running

- Every command is one Bash call: `"${CLAUDE_PLUGIN_ROOT}/scripts/kakao" <command> --room "<title>" [--window <id>] ...`. It prints one JSON object; `status` and the exit code say what happened.
- Run one command at a time for the room and read its JSON before the next.
- Text with newlines or quotes goes through `--text-file <path>` (or `--text-file -` with stdin) instead of `--text`.

## Which path reaches KakaoTalk

- The helper (Swift AX on one window) is the path wherever it reaches; OCU covers only the steps the helper cannot do.
- This app's boundary — helper: find the room's row in the chat list and scroll it into view (`locate`), bind, read, draft, send, clear, capture (`shot`). OCU: naming and double-clicking that row to open a closed room, waking a dark display, and read-only looks when a handshake is incomplete.
- OCU input on a chat window — click, set_value, type_text, press_key — is outside the boundary, as are keyboard events, AppleScript and raising a window: they act on whichever window has focus and break the other rooms.

## Opening a room

- `locate --room "<exact title>"` returns `already_open` with `window_id` when the room's window is open; go to Binding a room.
- `status: "located"`: the row is in view and this session holds the app-wide open lease until its handshake (`lease_seconds`). Next, with no other step between them:
  1. OCU `query` on `com.kakao.KakaoTalkMac` with the returned `query` fields (`window_id` = the main window, `text` = the room, `exact: true`). Go on only when it returns exactly one match with role `AXStaticText`; otherwise stop and run `locate` again.
  2. OCU `click` on that app with `element_index` = that match's `index`, `click_method: "sky_click"`, `click_count: 2`. It acts on that element of the main window, not on a coordinate or on whichever window is key, and opens the room without raising KakaoTalk or taking focus.
  3. `handshake --room` the same title; its exact-title check confirms the room that opened. An exit 10 there with no window carrying the title means nothing opened: run `locate` again.
- `open_busy` (exit 5): another session is opening a room; retry after `retry_after_seconds`.

## Binding a room

- This session works one room. `handshake --room "<exact window title>"` binds it; keep `room` and `window_id` from the JSON and pass both to every later command.
- Exit 3 (`handshake_incomplete`): `missing` names the element the helper could not settle and `candidates` lists what it saw. Look at the same window with OCU read-only tools (`get_app_state`, `query`), then rerun `handshake` with `--send-label <label>`, `--input-identifier <id>` or `--list-identifier <id>`. The hints are stored for the room.
- Exit 9 `screen_locked`: with OCU Locked Use enabled, one OCU `get_app_state` call on KakaoTalk wakes the display; then retry the command once. If it is still locked, wait for a person to unlock the Mac.
- When the helper cannot do something, report its JSON.

## Sending and reading

- Default: `send --text <text>` drafts, verifies, presses the window's send button and confirms the text appeared. It waits out the room's minimum interval itself (`waited_seconds`; default 20 s, `KAKAO_MIN_INTERVAL`). `status: "sent"` decides; `press_reported: false` beside it only means the app answered the press with an error.
- Draft for a person to approve: `draft --text <text>`, wait for the person, then `send` without `--text`. If the person edited the draft, `send` returns exit 8; add `--accept-edited` only once the person approved the edited text. `clear` removes a draft this tool placed.
- `read` returns `messages` (oldest first; `text` is the message, `labels` the counters, times and names beside it) and a `marker`; pass the marker back as `--after` to get only newer rows.
- `read` sees only the rows the window has loaded, around what is on screen; the tool never scrolls, so history beyond them is out of reach. Read often enough that new rows arrive before older ones leave.
- `more: "newer"`: read again with the returned marker for the rest. `more: "older"`: loaded rows beyond `--limit` were left out; raise `--limit`. `marker_found: false`: the marker's rows left the loaded rows, so rows in between may have been missed and the rows loaded now come back instead; with `list_jumped: true` those rows are older than the marker, not new. `marker_ambiguous: true`: some returned rows may repeat earlier ones. `truncated: true`: the bubble ends in "…" and is cut; its full text is not reachable through this tool.

## Showing the result

- `shot --room <title> --window <id> [--out <path.png>]` writes a PNG of the room window without raising it (also while covered or minimized) and returns `path`; give the person that path after a draft, a send or a reply so they can check the window themselves.

## Exit codes

| Exit | Status | Next |
| -- | -- | -- |
| 0 | ok, drafted, sent, cleared, located, already_open, captured | continue |
| 2 | usage, out_exists | fix the arguments; for out_exists give a new `--out` path |
| 3 | handshake_incomplete | OCU read-only look, rerun handshake with hints |
| 4 | handshake_again | rerun handshake; use the new `window_id`; `reason` says why |
| 5 | input_busy, person_active, input_changed, not_own_text, open_busy | leave the input as is; retry after a few seconds (open_busy: after `retry_after_seconds`); ask the person if it persists |
| 6 | draft_mismatch, send_button_disabled, clear_failed | nothing was sent; for draft_mismatch the box may hold text, so ask the person |
| 7 | send_unconfirmed | do not send again; `read` and look for the text before any next step |
| 8 | draft_changed, no_draft | the input is not this tool's draft; see draft-for-approval above |
| 9 | unavailable, screen_locked, main_window_missing, main_window_minimized, main_window_offscreen, chat_tab_not_showing, chat_list_missing, row_not_visible, screen_recording_missing, capture_dir_failed, capture_failed | act on `reason`; the main-window statuses and screen_recording_missing need the person; for screen_locked see Binding a room |
| 10 | room_not_unique | exactly one open window, or one chat-list row for `locate`, must carry the title; ask the person |
