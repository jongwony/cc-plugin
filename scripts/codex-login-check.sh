#!/bin/bash
# Report a missing Codex CLI login at session start.
#
# Codex keeps its login in $CODEX_HOME/auth.json (default ~/.codex/auth.json),
# per container: a ChatGPT refresh token rotates on use, so one auth.json shared
# across containers dies after the first refresh, and each container signs in
# on its own with `codex login --device-auth`. This script only checks that a
# login is present; it runs as a user-level SessionStart hook, installed by
# scripts/cloud-setup.sh, so its line reaches the session before a codex
# command fails on the login.
#
# Silent when auth.json exists. Always exits zero — a missing login is
# reported, not fatal, so the session still starts.
#
# Usage (by hand):
#   bash scripts/codex-login-check.sh

auth="${CODEX_HOME:-$HOME/.codex}/auth.json"

[ -f "$auth" ] && exit 0

echo "Codex CLI login is absent ($auth); sign in with \`codex login --device-auth\` — the codex-plus skill's references/auth.md carries the procedure."
exit 0
