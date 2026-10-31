---
name: kakao
description: >
  Read, draft and send in one macOS KakaoTalk chat room window from this session,
  through Accessibility only, while other sessions work other rooms in parallel.
  Use when the user asks this session to talk in, watch, or send to a KakaoTalk
  chat room ("카톡 방", "카카오톡으로 보내", a chat room title).
---

# kakao

## Prerequisites

- macOS with KakaoTalk running and the room's chat window already open; this tool never opens, closes or raises a window, so a person opens it.
- `swiftc` on PATH (`xcode-select --install`); the helper builds itself on first run.
- Accessibility permission for the terminal app that runs Claude Code (System Settings → Privacy & Security → Accessibility). Screen Recording for that app is optional and only enables a cross-check (`cg_cross_check`).

## Running

- Every command is one Bash call: `"${CLAUDE_PLUGIN_ROOT}/scripts/kakao" <command> --room "<title>" [--window <id>] ...`. It prints one JSON object; `status` and the exit code say what happened.
- Run one command at a time for the room and read its JSON before the next.
- Text with newlines or quotes goes through `--text-file <path>` (or `--text-file -` with stdin) instead of `--text`.

## Binding a room

- This session works one room. `handshake --room "<exact window title>"` binds it; keep `room` and `window_id` from the JSON and pass both to every later command.
- Exit 3 (`handshake_incomplete`): `missing` names the element the helper could not settle and `candidates` lists what it saw. Look at the same window with OCU read-only tools (`get_app_state`, `query`), then rerun `handshake` with `--send-label <label>`, `--input-identifier <id>` or `--list-identifier <id>`. The hints are stored for the room.
- When the helper cannot do something, report its JSON. KakaoTalk is reached only through this helper — not keyboard input, OCU click/set_value/type_text/press_key, AppleScript or coordinates — because those act on whichever window has focus and break the other rooms.

## Sending and reading

- Default: `send --text <text>` drafts, verifies, presses the window's send button and confirms the text appeared. It waits out the room's minimum interval itself (`waited_seconds`; default 20 s, `KAKAO_MIN_INTERVAL`).
- Draft for a person to approve: `draft --text <text>`, wait for the person, then `send` without `--text`. If the person edited the draft, `send` returns exit 8; add `--accept-edited` only once the person approved the edited text. `clear` removes a draft this tool placed.
- `read` returns `messages` (oldest first) and a `marker`; pass the marker back as `--after` to get only newer rows. With `limited: true`, read again with the returned marker for the rest. `marker_found: false` means the list moved past the marker; the newest rows come back instead. `truncated: true` marks a bubble that ends in an ellipsis and may be cut.

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
| 9 | unavailable | act on `reason` (permission, app not running, toolchain) |
| 10 | room_not_unique | exactly one open window must carry the title; ask the person |
