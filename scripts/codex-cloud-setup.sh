#!/bin/bash
# Provision an OpenAI Codex cloud environment with Claude Code inside it: the
# CLI, both plugin marketplaces, the opt-in epistemic-protocols plugins, the
# login, and the Tavily MCP server.
# Idempotent: safe to re-run in a container that already has any of these.
#
# Paste this one line into the environment's "Setup script" field:
#   curl -fsSL https://raw.githubusercontent.com/jongwony/cc-plugin/main/scripts/codex-cloud-setup.sh | bash
#
# This is scripts/cloud-setup.sh inverted: that one provisions a Claude Code
# cloud environment and installs Codex inside it. Three facts about the Codex
# cloud shape what follows.
#
# Internet reaches the SETUP phase only — during the agent phase it is off by
# default — so everything that touches the network finishes here, and nothing
# is deferred to first use.
#
# Environment variables are set for the whole chat, setup and agent phase
# alike, while Secrets reach the setup script only and are stripped before the
# agent phase starts. So the login is written to disk HERE rather than deferred
# to a SessionStart hook. That is the exact inversion of why
# scripts/codex-auth-restore.sh exists on the Claude cloud side, where the
# variables reach the session but not the setup script: there the hook is the
# only place that can see them, here the setup script is the only place that
# can see a Secret.
#
# The default `universal` image runs as plain root with curl and python3
# present. The CLI comes from the native installer, which downloads a platform
# binary and so carries no Node dependency at all — no version floor to meet at
# install time and no optional-dependency resolution to fail inside a
# container, the two ways the npm route breaks there. Its sudo guard fires only
# when SUDO_USER names a real user, so plain root passes.

set -o pipefail

RAW="https://raw.githubusercontent.com/jongwony"
CLAUDE_DIR="$HOME/.claude"
SETTINGS="$CLAUDE_DIR/settings.json"

command -v python3 >/dev/null 2>&1 || { echo "Error: python3 not found." >&2; exit 1; }
# The Claude Code installer takes curl or wget; this script's own fetches below
# are curl, so curl is what it requires.
command -v curl >/dev/null 2>&1 || { echo "Error: curl not found." >&2; exit 1; }

# --- Claude Code CLI. Unlike cloud-setup.sh, the install cannot run alongside
# the plugin installs: `claude plugin install` is what the installers below
# call, so the dependency runs the other way. What does overlap is the network
# fetch of the two installer scripts, which needs nothing local.
claude_log=$(mktemp)
cc_installer=$(mktemp)
ep_installer=$(mktemp)
curl -fsSL "$RAW/cc-plugin/main/scripts/install.sh" -o "$cc_installer" &
cc_pid=$!
curl -fsSL "$RAW/epistemic-protocols/main/scripts/install.sh" -o "$ep_installer" &
ep_pid=$!

if ! command -v claude >/dev/null 2>&1; then
  echo "Claude Code CLI not found; running the native installer..."
  # rc is captured off the pipeline itself — `if ! cmd` would replace the
  # installer's status with the negation, losing the 137 the OOM case turns on.
  rc=0
  { curl -fsSL https://claude.ai/install.sh | bash; } > "$claude_log" 2>&1 || rc=$?
  if [ "$rc" -ne 0 ]; then
    echo "Error: the Claude Code installer failed (exit $rc):" >&2
    cat "$claude_log" >&2
    # 137 is the kernel OOM killer; the installer needs roughly 512MB free and
    # prints nothing of its own when the signal lands.
    [ "$rc" -eq 137 ] && echo "Exit 137 is an out-of-memory kill — the installer needs about 512MB free." >&2
    rm -f "$claude_log" "$cc_installer" "$ep_installer"
    exit 1
  fi
  echo "Installed the Claude Code CLI."
fi
rm -f "$claude_log"

# --- PATH. The installer puts the binary in $HOME/.local/bin, which is not on
# the default PATH, and the agent phase is a separate process that inherits no
# `export` from here. A symlink into a directory already on PATH is what
# survives, assuming nothing about which shell init the agent phase reads.
if ! command -v claude >/dev/null 2>&1; then
  claude_bin=""
  for c in "$HOME/.local/bin/claude" "$HOME/.claude/local/claude"; do
    [ -x "$c" ] && { claude_bin="$c"; break; }
  done
  [ -n "$claude_bin" ] || { echo "Error: the installer reported success but no claude binary was found." >&2; exit 1; }

  linked=""
  for d in /usr/local/bin /usr/bin; do
    case ":$PATH:" in *":$d:"*) ;; *) continue ;; esac
    [ -d "$d" ] && [ -w "$d" ] || continue
    if ln -sf "$claude_bin" "$d/claude"; then linked="$d/claude"; break; fi
  done

  if [ -n "$linked" ]; then
    echo "Linked $claude_bin to $linked so the agent phase finds it on PATH."
  else
    # No writable PATH directory: fall back to the shell init files, which do
    # assume the agent phase reads one of them.
    for rcfile in "$HOME/.bashrc" "$HOME/.profile"; do
      # shellcheck disable=SC2016  # $HOME must stay literal, to expand when the rc is read
      grep -qsF '.local/bin' "$rcfile" || echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$rcfile"
    done
    export PATH="$HOME/.local/bin:$PATH"
    echo "No writable directory on PATH; appended \$HOME/.local/bin to ~/.bashrc and ~/.profile instead." >&2
  fi
