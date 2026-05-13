#!/usr/bin/env bash
# bootstrap.sh — start Xvfb + Chromium so cdp-attach can connect.
# Linux only. Start-only lifecycle. Idempotent: skips if CDP already up.
set -euo pipefail

PORT=9222
DISPLAY_NUM=99
CHROME=""

usage() {
  cat <<'USAGE'
bootstrap.sh — start Xvfb + Chromium so cdp-attach can connect.
Linux only. Start-only lifecycle. Idempotent: skips if CDP already up.

Usage: bootstrap.sh [--port N] [--display N] [--chrome PATH]

Options:
  --port N      CDP debug port (default: 9222)
  --display N   Xvfb display number (default: 99)
  --chrome PATH Chromium binary (default: auto-detect /opt/pw-browsers/...)
  -h, --help    Show this help
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    --display) DISPLAY_NUM="$2"; shift 2 ;;
    --chrome) CHROME="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; usage >&2; exit 2 ;;
  esac
done

VERSION_URL="http://127.0.0.1:${PORT}/json/version"

log() { printf '[cdp-bootstrap] %s\n' "$*" >&2; }
die() { printf '[cdp-bootstrap] ERROR: %s\n' "$*" >&2; exit 1; }

# --- Idempotency: existing CDP wins ---
if EXISTING=$(curl -sf "$VERSION_URL" 2>/dev/null); then
  log "CDP already up at $VERSION_URL — no-op"
  printf '%s\n' "$EXISTING" | head -3 >&2
  exit 0
fi

# --- Preflight ---
[ "$(uname -s)" = "Linux" ] || die "Linux only (uname=$(uname -s)). Use cdp-attach's native launch on macOS."
command -v Xvfb >/dev/null || die "Xvfb not found. Install: apt install xvfb"
command -v uv >/dev/null   || die "uv not found. Install: https://docs.astral.sh/uv/getting-started/installation/"
command -v curl >/dev/null || die "curl not found."

if [ -z "$CHROME" ]; then
  CHROME=$(find /opt/pw-browsers -maxdepth 4 -name chrome -type f 2>/dev/null | head -1)
fi
[ -n "$CHROME" ] && [ -x "$CHROME" ] || die "Chromium not found. Pass --chrome PATH (tried /opt/pw-browsers/...)."

mkdir -p /tmp/chrome-profile /tmp/chrome-logs

# --- Xvfb (skip if socket exists) ---
SOCK="/tmp/.X11-unix/X${DISPLAY_NUM}"
if [ -S "$SOCK" ]; then
  log "Xvfb :${DISPLAY_NUM} already running"
else
  log "Starting Xvfb :${DISPLAY_NUM}"
  Xvfb ":${DISPLAY_NUM}" -screen 0 1280x900x24 +extension RANDR \
    >/tmp/chrome-logs/xvfb.log 2>&1 &
  disown
  for _ in $(seq 1 50); do
    [ -S "$SOCK" ] && break
    sleep 0.1
  done
  [ -S "$SOCK" ] || { tail -30 /tmp/chrome-logs/xvfb.log >&2; die "Xvfb failed to come up"; }
fi

# --- Chromium ---
log "Starting Chromium ($CHROME) on display :${DISPLAY_NUM}, CDP port ${PORT}"
DISPLAY=":${DISPLAY_NUM}" "$CHROME" \
  --no-sandbox \
  --user-data-dir=/tmp/chrome-profile \
  --remote-debugging-port="${PORT}" \
  --remote-allow-origins='*' \
  --no-first-run --no-default-browser-check \
  --disable-background-networking \
  --window-size=1280,900 \
  about:blank \
  >/tmp/chrome-logs/chrome.log 2>&1 &
disown

# --- Poll /json/version with 15s deadline ---
for _ in $(seq 1 75); do
  if VERSION=$(curl -sf "$VERSION_URL" 2>/dev/null); then
    log "✓ CDP up at $VERSION_URL"
    printf '%s\n' "$VERSION" | head -3 >&2
    cat >&2 <<HINT

Next step:
  uv run --quiet --script \$CLAUDE_PLUGIN_ROOT/cdp-attach/scripts/v1_core.py select 0
  uv run --quiet --script \$CLAUDE_PLUGIN_ROOT/cdp-attach/scripts/v1_core.py doctor
HINT
    exit 0
  fi
  sleep 0.2
done

log "Chromium failed to expose CDP within 15s — last 30 lines:"
tail -30 /tmp/chrome-logs/chrome.log >&2
exit 1
