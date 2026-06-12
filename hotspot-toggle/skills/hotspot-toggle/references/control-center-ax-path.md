# Control Center AX Path — Discovery Procedure

How the automation path in `scripts/hotspot-toggle.sh` was derived, recorded so the
path can be re-derived when a macOS update changes the Control Center UI.
Provenance: reconstructed from the script structure and its header notes; the path
itself is verified on macOS 26.5.1 (2026-06-12).

## Why UI automation at all

`networksetup -setairportnetwork <if> "<hotspot SSID>"` fails with error -3900 while
the hotspot is off: an Instant Hotspot SSID is not broadcast until woken, so the
direct join API cannot see it. The Wi-Fi picker in Control Center is what wakes
Instant Hotspot — hence AX automation of that picker, and no non-UI alternative.

## Discovery heuristic

At each hop, enumerate the AX tree with System Events and select elements by stable
`AXIdentifier` — never by localized title (breaks across UI languages). Fall back to
a coordinate click only where no pressable AX element exists.

1. **Control Center menu bar item** — enumerate identifiers, match the stable one:

   ```bash
   osascript -e 'tell application "System Events" to tell process "ControlCenter" to get value of attribute "AXIdentifier" of every menu bar item of menu bar 1'
   ```

   → `com.apple.menuextra.controlcenter`. Click it to open the panel.

2. **Wi-Fi module in the opened panel** — enumerate the panel's elements:

   ```bash
   osascript -e 'tell application "System Events" to tell process "ControlCenter" to get value of attribute "AXIdentifier" of every UI element of group 1 of window 1'
   ```

   → `controlcenter-wifi`.

3. **Opening the Wi-Fi detail view** — the chevron that expands the module is not a
   separately pressable AX element, so this is the one coordinate-based fallback:
   click near the module's right edge (right edge − 20px, vertical center), computed
   from the module's AX `position`/`size`.

4. **Network entries in the detail list** — enumerate the scroll area:

   ```bash
   osascript -e 'tell application "System Events" to tell process "ControlCenter" to get value of attribute "AXIdentifier" of every UI element of scroll area 1 of group 1 of window 1'
   ```

   → entries are `wifi-network-<SSID>`. `AXPress` on the hotspot's entry wakes
   Instant Hotspot and joins it — this is the hop that `networksetup` cannot do.

5. **Close the panel** — `key code 53` (Escape).

Delays between hops (1.2s after opening the panel, 1.5s after opening the detail
view) are empirical: the panel populates asynchronously and enumeration before it
settles returns partial trees.

## Re-derivation checklist after a macOS update

- Re-run the enumeration snippets at each hop. Identifiers renaming or elements
  moving one container level (`group`/`window` indices) are the usual breakage.
- Keep matching by `AXIdentifier`; if an identifier disappears, dump every attribute
  of the candidate elements to find its successor:

  ```bash
  osascript -e 'tell application "System Events" to tell process "ControlCenter" to get properties of every UI element of group 1 of window 1'
  ```

- Re-verify the chevron offset (hop 3) — layout changes move the clickable zone.
- Update the verified-version line in the script header after re-verification.
