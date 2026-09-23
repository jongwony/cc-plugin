# CLAUDE.md

## Northstar

This repository is an **Extended Mind** — a space that extends my present
understanding. The only constant is that understanding; skills are provisional
artifacts, born and dying along the hermeneutic circle. When anything conflicts,
one measure decides: **fidelity to present understanding outranks artifact
continuity.**

## Architecture

A plugin marketplace, layered by how often each layer changes: the one that
changes least sits at the bottom and each more frequently changed one is
composed on top of it — code (`scripts/`) at the bottom, procedure (`SKILL.md`,
`agents/*.md`) above it, and data (`references/`, the manifests) on top:

- `.claude-plugin/marketplace.json` — plugin list + source paths

## Revising a surface

A `SKILL.md`, an `agents/*.md`, and this file are LLM-facing instruction
surfaces. Changing one is a revision of a durable instruction layer, which is
the moment `premise/instruction-authoring.md` governs — read it before drafting
the change.

## Conventions

- **Helper scripts.** Whatever runtime a script needs is a prerequisite rather
  than a vendored artifact: the skill says so, and says how to install it.
- **Agent vs Skill.** Agent = how to behave (principles, boundaries, error
  philosophy). Skill = what to do (workflow, procedures, commands).
- **Branch naming.** Where a unit of work has a chart outside this repository, the
  branch carries that chart's issue identifier — `roo-39-description`, or after a
  type prefix where one is used.
- **Importing external-tool capability — 3 tests, all required.** (1)
  *Irreducibility*: not reproducible from existing primitives (ergonomic wrappers
  stay inside scripts). (2) *Environment neutrality*: a protocol-level capability
  that works without the originating tool installed. (3) *SSOT respect*:
  authoritative state is reached through its authoritative path — the source owns
  get/set/clear rather than a mirror.

## Versioning

Logic SSOT: `.githooks/check-version-bump.sh` (pure bash), which also holds the
exception list. Two entry points call it, and they share the rule while differing
in baseline: the local pre-commit hook compares the staged index against `HEAD`,
CI (`.github/workflows/version-bump-check.yml`, the real gate; not bypassable)
against the merge-base with the PR base. A later commit on a branch therefore
needs its own bump to pass the hook after CI is already satisfied by an earlier
one, so such a branch carries one bump per such commit.

## Install

Every plugin in the marketplace, for Claude Code:

```bash
curl -fsSL https://raw.githubusercontent.com/jongwony/cc-plugin/main/scripts/install.sh | bash
```

## Workflow

Test inside Claude Code: `/plugin marketplace add <repo>`, then `/plugin install
{plugin}`.
