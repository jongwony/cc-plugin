#!/bin/bash
# Restore the Codex CLI login from CODEX_AUTH_JSON_B64 when no auth.json exists.
#
# Codex keeps its login in $CODEX_HOME/auth.json (default ~/.codex/auth.json).
# A cloud container has no interactive `codex login`, so the environment carries
# the file's contents base64-encoded in CODEX_AUTH_JSON_B64 and this script
# writes it back. It runs as a user-level SessionStart hook, installed by
# scripts/cloud-setup.sh, because the environment's variables reach the Claude
# Code session but not the setup script that provisions the container.
#
# Idempotent: an existing auth.json is left untouched. Always exits zero — a
# missing login is reported, not fatal, so the session still starts.
#
# Usage (by hand):
#   CODEX_AUTH_JSON_B64=... bash scripts/codex-auth-restore.sh

set -eo pipefail

codex_home="${CODEX_HOME:-$HOME/.codex}"
auth="$codex_home/auth.json"

[ -f "$auth" ] && exit 0

if [ -z "${CODEX_AUTH_JSON_B64:-}" ]; then
  echo "Codex CLI login is absent and CODEX_AUTH_JSON_B64 is not set; codex commands will fail until one of them is supplied."
  exit 0
fi

mkdir -p "$codex_home" && chmod 700 "$codex_home"
tmp="$auth.tmp.$$"
if printf '%s' "$CODEX_AUTH_JSON_B64" | base64 -d > "$tmp" 2>/dev/null \
   && python3 -c 'import json,sys; json.load(open(sys.argv[1]))' "$tmp" 2>/dev/null; then
  chmod 600 "$tmp" && mv "$tmp" "$auth"
  echo "Restored the Codex CLI login to $auth."
else
  rm -f "$tmp"
  echo "CODEX_AUTH_JSON_B64 did not decode to JSON; the Codex CLI login was not restored." >&2
fi
