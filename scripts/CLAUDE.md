# scripts/

Install and environment-setup entry points. Each is reached by a one-line
`curl … | bash` named in the root `CLAUDE.md`; what follows governs editing them.

## install.sh — every plugin, Claude Code

- Reads the plugin list from `.claude-plugin/marketplace.json`, so adding or
  retiring a plugin needs no edit here, and re-running it is safe.
- Each plugin installs whether or not its prerequisite is present.
- The macOS-only plugins are opt-in: the script names them in `SKIP_PLUGINS`,
  checks that list against the manifest on every run, and prints the install
  command for each.

## codex-install.sh — the Codex opt-in subset

- The Codex CLI reads the same `.claude-plugin/marketplace.json` and can install
  any plugin listed there, so which ones it *should* install is a separate
  question. That opt-in is per-plugin and marked by a
  `{plugin}/.codex-plugin/plugin.json`, which also carries the richer manifest
  Codex's interface reads.
- Registers the marketplace with `codex plugin marketplace add`, then installs
  exactly the plugins carrying that marker — detected from the manifest and the
  tree Codex itself resolved, so adding one later needs no edit here.

## cloud-setup.sh — a Claude Code cloud environment

- Runs both marketplaces' installers, and adds the opt-in epistemic-protocols
  plugins and the Codex CLI.
- Registers Tavily's remote MCP server for Codex. The key is read from
  `TAVILY_API_KEY` at call time, so this script writes no secret.
- Registers `scripts/codex-auth-restore.sh` as a user-level SessionStart hook:
  the environment's variables reach the session but not the setup script, so the
  Codex login is restored from `CODEX_AUTH_JSON_B64` there.
- Registers Linear's remote MCP server for Claude Code as `linear-personal` at
  user scope, behind `scripts/linear-mcp-headers.sh` — a `headersHelper`, which
  Claude Code runs when it opens the connection.
  - The name is distinct because an environment may already reach Linear through
    an account-level connector this script does not control.
  - User scope is the only one that works: a repo-resident entry runs its helper
    only under persisted workspace trust, and project scope waits on an
    interactive approval as well.
  - The helper emits an `Authorization` header when the session's
    `LINEAR_API_KEY` is set and an empty object when it is not, so the key takes
    precedence wherever the environment supplies one and the OAuth path stays
    available where it does not. A static `headers` entry cannot do this: it
    *replaces* OAuth rather than preceding it, so a rejected header fails the
    connection instead of falling back.

## codex-cloud-setup.sh — an OpenAI Codex cloud environment

Installs the Claude Code CLI with the native installer
(`https://claude.ai/install.sh`), runs both marketplaces' installers, adds the
opt-in epistemic-protocols plugins, persists the login, and registers Tavily's
remote MCP server. Four Codex cloud constraints govern any edit to it:

- Internet reaches the setup phase only — off by default during the agent phase
  — so every network step finishes inside the script.
- The agent phase is a separate process inheriting no `export`, and the
  installer's `$HOME/.local/bin` is not on the default PATH, so the binary is
  symlinked into a directory already on PATH.
- Secrets are stripped before the agent phase, so `CLAUDE_CODE_OAUTH_TOKEN` (or
  `ANTHROPIC_API_KEY`) is written into `~/.claude/settings.json`'s `env` block
  here rather than through a SessionStart hook.
- `claude mcp add` has no `--bearer-token-env-var`, and `${VAR}` expansion is
  `.mcp.json`-only, so `TAVILY_API_KEY` is resolved at setup time into the user
  config, and registration is skipped when it is unset.

A `headersHelper` is the general answer to that last gap wherever the surface
takes one: it reads the variable at call time, where a flag would have to
resolve it at setup time. `cloud-setup.sh`'s `linear-personal` entry is that
case.
