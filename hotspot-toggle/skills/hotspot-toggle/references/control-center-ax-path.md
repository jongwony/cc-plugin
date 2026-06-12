# Control Center AX Path — Verified Script + Discovery Procedure

The Control Center connect step is instruction-driven: the skill composes and runs
the verified script below, and when a macOS update breaks it, re-derives the path
with the discovery procedure that follows. The deterministic legs (state detection,
wifi return, preflight, join polling) live in `scripts/hotspot-toggle.sh`.
Provenance: the discovery procedure is reconstructed from the original script
structure and its header notes; the path itself is verified on macOS 26.5.1
(2026-06-12).

## Verified connect script (macOS 26.5.1)

Substitute `__HOTSPOT_SSID__` with the hotspot's network name (env `HOTSPOT_SSID`,
default `Jongwony`); escape `"` and `\` if the SSID contains them, since it lands
inside an AppleScript string literal.

```bash
osascript <<'EOF'
tell application "System Events"
  tell process "ControlCenter"
    set ccItem to missing value
    repeat with i from 1 to count of menu bar items of menu bar 1
      try
        if (value of attribute "AXIdentifier" of menu bar item i of menu bar 1) is "com.apple.menuextra.controlcenter" then
          set ccItem to menu bar item i of menu bar 1
          exit repeat
        end if
      end try
    end repeat
    if ccItem is missing value then error "Control Center menu bar item not found"
    click ccItem
    delay 1.2
    set wifiModule to missing value
    repeat with el in UI elements of group 1 of window 1
      try
        if (value of attribute "AXIdentifier" of el) is "controlcenter-wifi" then
          set wifiModule to el
          exit repeat
        end if
      end try
    end repeat
    if wifiModule is missing value then error "Wi-Fi module not found in Control Center"
    set p to position of wifiModule
    set s to size of wifiModule
    click at {(item 1 of p) + (item 1 of s) - 20, (item 2 of p) + ((item 2 of s) div 2)}
    delay 1.5
    set sa to scroll area 1 of group 1 of window 1
    set target to missing value
    repeat with el in UI elements of sa
      try
        if (value of attribute "AXIdentifier" of el) is "wifi-network-__HOTSPOT_SSID__" then
          set target to el
          exit repeat
        end if
      end try
    end repeat
    if target is missing value then error "hotspot entry wifi-network-__HOTSPOT_SSID__ not visible"
    perform action "AXPress" of target
    delay 0.5
  end tell
  key code 53
end tell
EOF
```

After it succeeds, confirm the join with
`bash "${CLAUDE_PLUGIN_ROOT}/scripts/hotspot-toggle.sh" wait-hotspot`.

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
- After re-verification, update this document: the verified connect script above and
  the macOS version in its heading and the provenance note.
