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

- **Helper scripts: Python by default; Bun TypeScript when the script's
  counterpart is a page the plugin ships.** *Python* = PEP 723 + uv — inline
  script metadata (`# /// script … ///`), `dependencies = []` declared even when
  empty, invoked as `uv run scripts/x.py`. *Bun TypeScript* — `bun
  scripts/x.ts`. Both are prerequisites rather than vendored artifacts; a skill
  that needs one says so, and says how to install it.
- **Agent vs Skill.** Agent = how to behave (principles, boundaries, error
  philosophy). Skill = what to do (workflow, procedures, commands). A
  `skills:`-loaded skill is the single home for its workflow; the agent adds only
  behavior it does not carry.
- **Gap tracking (Syneidesis).** Mark unverified assumptions/procedures with a
  `[Gap:Type]` prefix on the tracked task — `Procedural`, `Assumption`,
  `Consideration`.
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
name one directory down counts as content. A `git rm` of a meaningful file
counts. A new plugin satisfies it via its initial version.

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
Each plugin installs whether or not its prerequisite is present.

## Workflow

Test inside Claude Code: `/plugin marketplace add <repo>`, then `/plugin install
{plugin}`.
