---
name: findmy-location
description: Read where the user is right now from the macOS Find My app. Use when a task needs the user's current location as context.
---

# Find My location

## Prerequisites

- macOS with the Find My app signed in to the user's Apple Account.
- Python 3, standard library only (`brew install python` if missing).
- Open Computer Use 1.1.3 or later (`npm i -g open-computer-use`), granted Accessibility (`ocu doctor`).
- Find My's interface in Korean; other languages are untested.
- The device names, saved once. `primary_device` is the name exactly as Find My lists it, usually the phone; `fallback_device` is optional. In the JSON, a `"` or `\` in a name is escaped as `\"` or `\\`:

  ```bash
  claude plugin configure findmy-location@cc-plugin --values-stdin <<'EOF'
  {"primary_device": "<name>", "fallback_device": "<name>"}
  EOF
  ```

## Read

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/scripts/findmy_location.py" --devices-stdin <<'EOF'
${user_config.primary_device}
${user_config.fallback_device}
EOF
```

It prints one JSON line; `device` holds the location and its `freshness`, `read_at` when it was read.

- `status: ok` — a fresh location (`지금` or `N분 전`) from the first configured device that has one. Use `device.address` (or `device.place_label`) as the user's whereabouts, with its freshness.
- `status: stale_or_missing` — no configured device has a fresh location. Say so; do not reuse an earlier reading or guess from `candidates`.
- `status: unconfigured` — no device name is set; give the user the configure command from `message`.
- `status: error` — reading Find My failed (`message` says how, for example a missing Accessibility grant). Report it rather than retrying unchanged.

## Side effects

- When Find My shows its locations as paused, the script brings Find My to the front for up to 15 seconds and then returns focus to the app that was in front (`activated_findmy: true`). `focus_restored: false` means focus could not be returned (`focus_note` says why); tell the user Find My may still be in front.
- When the chosen device's row shows no address, it selects that row in Find My's list to reveal it.

## Privacy

The location serves the task at hand, including a maps lookup the task needs; it is not sent anywhere else.
