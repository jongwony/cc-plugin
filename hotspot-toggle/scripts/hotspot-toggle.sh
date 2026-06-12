#!/bin/bash
# hotspot-toggle.sh — toggle Mac Wi-Fi between iPhone Personal Hotspot and known networks.
# Wake path verified on macOS 26.5.1 (2026-06-12): Control Center > Wi-Fi detail >
# wifi-network-<SSID> AXPress wakes Instant Hotspot; direct `networksetup -setairportnetwork`
# fails (-3900) because the hotspot SSID is not broadcast while off.
# Requires Accessibility permission for the process chain running osascript (granted to tmux).
# Usage: hotspot-toggle.sh [toggle|hotspot|wifi]   (default: toggle)
set -u

HOTSPOT_SSID="Jongwony"
WIFI_IF="en0"

gateway() { route -n get default 2>/dev/null | awk '/gateway/{print $2}'; }

on_hotspot() {
  case "$(gateway)" in
    192.0.0.1|172.20.10.*) return 0 ;;
    *) return 1 ;;
  esac
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
  networksetup -setairportpower "$WIFI_IF" off
  sleep 2
  networksetup -setairportpower "$WIFI_IF" on
  local t=0
  while [ $t -lt 25 ]; do
    if [ -n "$(gateway)" ]; then
      if on_hotspot; then
        echo "NOTE: rejoined the hotspot — it may be the only known network in range (gateway $(gateway))."
      else
        echo "OK: rejoined known network (gateway $(gateway), ip $(ipconfig getifaddr "$WIFI_IF" 2>/dev/null))."
      fi
      return 0
    fi
    sleep 1; t=$((t+1))
  done
  echo "FAIL: no network joined within 25s." >&2
  return 1
}

if ! ax_preflight; then
  echo "FAIL: Accessibility permission missing for this process chain (System Settings > Privacy & Security > Accessibility)." >&2
  exit 2
fi

MODE="${1:-toggle}"
case "$MODE" in
  hotspot) leg_hotspot ;;
  wifi)    leg_wifi ;;
  toggle)  if on_hotspot; then leg_wifi; else leg_hotspot; fi ;;
  *) echo "Usage: $0 [toggle|hotspot|wifi]" >&2; exit 64 ;;
esac
