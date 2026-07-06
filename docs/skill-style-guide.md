# Skill Style Guide

Conventions for authoring a skill in this marketplace, codified once so new skills
converge from the start. PR #102 applied these case-by-case across existing skills
(hardcoded paths, interpreter drift, a dead Legacy section); this guide records the
resulting shape as a **golden reference, not a retrofit list** — existing skills are
cited as precedent, never as work items. Read a neighbor for the live shape; read this
when the neighbors disagree.

## Script path scheme

Anchor every script reference at `${CLAUDE_PLUGIN_ROOT}`. The subpath after it must be
the script's **real location in the repo**, so a reader can open exactly what runs:

- **Bundled under a skill** (default): `${CLAUDE_PLUGIN_ROOT}/skills/<name>/scripts/x.py`
  — pdf-split, media-download, graph-sketch, manim, handwriting.
- **Shared at plugin root** (single-skill plugin, or scripts shared across skills):
  `${CLAUDE_PLUGIN_ROOT}/scripts/x.py` — cdp-attach (its `v1`/`v2`/`v3` scripts live at
  the plugin root and are shared by the one skill).

`${CLAUDE_PLUGIN_ROOT}` is the invariant; the two subpaths are not alternatives to pick
between — each mirrors where the script physically sits.

**Never:**

- `~/.claude/skills/<name>/scripts/...` — a hardcoded home-relative path breaks
  portability across installs (fixed in pdf-split, PR #102 `fcd3862`).
- a bare `<skill-dir>/...` or any literal placeholder — not a resolvable path (fixed in
  handwriting, PR #102 `0773699`).

## Interpreter policy

Python scripts run through **`uv run`** with a **PEP-723 inline metadata header** —
never `python3` / `python` directly (sidesteps the `python` vs `python3` ambiguity, per
CLAUDE.md "Python = PEP 723 + uv").

```python
#!/usr/bin/env uv run --quiet --script
# /// script
# requires-python = ">=3.9"
# dependencies = []
# ///
```

- A stdlib-only script still carries the header, with `dependencies = []` declared
  explicitly — the header is the convention marker, not just a dependency list.
- SKILL.md invocations use `uv run ${CLAUDE_PLUGIN_ROOT}/.../x.py`, not `python3 ...`.

Precedent: media-download's `decode_qr.py` / `save_metadata.py` were stdlib-only but on
`python3`; PR #102 `c1083b3` added the minimal `dependencies = []` header and switched
invocations to `uv run`, aligning them with the sibling tools (pdf-split, graph-sketch,
manim).

## Frontmatter tier rule

`context: fork` and `model: sonnet` sit on two **independent** axes. Declare each only
when its own condition holds — a skill may take both, one, or neither.

**`context: fork` — output-isolation axis.** Declare when the skill's own execution
produces high-volume or noisy tool output (screenshots, network/DOM dumps, `strings |
grep` over a large binary, multimodal media, large JSON) that would otherwise flood the
parent context. Fork runs the skill in an isolated context, returning only its result.

- Declares it: cdp-attach (browser output), video-understanding (media + model
  responses), pdf-split (TOC + per-chapter output), claude-code-internals (binary
  `strings`; its `<constraints>` block even warns of SIGTRAP session bloat).
- Does not: user-facing decision/coordination loops that must stay in the conversation
  to present reports and gate choices (safe-uninstall, codex-plus), and light inline
  skills.

**`model: sonnet` — mechanical-vs-judgment axis.** Declare when the skill's own
reasoning is mechanical dispatch — the logic lives in the bundled scripts and the model
only routes and sequences invocations, so the cheaper tier suffices.

- Declares it: cdp-attach (routes `v1`/`v2`/`v3`), video-understanding (dispatches the
  Gemini SDK), pdf-split (runs `extract_toc.py` / `split_by_chapters.py`).
- Does not: skills whose own reasoning is interpretive — omit `model:` to inherit the
  main tier. safe-uninstall (risk assessment, report synthesis) stays on the main tier.

**claude-code-internals is the discriminator that proves the axes are independent:** it
declares `context: fork` (its binary `strings` output must be isolated) but does **not**
pin `model:` — interpreting binary internals is judgment-heavy, so it inherits the main
tier. Fork answers "does the output flood context?"; the model pin answers "is the
skill's reasoning just script-routing?" — different questions.

Current state, as the survey basis (do **not** edit any skill to conform — this is a
snapshot, not a checklist):

| Declares | Skills |
|----------|--------|
| `context: fork` + `model: sonnet` | cdp-attach, google/video-understanding, pdf-split |
| `context: fork` only | claude-code-internals |
| neither | caffeinate, clawd-toggle, codex-plus, excalidraw-host, graph-sketch, handwriting, hourly-digest, make-deck, manim, media-download, remote-tmux, safe-uninstall, unfold, voice-dictation |

## Prerequisites + error-table format

**Prerequisites.** A `## Prerequisites` section directly after the skill's one-line
summary, naming the external dependencies and the command to check or install them. It
covers required *runtime state*, not just packages — cdp-attach names a visible CDP
browser plus a launch command plus a `> Note` on the headless failure mode;
video-understanding names the SDK floor (`google-genai>=2.3.0`) and the API-key export.

**Error handling.** A three-column `| Error | Cause | Resolution |` table, where each
Resolution is an actionable next step rather than a restatement of the cause. cdp-attach
is the depth exemplar. Two adjacent patterns from it:

- **Fallback strategy** — pair the error table with a `| Symptom | 1st fallback | 2nd
  fallback |` table when the operations are inherently flaky, escalating stay-in-tool →
  leave-tool before abandoning.
- **Bounded-timeout doctrine** — probe with a short bounded retry (cdp-attach: two
  attempts, 5s then 10s) before declaring a wedge, rather than letting every call burn
  its full timeout.

**Phased workflow.** For a multi-step procedure with a clear start → verify arc,
safe-uninstall is the exemplar: a one-line `Workflow Overview` (an arrow chain of the
phases), then `## Phase N: Title` sections each carrying their own commands/tables, and
a closing Verification phase. Reach for this shape when the work is a staged pipeline;
reach for cdp-attach's reference-table shape when it is a command surface.

## CI gates

A semantic change to a plugin requires a `version` bump in
`{plugin}/.claude-plugin/plugin.json`, enforced by `.githooks/check-version-bump.sh`
(the local pre-commit hook is best-effort and bypassable; CI via
`version-bump-check.yml` is the real, non-bypassable gate). Re-emitting the same version
(reformat or key reorder) does not count. Non-semantic top-level files (`README*`,
`LICENSE`, `.gitignore`, `.gitattributes`) and `.claude-plugin/` metadata are exempt —
but a same-named file in a *subdirectory* counts as content. A docs-only change outside
any plugin directory (this guide included) needs no bump. Full rule: CLAUDE.md
"Versioning."
