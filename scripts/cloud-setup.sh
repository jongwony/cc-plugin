#!/bin/bash
# Provision a Claude Code cloud environment: both plugin marketplaces, the
# opt-in epistemic-protocols plugins, the Codex CLI with the Tavily MCP server
# registered, a SessionStart hook that reports a missing Codex login at each
# session start, and — with --figure-board — ink-figure's figure board option.
# Idempotent: safe to re-run in a container that already has any of these.
#
# Paste one of these lines into the environment's "Setup script" field:
#   curl -fsSL https://raw.githubusercontent.com/jongwony/cc-plugin/main/scripts/cloud-setup.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/jongwony/cc-plugin/main/scripts/cloud-setup.sh | bash -s -- --figure-board
# The second also turns on ink-figure's figure board (see --figure-board below).
#
# A setup script runs as root once per environment cache, before Claude Code
# launches; it must exit zero or the session fails to start, and it should
# finish within about five minutes. Environment variables are not in its
# process env, so anything that needs one reads it from the session at call
# time: Codex reads TAVILY_API_KEY, and Linear's key comes through the
# headersHelper below, so no value is needed now and none is written to disk.
# The Codex login is per container — each one signs in with
# `codex login --device-auth`, which needs a person to approve it — so nothing
# here can supply it; the hook below checks for it at each session start and
# says so when it is missing.

set -o pipefail

# --- Arguments, accepted in any position:
#   --figure-board   turn on ink-figure's figure board option (only when the
#                    option is unset; an explicit value is left alone)
# Anything else is reported and ignored; the script still exits zero.
FIGURE_BOARD=0
for arg in "$@"; do
  case "$arg" in
    --figure-board) FIGURE_BOARD=1 ;;
    *) echo "Warning: ignoring unknown argument: $arg" >&2 ;;
  esac
done

RAW="https://raw.githubusercontent.com/jongwony"
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
HOOK="$CLAUDE_DIR/hooks/codex-login-check.sh"
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

# --- User-level settings merge: merge_settings <what> <python-body> [args...]
# Loads "$CLAUDE_DIR/settings.json" ({} when absent) as `settings` and runs the
# body with `settings`, `args`, `notes`, `json` and `Skip` in scope. The body sets
# `changed = True` when it modified `settings`, appends lines to `notes` to
# print, and raises Skip("reason") to leave the file untouched. A changed
# file is written to a temp file in the same directory, given the old file's
# mode, and moved into place. Any failure is reported naming <what>; the
# caller carries on.
merge_settings() {
  local what="$1" body="$2"
  shift 2
  python3 - "$CLAUDE_DIR/settings.json" "$what" "$body" "$@" <<'PY' || echo "Error: could not update settings for $what." >&2
import json, os, stat, sys, tempfile
path, what, body, args = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4:]

class Skip(Exception):
    pass

settings = json.load(open(path)) if os.path.exists(path) else {}
scope = {"settings": settings, "args": args, "notes": [], "changed": False, "Skip": Skip, "json": json}
try:
    if not isinstance(settings, dict):
        raise Skip(f"{path} holds {type(settings).__name__}, not an object")
    exec(body, scope)
except Skip as reason:
    print(f"Skipped {what}: {reason}")
    sys.exit(0)
if scope["changed"]:
    directory = os.path.dirname(path) or "."
    os.makedirs(directory, exist_ok=True)
    if os.path.exists(path):
        mode = stat.S_IMODE(os.stat(path).st_mode)
    else:
        umask = os.umask(0)
        os.umask(umask)
        mode = 0o666 & ~umask
    fd, tmp = tempfile.mkstemp(dir=directory, prefix=".settings.", suffix=".json")
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(settings, f, indent=2)
            f.write("\n")
        os.chmod(tmp, mode)
        os.replace(tmp, path)
    except BaseException:
        os.unlink(tmp)
        raise
for note in scope["notes"]:
    print(note)
PY
}

# --- Codex login check: fetched from this repo and registered in the user-level
# settings once as a SessionStart hook; a hook entry that already points at the
# file is left alone.
HOOK_MERGE=$(cat <<'PY'
hook = args[0]
entries = settings.setdefault("hooks", {}).setdefault("SessionStart", [])
if not any(h.get("command") == hook for e in entries for h in e.get("hooks", [])):
    entries.append({"hooks": [{"type": "command", "command": hook}]})
    changed = True
    notes.append(f"Registered SessionStart hook: {hook}")
PY
)
mkdir -p "$(dirname "$HOOK")"
if curl -fsSL "$RAW/cc-plugin/main/scripts/codex-login-check.sh" -o "$HOOK"; then
  chmod +x "$HOOK"
  merge_settings "the Codex login check" "$HOOK_MERGE" "$HOOK"
else
  echo "Error: could not fetch codex-login-check.sh; the Codex login check was not installed." >&2
fi

# --- ink-figure figure board (only with --figure-board, and only while
# ink-figure@cc-plugin is enabled): sets
# pluginConfigs["ink-figure@cc-plugin"].options.figureBoard to true when the key
# is absent. An explicit value, true or false, is left as it is. A
# pluginConfigs, plugin entry or options value that is not an object is
# reported and the file is left untouched.
BOARD_MERGE=$(cat <<'PY'
def object_at(parent, key, where):
    if key not in parent:
        parent[key] = {}
    value = parent[key]
    if not isinstance(value, dict):
        raise Skip(f"{where} is {type(value).__name__}, not an object")
    return value

configs = object_at(settings, "pluginConfigs", "pluginConfigs")
entry = object_at(configs, "ink-figure@cc-plugin", 'pluginConfigs["ink-figure@cc-plugin"]')
options = object_at(entry, "options", 'pluginConfigs["ink-figure@cc-plugin"].options')
if "figureBoard" in options:
    notes.append(f"Left ink-figure figureBoard as set: {json.dumps(options['figureBoard'])}")
else:
    options["figureBoard"] = True
    changed = True
    notes.append("Registered ink-figure figureBoard option: true")
PY
)
if [ "$FIGURE_BOARD" = 1 ]; then
  board_state=$(plugin_state ink-figure@cc-plugin)
  if [ "$board_state" = "enabled" ]; then
    merge_settings "the ink-figure figure board" "$BOARD_MERGE"
  else
    echo "Skipped the ink-figure figure board: ink-figure@cc-plugin is ${board_state:-unknown}, not enabled."
  fi
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