fi
command -v claude >/dev/null 2>&1 || { echo "Error: Claude Code CLI is not on PATH after install." >&2; exit 1; }

# --- Login. CLAUDE_CODE_OAUTH_TOKEN (from `claude setup-token`) is the headless
# path; ANTHROPIC_API_KEY is the fallback. Either may be supplied as a Secret,
# which this script is the last thing to see, so it is persisted into the
# settings `env` block where the agent phase still finds it. A missing login is
# reported, not fatal — the environment still builds, and the CLI is there for
# whoever supplies one later.
# This precedes every `claude` call below: unlike cloud-setup.sh, which runs
# against an already-authenticated CLI, the one installed above has no login.
# It touches no network, so the background fetches keep overlapping the install.
mkdir -p "$CLAUDE_DIR"
auth_var=""
for v in CLAUDE_CODE_OAUTH_TOKEN ANTHROPIC_API_KEY; do
  if [ -n "${!v:-}" ]; then auth_var="$v"; break; fi
done

if [ -n "$auth_var" ]; then
  # The value is read from the environment python3 inherits, never from argv,
  # so it stays out of the process table.
  if python3 - "$SETTINGS" "$auth_var" <<'PY'
import json, os, sys
path, key = sys.argv[1], sys.argv[2]
settings = json.load(open(path)) if os.path.exists(path) else {}
settings.setdefault("env", {})[key] = os.environ[key]
with open(path, "w") as f:
    json.dump(settings, f, indent=2)
    f.write("\n")
PY
  then
    chmod 600 "$SETTINGS"
    echo "Persisted $auth_var into $SETTINGS for the agent phase."
  else
    echo "Error: could not write $SETTINGS; the login was not persisted." >&2
  fi
else
  echo "Neither CLAUDE_CODE_OAUTH_TOKEN nor ANTHROPIC_API_KEY is set; claude will have no login until one is supplied. Generate one with \`claude setup-token\` and add it to the environment's variables or secrets."
fi

# --- Marketplaces: each installer is idempotent and leaves its opt-in plugins out.
wait "$cc_pid" && bash "$cc_installer" || echo "  Skipped: cc-plugin marketplace" >&2
wait "$ep_pid" && bash "$ep_installer" || echo "  Skipped: epistemic-protocols marketplace" >&2
rm -f "$cc_installer" "$ep_installer"

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

# --- Tavily MCP: how the epistemic-cooperative goal-research skill reaches
# external search. The codex side of cloud-setup.sh keeps the key off disk with
# `--bearer-token-env-var`; `claude mcp add` has no equivalent, and ${VAR}
# expansion in MCP config is a .mcp.json feature that user scope does not
# share, so the value is resolved here and lands in the user config. That is
# the same ephemeral container disk the login above is already written to, and
# registration is skipped entirely when no key is set.
if [ -n "${TAVILY_API_KEY:-}" ]; then
  if claude mcp add --transport http --scope user tavily https://mcp.tavily.com/mcp/ \
      --header "Authorization: Bearer $TAVILY_API_KEY" < /dev/null; then
    echo "Registered the Tavily MCP server for Claude Code."
  else
    echo "Error: could not register the Tavily MCP server." >&2
  fi
else
  echo "TAVILY_API_KEY is not set; the Tavily MCP server was not registered."
fi

echo "Codex cloud environment ready."
