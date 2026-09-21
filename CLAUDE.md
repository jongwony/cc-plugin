# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Northstar

This repository is an **Extended Mind** — a space that extends my present
understanding. The only constant is that understanding; skills are provisional
artifacts, born and dying along the hermeneutic circle. When anything conflicts,
one measure decides: **fidelity to present understanding outranks artifact
continuity.**

From that single measure:

- **Solve at the root, not the margin** (fundamental first) — but *fundamental ≠
  maximal*. Remove the root cost (a deferred assumption, a legacy shim) at the
  source, keeping the change surface minimal. A patch that looks small but defers
  a cost is not minimal: measure "minimal" by lifetime cost, not diff size.
- **The only constituency is the present self.** External compatibility, legacy,
  and future-proofing are by-products, not targets — preserve only what serves
  the present understanding.
- **Change is metabolism.** Skills are re-derived, not preserved; an artifact
  earns its place by serving the current understanding with the least drag.

## Architecture

A plugin marketplace, layered by rate of change — slower layers underneath,
faster ones composed on top (code > procedure > data):

- `.claude-plugin/marketplace.json` — plugin list + source paths (no versions)
- `{plugin}/.claude-plugin/plugin.json` — name, version, description
- `{plugin}/skills/{name}/SKILL.md` — user-invoked via `/name`
- `{plugin}/agents/{name}.md` — auto-delegated via the Task tool
- `{plugin}/.mcp.json` — external-tool integration (optional)
- `external-plugin/{name}/` — third-party integrations, kept separate

Put API docs and examples in `references/`, helper scripts in `scripts/`.
Frontmatter shapes (skill/agent YAML, multi-skill loading, tool restriction, MCP
HTTP/Command forms) are re-derivable from existing siblings — read a neighbor to
see the current shape.

## Revising a surface

A `SKILL.md`, an `agents/*.md`, and this file are LLM-facing instruction
surfaces. Changing one is a revision of a durable instruction layer, which is
the moment `premise/instruction-authoring.md` governs — read it before drafting
the change.

## Conventions

- **Helper scripts.** A Python script prefers inline uv environment setup —
  PEP 723 script metadata (`# /// script … ///`) with `dependencies = []`
  declared even when empty, run as `uv run scripts/x.py`. A TypeScript script
  runs with `bun scripts/x.ts`. Whatever runtime a script needs is a
  prerequisite rather than a vendored artifact: the skill says so, and says how
  to install it.
- **Agent vs Skill.** Agent = how to behave (principles, boundaries, error
  philosophy). Skill = what to do (workflow, procedures, commands). A
  `skills:`-loaded skill is the single home for its workflow; the agent adds only
  behavior it does not carry.
- **Importing external-tool capability — 3 tests, all required.** (1)
  *Irreducibility*: not reproducible from existing primitives (ergonomic wrappers
  stay inside scripts). (2) *Environment neutrality*: a protocol-level capability
  that works without the originating tool installed. (3) *SSOT respect*:
  authoritative state is reached through its authoritative path — the source owns
  get/set/clear rather than a mirror.

## Versioning

Edit `version` in `{plugin}/.claude-plugin/plugin.json`.

**Bump-on-change.** When a plugin's meaningful files change in a change-set, that
plugin's `version` must actually change (re-ordering/reformatting alone does not
count). Exception: a plugin's own top-level metadata and boilerplate — the same
name one directory down counts as content. The exception covers presentation,
not component selection: `.codex-plugin/plugin.json` is exempt only while its
`skills` selector is unmoved, and adding or deleting that manifest moves it. A
`git rm` of a meaningful file counts. A new plugin satisfies it via its initial
version.

Logic SSOT: `.githooks/check-version-bump.sh` (pure bash), which also holds the
exception list. Two entry points call it, and they share the rule while differing
in baseline: the local pre-commit hook (`git config core.hooksPath .githooks`,
once per clone; best-effort, bypassable) compares the staged index against `HEAD`,
CI (`.github/workflows/version-bump-check.yml`, the real gate; not bypassable)
against the merge-base with the PR base. A later commit on a branch therefore
needs its own bump to pass the hook after CI is already satisfied by an earlier
one, so such a branch carries one bump per such commit.

