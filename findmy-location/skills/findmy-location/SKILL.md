---
name: findmy-location
description: Read where the user is right now from the macOS Find My app. Use when a task needs the user's current location as context.
---

# Find My location

## Prerequisites

- macOS with the Find My app signed in to the user's Apple Account.
- Python 3, standard library only (`brew install python` if missing).
- Open Computer Use 1.1.3 or later (`npm i -g open-computer-use`), granted Accessibility (`ocu doctor`); reading while the Mac is locked needs its Locked Use (`ocu locked-use enable`).
- Find My's interface in Korean; other languages are untested.
- The plugin's `primary_device` option set to the name exactly as Find My lists it, usually the phone; `fallback_device` is optional.

## Read

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/scripts/findmy_location.py" --devices-stdin <<'FINDMY_LOCATION_DEVICES_END'
${user_config.primary_device}
${user_config.fallback_device}
FINDMY_LOCATION_DEVICES_END
```

- `status: ok` — a fresh location (`지금` or `N분 전`) from the first configured device that has one. Use `device.address` (or `device.place_label`) as the user's whereabouts, with its freshness.
- `status: stale_or_missing` — no configured device has a fresh location. Say so; do not reuse an earlier reading or guess from `candidates`. A name in `ambiguous` matched more than one Find My row; ask the user for the device's full name.
- `status: unconfigured` — no device name is set; relay the script's `message` to the user.
- `status: error` — reading Find My failed (`message` says how, for example a missing Accessibility grant). Report it rather than retrying unchanged.

## Side effects

- When no configured device shows a fresh location, the script brings Find My to the front for up to 15 seconds and then returns focus to the app that was in front (`activated_findmy: true`). `focus_restored: false` means focus could not be returned (`focus_note` says why); tell the user Find My may still be in front.
- When the chosen device's row shows no address, it selects that row in Find My's list to reveal it.
- On a locked Mac it wakes the display so Open Computer Use's Locked Use can read Find My (`locked_session: true`); the Mac's own auto-lock closes the session again.

## Privacy

The location serves the task at hand, including a maps lookup the task needs; it is not sent anywhere else.
