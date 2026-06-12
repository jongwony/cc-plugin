---
name: hotspot-toggle
description: |
  This skill should be used when the user says "핫스팟", "hotspot", asks to switch to or
  from the iPhone hotspot, or wants to hand off the Mac's network before moving.
  Toggles the Mac's Wi-Fi between the iPhone Personal Hotspot and known networks.
---

# Hotspot Toggle

The helper script provides the deterministic legs; the Control Center connect step is
instruction-driven (this file + `references/control-center-ax-path.md`).

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/hotspot-toggle.sh" <mode>   # status|preflight|wait-hotspot|wifi
```

## Workflow

1. **Determine the leg** from the user's wording and current state:
   run `status` → `hotspot (…)` | `wifi (…)` | `none`. A toggle request flips the
   current state; an explicit request forces that leg.
2. **Return to known networks** (wifi leg): run `wifi` and report its outcome.
3. **Join the iPhone hotspot** (hotspot leg):
   a. Run `preflight`. Exit 2 means Accessibility permission is missing — relay the
      script's guidance and stop.
   b. Perform the Control Center connect: compose an osascript from the formal
      procedure in `references/control-center-ax-path.md` (hops + current known
      values), substituting the hotspot SSID (env `HOTSPOT_SSID`, default `Jongwony`;
      escape `"` and `\`), and run it. If a hop fails, the macOS UI likely changed
      after an update — re-derive that hop per the same document and update its
      known-values table.
   c. Run `wait-hotspot` to confirm the join within 25s.

## Notes

- State detection is gateway-based (env `HOTSPOT_GATEWAYS`, default covers iPhone
  hotspot NAT addresses `192.0.0.1` / `172.20.10.x`) because SSID reads are
  location-permission-gated on this macOS. Override the patterns for e.g. Android
  hotspots.
- `WIFI_IF` is auto-detected from the hardware port list; override via env only if
  detection fails.
- If `wifi` mode ends back on the hotspot, the script prints a NOTE and exits 0. On
  this machine that is intentional (the hotspot does not auto-rejoin, so it was
  connected manually); on a machine where the hotspot auto-joins, the same outcome can
  also mean an automatic rejoin.
- The network blips for a few seconds during either leg; warn the user when they are
  conversing over this machine's connection (e.g., Telegram bridge).

## Portability preconditions (not satisfied by installing the plugin)

- Accessibility permission must be granted to the process chain running osascript
  (System Settings > Privacy & Security > Accessibility) — `preflight` checks this.
- The connect procedure's recorded values are pinned to a verified macOS version;
  after an update breaks a hop, re-derivation per
  `references/control-center-ax-path.md` is the recovery path.
