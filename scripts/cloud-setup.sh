#!/bin/bash
# Provision a Claude Code cloud environment: both plugin marketplaces, the
# opt-in epistemic-protocols plugins, the Codex CLI, and a SessionStart hook
# that restores the Codex login from CODEX_AUTH_JSON_B64 at each session start.
# Idempotent: safe to re-run in a container that already has any of these.
#
# Paste this one line into the environment's "Setup script" field:
#   curl -fsSL https://raw.githubusercontent.com/jongwony/cc-plugin/main/scripts/cloud-setup.sh | bash
#
# A setup script runs as root once per environment cache, before Claude Code
# launches; it must exit zero or the session fails to start, and it should
# finish within about five minutes. Environment variables are not in its
# process env — that is why the Codex login is restored by the hook below
# rather than here — so anything that needs them belongs in the hook.

set -o pipefail

RAW="https://raw.githubusercontent.com/jongwony"
CLAUDE_DIR="$HOME/.claude"
HOOK="$CLAUDE_DIR/hooks/codex-auth-restore.sh"

command -v claude >/dev/null 2>&1 || { echo "Error: claude CLI not found." >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "Error: python3 not found." >&2; exit 1; }

# --- Codex CLI: the npm download is the slowest step, so it runs alongside the
# plugin installs and is joined at the end.
codex_pid=""
codex_log=$(mktemp)
if ! command -v codex >/dev/null 2>&1; then
  command -v npm >/dev/null 2>&1 || { echo "Error: npm not found; cannot install the Codex CLI." >&2; exit 1; }
  echo "Codex CLI not found; installing @openai/codex in the background..."
  npm install -g @openai/codex > "$codex_log" 2>&1 &
  codex_pid=$!
fi

# --- Marketplaces: each installer is idempotent and leaves its opt-in plugins out.
curl -fsSL "$RAW/cc-plugin/main/scripts/install.sh" | bash || true
curl -fsSL "$RAW/epistemic-protocols/main/scripts/install.sh" | bash || true

# --- Opt-in plugins. `claude plugin enable` fails loudly on a plugin that is
# already enabled, so the enabled state is read first and enable runs only
# when it is off.
plugin_state() {  # prints enabled | disabled | absent
  claude plugin list --json 2>/dev/null | python3 -c '
import json, sys
want = sys.argv[1]
for p in json.load(sys.stdin):
    if p.get("id") == want:
        print("enabled" if p.get("enabled") else "disabled")
        break
else:
    print("absent")' "$1"
}

ensure_plugin() {
  local id="$1"
  claude plugin install "$id" < /dev/null || { echo "  Skipped: $id" >&2; return 0; }
  if [ "$(plugin_state "$id")" = "disabled" ]; then
    claude plugin enable "$id" < /dev/null || true
  fi
}

ensure_plugin epistemic-cooperative@epistemic-protocols
ensure_plugin route@epistemic-protocols

# --- Codex login hook: fetched from this repo and registered in the user-level
# settings once; a hook entry that already points at the file is left alone.
mkdir -p "$(dirname "$HOOK")"
if curl -fsSL "$RAW/cc-plugin/main/scripts/codex-auth-restore.sh" -o "$HOOK"; then
  chmod +x "$HOOK"
  python3 - "$CLAUDE_DIR/settings.json" "$HOOK" <<'PY'
import json, os, sys
path, hook = sys.argv[1], sys.argv[2]
settings = json.load(open(path)) if os.path.exists(path) else {}
entries = settings.setdefault("hooks", {}).setdefault("SessionStart", [])
if not any(h.get("command") == hook for e in entries for h in e.get("hooks", [])):
    entries.append({"hooks": [{"type": "command", "command": hook}]})
    with open(path, "w") as f:
        json.dump(settings, f, indent=2)
        f.write("\n")
    print(f"Registered SessionStart hook: {hook}")
PY
else
  echo "Error: could not fetch codex-auth-restore.sh; the Codex login hook was not installed." >&2
fi

# --- Join the Codex install.
if [ -n "$codex_pid" ]; then
  if wait "$codex_pid"; then
    echo "Installed the Codex CLI."
  else
    echo "Error: npm install -g @openai/codex failed:" >&2
    cat "$codex_log" >&2
    rm -f "$codex_log"
    exit 1
  fi
  command -v codex >/dev/null 2>&1 || { echo "Error: Codex CLI is still not on PATH after install." >&2; exit 1; }
fi
rm -f "$codex_log"
echo "Cloud environment ready."
