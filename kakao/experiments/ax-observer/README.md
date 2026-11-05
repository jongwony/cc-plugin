# KakaoTalk AXObserver experiments — 2026-11-05

Historical measurement code, preserved byte-for-byte from three temporary probes.
These are standalone experiments, outside the production helper and skill. They
are not a message receiver, incremental reader, daemon, or installed service.

## What was measured

macOS host, KakaoTalk 26.9.0, Apple Swift 6.4. The probes used existing
Accessibility permission. They read AX structure/roles (and the main window's
identifier), register notifications, and log metadata; they do not fetch message
values, send input, raise windows, open chats, or change settings. JSONL contains
notification names, roles, times, registration results, structure paths/counts,
and lifecycle markers. No message text, chat titles, account names or screenshots
are included in the evidence. Raw logs are gzip-compressed; summary.json records
source and decompressed-log SHA-256 plus counts.

| Source | Registration scope | Ready → last observation (UTC) | Registrations | Callbacks |
|---|---|---|---:|---:|
| probe.swift | Application + broad descendants (646 visited) | 01:17:05 → 01:19:35 | 4,410 | 33,110 |
| narrow.swift | Application, main window, 2 scroll areas, table | 01:21:27 → 01:26:27 | 50 | 84 |
| table.swift | One main-window table | 08:18:20 → 08:21:20 | 6 | 0 |

All dates are 2026-11-05. Table durations begin after registration. Probe setup
began 01:16:47 and cleanup finished 01:19:55; the other two finished at the listed
end times. Each process exited 0. These are separate time windows with different
UI activity, not a controlled comparison of performance or power use.

- Broad: 33,109 AXValueChanged / AXImage; 1 destroyed element of unknown role.
  Images might be advertisements, avatars or other UI. Their identities were not
  captured, so attribution to ads remains a hypothesis. Multiple ancestor and
  descendant registrations can amplify callbacks; counts are not independent
  logical changes.
- Narrow: 55 destroyed/unknown; 13 created/window; 4 row-count/table; 4 selected-
  children/list; 6 value changes (2 static text, 1 text area, 3 unknown); 1 selected-
  children/menu; 1 selected-rows/table. Row/text changes clustered at 01:21:42–44.
  No confirmed incoming-message timestamp was supplied for this run.
- Table: unique table at Main Window/AXWindow[12]/AXScrollArea[0], 81 children at
  both ends. Registration returned 0 for all six candidate notifications but no
  callback arrived. This proves registration acceptance, not useful delivery.

## Later UI cross-check (not an observer event)

After the table run ended, separately authorized computer use found seven unread
messages in one existing chat. Message labels included 17:19 and 17:20 KST on
2026-11-05, within the table observation interval (17:18:20–17:21:20 KST).
The Mac timezone was verified as Asia/Seoul (+0900). Opening the chat cleared the
seven-message unread badge. No messages were sent. Contents and identities are
intentionally omitted here.

This is evidence against relying on this table-only subscription, but message
labels have minute precision and are not timestamps of arrival at this Mac.
Delayed synchronization cannot be excluded. Do not label this as confirmed
message delivery during the live observation or as a successful detector.

## Reproduce

Requirements: macOS, running logged-in KakaoTalk with its main chat-list window
already open, Swift compiler, and existing Accessibility permission for the
actual launching app/process. Permission granted to another terminal is not
necessarily inherited. These programs do not prompt to grant permission.

From this directory, compile without contacting KakaoTalk:

```sh
bash check.sh
```

For an explicitly authorized live run, compile ONE source into a temporary
folder, then run it directly from the authorized host terminal:

```sh
out=$(mktemp -d /tmp/kakao-ax-live.XXXXXX)
swiftc table.swift -o "$out/observer"
"$out/observer" > "$out/events.jsonl"
# Inspect ready/finished records and the exit status; retain the log as needed.
```

`probe` observes for 150 seconds, `narrow` for 300, and `table` for 180, after
registration. Logs are stdout; no service or background installation is created.
Normal completion removes all successful registrations and the run-loop source.
Ctrl-C terminates the process; the historical probes do not install signal
handlers or emit a finished record for interruption. The OS releases the process
resources. Verify process exit before a subsequent run.

## Known limits and next controlled test

These artifacts preserve the measured implementation, including its limits:

- No exact-message cursor, deduplication, reconnect, app restart handling, dynamic
  element replacement/rebinding, lock/sleep handling, or delivery queue.
- AX attribute failures become nil/unknown; destroy callbacks often cannot read a
  role. Registration success does not prove notification support in practice.
- The broad/narrow probes traverse a capped snapshot. Narrow does not fail when
  the main window is absent. The table probe requires a unique shallow AXTable;
  this is a heuristic, not a semantic guarantee across app versions/views.
- StaticText/TextArea descendant notifications are not guaranteed to bubble to a
  table subscription. A new message in an existing room need not change row count.
- Registration/cleanup and callback AX calls are synchronous. The observation
  interval is bounded, but there is no hard wall-clock watchdog for the complete
  process. Callback volume and per-call logging can perturb measurements.
- No CPU, energy, idle-wakeup, battery, loss-rate or latency benchmark was taken.
  No reliable new-message detection, no-loss capture or power savings are proven.

Next: register the table and a selected room's row/preview/unread nodes with
separate provenance; emit READY; have a person send one test message from another
device and record the send time; independently timestamp the Mac list change
without opening the chat; correlate callbacks. Keep an idle baseline and note
human UI activity. A UI cross-check may be occasional sampling for the test, not
proof of event-only operation. Read receipt changes belong to a separately
approved body-reading test. Stop and verify teardown after each run.

## Review and integration status

Preservation only; production CLI/skill behavior is unchanged. Local compile and
archive-integrity checks are provided. Any future production change needs its
own implementation tests and the repository's version-bump checks. No commit,
push, PR, deployment or persistent watcher is part of this experiment archive.
