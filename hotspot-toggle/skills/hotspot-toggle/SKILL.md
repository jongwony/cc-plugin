---
name: hotspot-toggle
description: |
  This skill should be used when the user says "핫스팟", "hotspot", asks to switch to or
  from the iPhone hotspot, or wants to hand off the Mac's network before moving.
  Toggles the Mac's Wi-Fi between the iPhone Personal Hotspot and known networks.
---

# Hotspot Toggle

Run the toggle script and report the result:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/hotspot-toggle.sh" <mode>
```

Pick `<mode>` from the user's wording:
- `toggle` (default) — flips based on current state
- `hotspot` — force the hotspot leg (join the iPhone Personal Hotspot)
- `wifi` — force the return to known networks

Notes:
- State detection is gateway-based (hotspot gateways: `192.0.0.1` or `172.20.10.x`)
  because SSID reads are location-permission-gated on this macOS.
- Report the script's stdout/stderr outcome to the user. Exit 2 means Accessibility
  permission is missing — relay the script's guidance.
- If `wifi` mode ends back on the hotspot, the script prints a NOTE and exits 0. On
  this machine that is intentional (the hotspot does not auto-rejoin, so it was
  connected manually); on a machine where the hotspot auto-joins, the same outcome can
  also mean an automatic rejoin.
- The network blips for a few seconds during either leg; warn the user when they are
  conversing over this machine's connection (e.g., Telegram bridge).
- Machine-specific values are environment-overridable: `HOTSPOT_SSID` (default
  `Jongwony`), `WIFI_IF` (auto-detected from the hardware port list; override only if
  detection fails), `HOTSPOT_GATEWAYS` (space-separated glob patterns; the default
  covers iPhone hotspots — override for e.g. Android hotspots).

Portability preconditions (not satisfied by installing the plugin):
- Accessibility permission must be granted to the process chain running osascript
  (System Settings > Privacy & Security > Accessibility) — exit 2 reports its absence.
- The Control Center automation path is pinned to a verified macOS version (see the
  script header). If it breaks after a macOS update, re-derive it with the recorded
  discovery procedure in `references/control-center-ax-path.md`.
