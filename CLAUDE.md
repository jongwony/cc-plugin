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

## Conventions

- **Python = PEP 723 + uv.** Inline script metadata (`# /// script … ///`);
  invoke via `uv run scripts/x.py` (sidesteps the `python` vs `python3`
  ambiguity). Declare `dependencies = []` even when empty.
- **Agent vs Skill.** Agent = how to behave (principles, boundaries, error
  philosophy). Skill = what to do (workflow, procedures, commands). A
  `skills:`-loaded skill is the single home for its workflow; the agent adds only
  behavior it does not carry.
- **Gap tracking (Syneidesis).** Mark unverified assumptions/procedures with a
  `[Gap:Type]` prefix in TodoWrite — `Procedural`, `Assumption`, `Consideration`.
- **Importing external-tool capability — 3 tests, all required.** (1)
  *Irreducibility*: not reproducible from existing primitives (ergonomic wrappers
  stay inside scripts). (2) *Environment neutrality*: a protocol-level capability
  (e.g. CDP) that works without the originating tool installed. (3) *SSOT
  respect*: authoritative state (browser cookies/`localStorage`/…) is reached
  through its authoritative path — the source owns get/set/clear rather than a
  mirror.

## Versioning

Edit `version` in `{plugin}/.claude-plugin/plugin.json`; `marketplace.json`
carries source paths only.

**Bump-on-change.** When a plugin's meaningful files change in a change-set, that
plugin's `version` must actually change (re-ordering/reformatting alone does not
count). Exception: top-level non-meaningful files only — `.claude-plugin/`
metadata and plugin-root `README*`/`LICENSE`/`.gitignore`/`.gitattributes`; a
same-named file in a subdirectory counts as content. A `git rm` of a meaningful
file counts. A new plugin satisfies it via its initial version.

Logic SSOT: `.githooks/check-version-bump.sh` (pure bash). Two entry points call
it — the local pre-commit hook (`git config core.hooksPath .githooks`, once per
clone; best-effort, bypassable) and CI
(`.github/workflows/version-bump-check.yml`, the real gate; range mode; not
bypassable).

## Workflow

Test inside Claude Code: `/plugin marketplace add <repo>`, then `/plugin install
{plugin}`.
