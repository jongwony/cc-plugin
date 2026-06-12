#!/bin/bash
# hotspot-toggle.sh — toggle Mac Wi-Fi between iPhone Personal Hotspot and known networks.
# Wake path verified on macOS 26.5.1 (2026-06-12): Control Center > Wi-Fi detail >
# wifi-network-<SSID> AXPress wakes Instant Hotspot; direct `networksetup -setairportnetwork`
# fails (-3900) because the hotspot SSID is not broadcast while off.
# Requires Accessibility permission for the process chain running osascript (granted to tmux).
# Usage: hotspot-toggle.sh [toggle|hotspot|wifi]   (default: toggle)
# Env:   HOTSPOT_SSID      hotspot network name (default: Jongwony)
#        WIFI_IF           Wi-Fi interface (default: auto-detected from hardware ports)
#        HOTSPOT_GATEWAYS  space-separated glob patterns matching the hotspot's gateway
#                          (default covers Apple's standard iPhone hotspot NAT addresses;
#                          override for e.g. Android hotspots)
# -f: HOTSPOT_GATEWAYS holds glob patterns that must not expand against the filesystem.
set -uf

HOTSPOT_SSID="${HOTSPOT_SSID:-Jongwony}"
WIFI_IF="${WIFI_IF:-$(networksetup -listallhardwareports 2>/dev/null | awk '/^Hardware Port: (Wi-Fi|AirPort)/{getline; print $2; exit}')}"
: "${WIFI_IF:=en0}"
HOTSPOT_GATEWAYS="${HOTSPOT_GATEWAYS:-192.0.0.1 172.20.10.*}"

# HOTSPOT_SSID is interpolated into the AppleScript heredoc below; these characters
# would break or alter the generated script.
case "$HOTSPOT_SSID" in
  *'"'* | *'\'* | *'$'* | *'`'*)
    echo "FAIL: HOTSPOT_SSID contains characters unsafe for script interpolation (\" \\ \$ \`)." >&2
    exit 64 ;;
esac

gateway() { route -n get default 2>/dev/null | awk '/gateway/{print $2}'; }

on_hotspot() {
  local gw pat
  gw="$(gateway)"
  [ -n "$gw" ] || return 1
  for pat in $HOTSPOT_GATEWAYS; do
    case "$gw" in
      $pat) return 0 ;;
    esac
  done
  return 1
}

ax_preflight() {
  osascript -e 'tell application "System Events" to count menu bar items of menu bar 1 of process "ControlCenter"' >/dev/null 2>&1
}

connect_hotspot() {
  osascript <<EOF
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
        if (value of attribute "AXIdentifier" of el) is "wifi-network-${HOTSPOT_SSID}" then
          set target to el
          exit repeat
        end if
      end try
    end repeat
    if target is missing value then error "hotspot entry wifi-network-${HOTSPOT_SSID} not visible"
    perform action "AXPress" of target
    delay 0.5
  end tell
  key code 53
end tell
EOF
}

leg_hotspot() {
  if on_hotspot; then
    echo "Already on hotspot (gateway $(gateway))."
    return 0
  fi
  if ! ax_preflight; then
    echo "FAIL: Accessibility permission missing for this process chain (System Settings > Privacy & Security > Accessibility)." >&2
    exit 2
  fi
  echo "Connecting to hotspot ${HOTSPOT_SSID} via Control Center..."
  if ! connect_hotspot; then
    echo "FAIL: Control Center automation failed (UI structure may have changed after a macOS update)." >&2
    return 1
  fi
  local t=0
  while [ $t -lt 25 ]; do
    on_hotspot && { echo "OK: connected to hotspot (gateway $(gateway))."; return 0; }
    sleep 1; t=$((t+1))
  done
  echo "FAIL: hotspot not joined within 25s (is the iPhone nearby with Bluetooth on?)." >&2
  return 1
}

leg_wifi() {
  echo "Power-cycling Wi-Fi to rejoin the strongest known network..."
  if ! networksetup -setairportpower "$WIFI_IF" off; then
    echo "FAIL: could not power off Wi-Fi interface ${WIFI_IF} (is WIFI_IF correct?)." >&2
    return 1
  fi
  sleep 2
  if ! networksetup -setairportpower "$WIFI_IF" on; then
    echo "FAIL: could not power on Wi-Fi interface ${WIFI_IF}." >&2
    return 1
  fi
  local t=0 ip
  while [ $t -lt 25 ]; do
    ip="$(ipconfig getifaddr "$WIFI_IF" 2>/dev/null)"
    if [ -n "$ip" ]; then
      if on_hotspot; then
        echo "NOTE: back on the hotspot — the hotspot does not auto-rejoin here, so this reflects a manual connect (gateway $(gateway))."
      else
        echo "OK: rejoined known network (gateway $(gateway), ip $ip)."
      fi
      return 0
    fi
    sleep 1; t=$((t+1))
  done
  echo "FAIL: no network joined within 25s." >&2
  return 1
}

MODE="${1:-toggle}"
case "$MODE" in
  hotspot) leg_hotspot ;;
  wifi)    leg_wifi ;;
  toggle)  if on_hotspot; then leg_wifi; else leg_hotspot; fi ;;
  *) echo "Usage: $0 [toggle|hotspot|wifi]" >&2; exit 64 ;;
esac
