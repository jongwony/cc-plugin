---
name: findmy-location
description: Read where the user is right now from the macOS Find My app — their phone, or a configured fallback device — as place label, address, distance from this Mac and freshness. Use when a task needs the user's current location as context, such as nearby places, directions, local time or weather.
---

# Find My location

## Prerequisites

- macOS with the Find My app signed in to the user's Apple Account.
- Python 3, standard library only (`brew install python` if missing).
- Open Computer Use 1.1.3 or later (`npm i -g open-computer-use`), granted Accessibility (`ocu doctor`).
- Find My's interface in Korean: the reader keys on `세부사항 열기`, `지금`, `N분 전`, `일시 정지됨` and the U+00A0 `·` separator. Other languages are untested.
- The device names, set once with `claude plugin configure findmy-location@cc-plugin`: `primary_device` exactly as Find My lists it (usually the phone) and an optional `fallback_device`.

## Read

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/scripts/findmy_location.py" --primary "${user_config.primary_device}" --fallback "${user_config.fallback_device}"
```

Without the arguments the script reads `CLAUDE_PLUGIN_OPTION_PRIMARY_DEVICE` and `CLAUDE_PLUGIN_OPTION_FALLBACK_DEVICE`.

It prints one JSON line. `device` holds `name`, `place_label`, `address`, `distance` (from this Mac) and `freshness` (`지금` or `N분 전`); `read_at` is when it was read.

- `status: ok` — a fresh location from the first configured device that has one. Pass `address` (or `place_label`) on as the user's whereabouts, with its freshness.
- `status: stale_or_missing` — no configured device has a fresh location. Say so; do not reuse an earlier reading or guess from `candidates`.
- `status: unconfigured` — no device name is set; give the user the configure command.

## Side effects

- When Find My shows its locations as paused, the script brings Find My to the front for up to 15 seconds and then returns focus to the app that was in front (`activated_findmy: true`).
- When the chosen device's row shows no address, it selects that row in Find My's list to reveal it.

## Privacy

The location stays in the session. Send it to an outside service, such as a maps lookup, only when the user asks for that.
