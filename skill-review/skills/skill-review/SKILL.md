---
name: skill-review
description: |
  This skill should be used when the user asks to "review my skill", "review this
  skill", "check this SKILL.md", "audit a skill", "is this skill too long",
  "why does this skill keep growing", "스킬 리뷰", "스킬 검토해줘", or wants a
  SKILL.md checked before opening a PR. Also use after creating or substantially
  editing a SKILL.md. Wraps the plugin-dev:skill-reviewer agent for structure and
  triggering, then applies belonging tests that route each finding to the skill
  body, references/, the enforcement layer, or the commit message.
---

# Skill Review

Two questions, different owners.

`plugin-dev:skill-reviewer` answers **is this too long, and is it in the right
file?** — frontmatter, trigger phrases, imperative voice, word count, progressive
disclosure. For content that does not belong in SKILL.md it has one route:
`references/`.

This skill answers **does this belong at all?** and supplies the other routes —
the enforcement layer, the commit message, or out.

A skill bloats for several unrelated reasons at once, and a single word-count
verdict cannot tell them apart. The tests below separate them.

## Pass 1 — structure (delegate)

Launch the `plugin-dev:skill-reviewer` agent against the target SKILL.md, passing
an absolute path. It reads only. Keep its report; pass 2 builds on it instead of
repeating it.

## Pass 2 — belonging

Read the skill body and apply five tests. Each returns a verdict and a route.

| Test | Ask of each passage | Failing content routes to |
|---|---|---|
| **Execution relevance** | Does a model *executing* this skill act differently because of it? | commit message |
| **Ownership** | Is this a fact about this skill's own surface, or another tool's option space? | out |
| **Channel** | Is it already enforced somewhere read on demand — `--help`, a validator, a schema? | enforcement layer |
| **Salience** | Does naming a thing in order to forbid it introduce it? | out, or restate as the positive instruction |
| **Friction** | Does an example make a high-impact path the frictionless one? | trim the example to its safe form |

**Extract before deleting.** Operative clauses hide inside rationale paragraphs; a
passage that is nine-tenths provenance can still carry the one instruction that
changes behaviour. Pull that residue out first, then remove what remains.

Worked failures for each test, and the shape of a residue extraction, are in
`references/belonging.md` — consult it while running this pass.

## Pass 3 — enforcement drift (conditional)

Run this only when the skill ships something that enforces its claims: a wrapper
script, a validator, a `--help`, a schema. A pure-prose procedure skill has no
enforcement layer and skips the pass.

The pass compares what the skill claims against what the enforcement layer does,
established by running it rather than reading it. Procedure: `references/drift.md`.

## Report

Group findings by route rather than by severity — the route is what the user acts
on.

```
## Skill Review: <name>

### Structure
<the agent's findings, condensed — do not restate them in full>

### Belonging
| Finding | Test | Route |
|---|---|---|
| <quote or line ref> | <test name> | keep / references/ / enforcement / commit message / out |

### Drift          (only when pass 3 ran)
| Claim | Observed | Verdict |

### Net
<current word count → projected, and the single change with the largest effect>
```

Give the projected count as an estimate. How much survives depends on how much
residue extraction preserves, which is not knowable before the edit.

When findings route to the commit message, draft that text too — content moved
without a destination written for it tends to be lost instead of relocated.

## Additional Resources

- **`references/belonging.md`** — the five tests in depth: what each failure looks
  like in real skill prose, the residue-extraction procedure, and before/after
  pairs. Consult while running pass 2.
- **`references/drift.md`** — pass 3 procedure: verifying claims against an
  enforcement layer, establishing absence across more than one channel, and
  demonstrating a guard with a known-fail and known-pass pair. Consult when the
  skill under review ships a script, validator, or schema.
