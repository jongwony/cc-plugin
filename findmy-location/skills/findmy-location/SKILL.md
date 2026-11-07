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
- The plugin's `primary_device` option set to the name exactly as Find My lists it, usually the phone; `fallback_device` is optional. Set them with `claude plugin configure findmy-location@cc-plugin`.

## Read

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/scripts/findmy_location.py"
```

It prints one JSON line; `rows` holds Find My's device-list rows as the app shows them.

- Take the row that starts with `${user_config.primary_device}, `; use the one starting with `${user_config.fallback_device}, ` when the primary's row shows no recent location. A row reads `<name>, [세부사항 열기,] [<place> | ]<distance from this Mac>, <place or address> · <how long ago>`. Read it as written rather than reconstructing it.
- When that location reads `일시 정지됨`, or is older than the task can use, run the script once more with `--refresh`: Find My comes to the front for 10 seconds so its locations update, then focus returns to the app that was in front (`focus_restored: false` means it did not; tell the user Find My may still be in front).
- Report the place, the distance and how long ago it was seen. When no row gives a recent location, say so; do not reuse an earlier reading.
- `status: error` — reading Find My failed; `message` says how. Report it rather than retrying unchanged.
- On a locked Mac the script wakes the display so Open Computer Use's Locked Use can read Find My (`locked_session: true`); the Mac's own auto-lock closes the session again.

## Privacy

The location serves the task at hand, including a maps lookup the task needs; it is not sent anywhere else.
