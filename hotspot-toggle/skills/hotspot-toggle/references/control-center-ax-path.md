# Control Center Connect — Formal Procedure

The connect step is composed at run time from this procedure; no verbatim script is
pinned. The procedure's logic is durable across macOS updates — what drifts are the
recorded values (identifiers, container paths, offsets, delays), kept separately as
data below. Each hop locates its element by enumeration, so drift is detected at the
failing hop and corrected in place.
Provenance: the procedure is reconstructed from the original script structure and its
header notes; values verified on macOS 26.5.1 (2026-06-12).

## Why UI automation at all

`networksetup -setairportnetwork <if> "<hotspot SSID>"` fails with error -3900 while
the hotspot is off: an Instant Hotspot SSID is not broadcast until woken, so the
direct join API cannot see it. The Wi-Fi picker in Control Center is what wakes
Instant Hotspot — hence AX automation of that picker, and no non-UI alternative.

## Composition contract

- Compose a single `osascript` run executing the hops below in order, all inside
  `tell application "System Events"`: hops 1-4 additionally nested inside
  `tell process "ControlCenter"`; hop 5 at the System Events level, outside the
  process block.
- Locate every element by enumerating its container and matching `AXIdentifier` —
  never by localized title. Wrap per-element attribute reads in `try` (some elements
  lack the attribute).
- Each hop raises a named error when its target is not found, so a failure identifies
  the broken hop.
- Parameter: the hotspot SSID (env `HOTSPOT_SSID`, default `Jongwony`). It lands
  inside an AppleScript string literal — escape `"` and `\` when composing.
- After success, confirm the join with
  `bash "${CLAUDE_PLUGIN_ROOT}/scripts/hotspot-toggle.sh" wait-hotspot`.

## Hops

1. **Open Control Center** — enumerate `menu bar items of menu bar 1`, match the
   menu-extra identifier, `click` it. Settle before the next hop: the panel populates
   asynchronously, and enumerating too early returns partial trees.
2. **Find the Wi-Fi module** — enumerate the opened panel's module container, match
   the Wi-Fi module identifier. No action on the module itself.
3. **Open the Wi-Fi detail view** — the expand chevron is not a separately pressable
   AX element, so this is the procedure's one coordinate-based fallback: click near
   the module's right edge, computed from the module's AX `position`/`size`. Settle
   for list population.
4. **Press the hotspot entry** — enumerate the detail view's network list; entries
   carry per-SSID identifiers. `perform action "AXPress"` on the hotspot's entry —
   the hop that wakes Instant Hotspot, which `networksetup` cannot do. Short settle.
5. **Close the panel** — Escape, sent outside the process tell block.

## Current known values (macOS 26.5.1, verified 2026-06-12)

| Hop | Value |
|-----|-------|
| 1 | `AXIdentifier` = `com.apple.menuextra.controlcenter`; settle 1.2 s |
| 2 | `AXIdentifier` = `controlcenter-wifi` |
| 3 | click at (right edge − 20 px, vertical center); settle 1.5 s |
| 4 | `AXIdentifier` = `wifi-network-<SSID>`; settle 0.5 s |
| 5 | `key code 53` |

Containers: panel = `window 1`; modules under `group 1 of window 1`; the detail
list under `scroll area 1 of group 1 of window 1`.

## Enumeration snippets (locate / diagnose)

Menu bar items (hop 1):

```bash
osascript -e 'tell application "System Events" to tell process "ControlCenter" to get value of attribute "AXIdentifier" of every menu bar item of menu bar 1'
```

Panel modules (hop 2):

```bash
osascript -e 'tell application "System Events" to tell process "ControlCenter" to get value of attribute "AXIdentifier" of every UI element of group 1 of window 1'
```

Detail-view network list (hop 4):

```bash
osascript -e 'tell application "System Events" to tell process "ControlCenter" to get value of attribute "AXIdentifier" of every UI element of scroll area 1 of group 1 of window 1'
```

## Re-derivation after a macOS update

- Re-run the enumeration snippets at the failing hop. Identifier renames and elements
  moving one container level (`group`/`window` indices) are the usual breakage; the
  hops themselves rarely change.
- If an identifier disappears, dump every attribute of the candidate elements to find
  its successor:

  ```bash
  osascript -e 'tell application "System Events" to tell process "ControlCenter" to get properties of every UI element of group 1 of window 1'
  ```

- Re-verify the hop-3 offset — layout changes move the clickable zone.
- After re-verification, update the Current known values table (and its version
  stamp). The hop sequence and composition contract stay as they are.