## Install

Every plugin in the marketplace, in one line:

```bash
curl -fsSL https://raw.githubusercontent.com/jongwony/cc-plugin/main/scripts/install.sh | bash
```

`scripts/install.sh` reads the plugin list from `.claude-plugin/marketplace.json`,
so adding or retiring a plugin needs no edit to it, and re-running it is safe.
Each plugin installs whether or not its prerequisite is present. The macOS-only
plugins are opt-in: the script names them in `SKIP_PLUGINS`, checks that list
against the manifest on every run, and prints the install command for each.

The OpenAI Codex CLI reads the same `.claude-plugin/marketplace.json` and can
install any plugin listed there, so which ones it *should* install is a separate
question. That opt-in is per-plugin and marked by a
`{plugin}/.codex-plugin/plugin.json`, which also carries the richer manifest
Codex's interface reads:

```bash
curl -fsSL https://raw.githubusercontent.com/jongwony/cc-plugin/main/scripts/codex-install.sh | bash
```

`scripts/codex-install.sh` registers the marketplace with `codex plugin
marketplace add`, then installs exactly the plugins carrying that marker —
detected from the manifest and the tree Codex itself resolved, so adding one
later needs no edit to the script.

A Claude Code cloud environment takes one line in its setup-script field:

```bash
curl -fsSL https://raw.githubusercontent.com/jongwony/cc-plugin/main/scripts/cloud-setup.sh | bash
```

`scripts/cloud-setup.sh` runs both marketplaces' installers, adds the opt-in
epistemic-protocols plugins and the Codex CLI, registers Tavily's remote MCP
server for Codex (the key is read from `TAVILY_API_KEY` at call time, so the
setup script writes no secret), and registers `scripts/codex-auth-restore.sh`
as a user-level SessionStart hook: the environment's variables reach the
session but not the setup script, so the Codex login is restored from
`CODEX_AUTH_JSON_B64` there.

It also registers Linear's remote MCP server for Claude Code at user scope,
behind `scripts/linear-mcp-headers.sh` — a `headersHelper`, which Claude Code
runs when it opens the connection. The helper emits an `Authorization` header
when the session's `LINEAR_API_KEY` is set and an empty object when it is not,
so the key takes precedence wherever the environment supplies one and the OAuth
path stays available where it does not. A static `headers` entry cannot do
this: it *replaces* OAuth rather than preceding it, so a rejected header fails
the connection instead of falling back. This is also the general answer to the
`--bearer-token-env-var` gap noted below — a helper reads the variable at call
time, where a flag would have to resolve it at setup time.

An **OpenAI Codex cloud** environment takes one line in its own setup-script
field, and gets Claude Code inside it:

```bash
curl -fsSL https://raw.githubusercontent.com/jongwony/cc-plugin/main/scripts/codex-cloud-setup.sh | bash
```

`scripts/codex-cloud-setup.sh` installs the Claude Code CLI with the native
installer (`https://claude.ai/install.sh`), runs both marketplaces'
installers, adds the opt-in epistemic-protocols plugins, persists the login,
and registers Tavily's remote MCP server. Four Codex cloud constraints govern
any edit to it:

- Internet reaches the setup phase only — off by default during the agent
  phase — so every network step finishes inside the script.
- The agent phase is a separate process inheriting no `export`, and the
  installer's `$HOME/.local/bin` is not on the default PATH, so the binary is
  symlinked into a directory already on PATH.
- Secrets are stripped before the agent phase, so `CLAUDE_CODE_OAUTH_TOKEN`
  (or `ANTHROPIC_API_KEY`) is written into `~/.claude/settings.json`'s `env`
  block here rather than through a SessionStart hook.
- `claude mcp add` has no `--bearer-token-env-var`, and `${VAR}` expansion is
  `.mcp.json`-only, so `TAVILY_API_KEY` is resolved at setup time into the user
  config, and registration is skipped when it is unset.

## Workflow

Test inside Claude Code: `/plugin marketplace add <repo>`, then `/plugin install
{plugin}`.
