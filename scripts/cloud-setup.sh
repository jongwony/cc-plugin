#!/bin/bash
# Provision a Claude Code cloud environment: both plugin marketplaces, the
# opt-in epistemic-protocols plugins, the Codex CLI with the Tavily MCP server
# registered, and a SessionStart hook that restores the Codex login from
# CODEX_AUTH_JSON_B64 at each session start.
# Idempotent: safe to re-run in a container that already has any of these.
#
# Paste this one line into the environment's "Setup script" field:
#   curl -fsSL https://raw.githubusercontent.com/jongwony/cc-plugin/main/scripts/cloud-setup.sh | bash
#
# A setup script runs as root once per environment cache, before Claude Code
# launches; it must exit zero or the session fails to start, and it should
# finish within about five minutes. Environment variables are not in its
# process env — that is why the Codex login is restored by the hook below
# rather than here — so anything that needs them belongs in the hook. The
# Tavily and Linear registrations are the exceptions that stay here: each
# reads its key from the session at call time — Codex from TAVILY_API_KEY, and
# Linear through the headersHelper below — so no value is needed now and none
# is written to disk.

set -o pipefail

RAW="https://raw.githubusercontent.com/jongwony"
CLAUDE_DIR="$HOME/.claude"
HOOK="$CLAUDE_DIR/hooks/codex-auth-restore.sh"
LINEAR_HEADERS="$CLAUDE_DIR/hooks/linear-mcp-headers.sh"

command -v claude >/dev/null 2>&1 || { echo "Error: claude CLI not found." >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "Error: python3 not found." >&2; exit 1; }

# --- Codex CLI: install alongside the plugins and join at the end.
codex_pid=""
codex_log=$(mktemp)
if ! command -v codex >/dev/null 2>&1; then
  echo "Codex CLI not found; installing in the background..."
  (
    export CODEX_NON_INTERACTIVE=true
    curl -fsSL https://chatgpt.com/codex/install.sh | sh
  ) > "$codex_log" 2>&1 &
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
  claude plugin update "$id" < /dev/null || true
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
    echo "Error: Codex CLI install failed:" >&2
    cat "$codex_log" >&2
    rm -f "$codex_log"
    exit 1
  fi
  export PATH="${CODEX_INSTALL_DIR:-$HOME/.local/bin}:$PATH"
  command -v codex >/dev/null 2>&1 || { echo "Error: Codex CLI is still not on PATH after install." >&2; exit 1; }
fi
rm -f "$codex_log"

# --- Tavily MCP for Codex: the remote server, authenticated by a bearer token
# that Codex reads from TAVILY_API_KEY when it launches the server. That is
# how the epistemic-cooperative goal-research skill reaches external search
# from inside a Codex session. `codex mcp add` overwrites an existing entry
# of the same name, so a re-run converges on this shape.
if codex mcp add tavily --url https://mcp.tavily.com/mcp/ --bearer-token-env-var TAVILY_API_KEY < /dev/null; then
  echo "Registered the Tavily MCP server for Codex; set TAVILY_API_KEY in the environment's variables to enable it."
else
  echo "Error: could not register the Tavily MCP server for Codex." >&2
fi

# --- Linear MCP for Claude Code: the remote server, authenticated by whatever
# the session supplies. `claude mcp add` has no flag for a credential read at
# call time, so the entry goes in as JSON carrying a `headersHelper` — a command
# Claude Code runs when it opens the connection. The helper emits an
# Authorization header from LINEAR_API_KEY when the session has one and an empty
# object when it does not, which is why the OAuth path survives an environment
# without a key: a static `headers` entry replaces OAuth rather than preceding
# it, so a rejected header would fail the connection instead of falling back.
# The name is `linear-personal` rather than `linear` because an environment may
# already reach Linear through an account-level connector this script does not
# control. A distinct name lets the two stand side by side and says which one
# this is, instead of shadowing a server whose account may differ.
#
# User scope is the only one that works here. A project- or local-scope entry is
# repo-resident, and a repo-resident headersHelper runs only where the workspace
# carries persisted trust — without it Claude Code reports `headersHelper not
# run` and falls back to OAuth, so the key is ignored. Project scope also waits
# on an interactive approval no setup script can give.
#
# Unlike `codex mcp add`, `claude mcp add-json` refuses a name that already
# exists instead of overwriting it, so the entry is dropped first and a re-run
# converges on the shape below rather than keeping whatever an earlier run
# left. Removing an absent name also exits non-zero — that is the ordinary
# first-run case, and it is discarded.
if curl -fsSL "$RAW/cc-plugin/main/scripts/linear-mcp-headers.sh" -o "$LINEAR_HEADERS"; then
  chmod +x "$LINEAR_HEADERS"
  linear_json=$(python3 -c 'import json,sys; print(json.dumps({"type":"http","url":"https://mcp.linear.app/mcp","headersHelper":sys.argv[1]}))' "$LINEAR_HEADERS")
  claude mcp remove linear-personal --scope user >/dev/null 2>&1 || true
  if claude mcp add-json linear-personal "$linear_json" --scope user < /dev/null; then
    echo "Registered the Linear MCP server; set LINEAR_API_KEY in the environment's variables to use it in place of OAuth."
  else
    echo "Error: could not register the Linear MCP server." >&2
  fi
else
  echo "Error: could not fetch linear-mcp-headers.sh; the Linear MCP server was not registered." >&2
fi
echo "Cloud environment ready."
