#!/bin/bash
# hotspot-toggle.sh — deterministic legs for the hotspot-toggle skill.
# The Control Center connect step (waking Instant Hotspot) is instruction-driven:
# the skill composes and runs osascript per references/control-center-ax-path.md,
# because direct `networksetup -setairportnetwork` fails (-3900) while the hotspot
# SSID is not broadcast. This script keeps only the deterministic parts.
# Usage: hotspot-toggle.sh [status|preflight|wait-hotspot|wifi]   (default: status)
# Env:   WIFI_IF           Wi-Fi interface (default: auto-detected from hardware ports)
#        HOTSPOT_GATEWAYS  space-separated glob patterns matching the hotspot's gateway
#                          (default covers Apple's standard iPhone hotspot NAT addresses;
#                          override for e.g. Android hotspots)
# -f: HOTSPOT_GATEWAYS holds glob patterns that must not expand against the filesystem.
set -uf

WIFI_IF="${WIFI_IF:-$(networksetup -listallhardwareports 2>/dev/null | awk '/^Hardware Port: (Wi-Fi|AirPort)/{getline; print $2; exit}')}"
: "${WIFI_IF:=en0}"
HOTSPOT_GATEWAYS="${HOTSPOT_GATEWAYS:-192.0.0.1 172.20.10.*}"

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

wait_hotspot() {
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

MODE="${1:-status}"
case "$MODE" in
  status)
    if on_hotspot; then
      echo "hotspot (gateway $(gateway))"
    elif [ -n "$(gateway)" ]; then
      echo "wifi (gateway $(gateway), ip $(ipconfig getifaddr "$WIFI_IF" 2>/dev/null))"
    else
      echo "none"
    fi ;;
  preflight)
    if ax_preflight; then
      echo "OK: Accessibility permission present."
    else
      echo "FAIL: Accessibility permission missing for this process chain (System Settings > Privacy & Security > Accessibility)." >&2
      exit 2
    fi ;;
  wait-hotspot) wait_hotspot ;;
  wifi)         leg_wifi ;;
  *) echo "Usage: $0 [status|preflight|wait-hotspot|wifi]" >&2; exit 64 ;;
esac
