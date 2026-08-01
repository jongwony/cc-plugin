# Belonging tests — worked detail

Depth for pass 2. Each section gives the failure's shape in real skill prose, why
it costs, and where the content goes.

The five tests are independent. A passage can fail more than one, and the route is
decided by the first test it fails in the order below — execution relevance is the
coarsest filter, so run it first.

---

## 1. Execution relevance → commit message

**Ask:** does a model *executing* this skill act differently because of this
sentence?

A skill is a state surface: it asserts what to do now. Rationale, provenance,
epistemic status, and rejected alternatives are then-records — they explain how the
skill came to say what it says. Both are worth keeping; only one is worth loading
into every session that touches the skill.

Failure shapes, all common:

- **Mechanism stories.** Two paragraphs explaining why a guard exists and how it is
  implemented, when the executing model only needs to know that a certain call is
  unavailable and what to do instead.
- **Epistemic annotations.** "Verified 2026-07", "this is inference, not
  measurement", "unconfirmed against the live endpoint". Real and worth recording,
  but no action follows from reading them.
- **Provenance links.** The vendor doc URL that justified a default value.
- **Design-decision notes.** "Corrected here in prose rather than by editing the
  script, because …" — addressed to a maintainer, not to the running model.
- **Reassurance.** "Reading this file cannot destabilize the run." Nothing to do.
- **Reviewer-directed material.** An "unverified — read before merging" list belongs
  in the pull request, which is where a reviewer is standing.

Route the content to the commit message body, and write that text as part of the
review rather than leaving it as an instruction to write it later.

### The residue-extraction procedure

Never delete a paragraph wholesale. Operative clauses hide inside rationale.

1. Mark every clause that names an action, a threshold, or a condition.
2. Rewrite those clauses as standalone instructions in the skill.
3. Move what is left to the commit message.
4. Re-read the new instruction alone: if it no longer makes sense without the
   removed context, keep the minimum context as a subordinate clause.

Worked example — before:

> The wrapper streams the event log to a file beside the prompt. Open it to check a
> long run mid-flight. Expect buffered bursts rather than a smooth tick: the tool
> block-flushes, so a mid-run read shows accumulated progress arriving in chunks
> (verified: progress events were present in the file well before the run
> finished). It is a bystander — it never gates the result path, so reading it
> cannot destabilize the run, and there is no always-on transform to pay for.
> Byte-bound it or filter with `jq`; a bare line-based `tail` will not cap it,
> because one event can be many megabytes.

After — skill keeps:

> The wrapper streams the event log to a file beside the prompt; open it to check a
> long run mid-flight. Read it byte-bounded or with a `jq` field filter — one event
> can be many megabytes, so a line-based `tail` will not cap it. Expect progress in
> buffered chunks rather than a smooth tick.

Commit message takes: the verification note, and the bystander reasoning about why
reading it is safe.

---

## 2. Ownership → out

**Ask:** is this a fact about this skill's own surface, or about another tool's?

A skill that wraps an external CLI, API, or model tends to accumulate that tool's
option space: its accepted values, its version differences, its error taxonomy. The
content is accurate and still does not belong. It drifts on the other tool's
schedule, and nobody reviewing this skill will notice when it goes stale.

Signals:

- A table of values some other tool accepts, where the skill itself uses two of them.
- Version notes about the wrapped tool's behaviour changes.
- Mappings between the wrapped tool's vocabulary and a third party's.

The test is sharper than "is this too detailed", and it catches passages that pass
every size check. If the fact is not about this skill's own surface, moving it to
`references/` only relocates the drift — route it out, and let the wrapped tool's
own documentation carry it.

---

## 3. Channel → enforcement layer

**Ask:** is this already enforced somewhere that is read on demand?

A SKILL.md loads on every turn that touches it. A wrapper's `--help`, a validator's
error message, and a schema are read only when needed or when something breaks.
Content that exists in both places is duplication with a delivery schedule, and the
two copies will eventually disagree — at which point the copy the model reads every
turn is the wrong one.

When a fact is enforced, the skill should state the working choice, not the full
accepted set. When it is *not* enforced but should be, that is the finding: propose
the guard rather than a longer paragraph.

A guard that rejects a bad value converts a silent wrong result into a loud stop.
That is worth more than any amount of prose warning about the same value, and it
removes the reason the prose existed.

---

## 4. Salience → out, or restate positively

**Ask:** does naming this thing in order to forbid it introduce it?

A written prohibition puts the prohibited action into every session's context.
Where the behaviour would not have occurred unprompted, the prohibition is the
thing that raises it — the instruction creates its own target.

A prohibition earns its place only when the behaviour has an observed nonzero base
rate: evidence it actually happens. Absent that, prefer the positive statement of
what to do, which occupies the same space and leaves no residue.

The characteristic failure is an enumeration written to warn against part of
itself — listing several options in order to say that two of them are traps. Delete
the enumeration and state the options that are actually chosen. What the reader
never learns, the reader never reaches for.

Where a prohibition does qualify, keep it and note the evidence in the commit
message rather than in the skill.

---

## 5. Friction → trim the example

**Ask:** does an example make a high-impact path the frictionless one?

Examples get copied. A complete, ready-to-run command line for a destructive or
high-privilege operation lowers the cost of exactly the action the skill elsewhere
gates. The gate has to be read to work; the command only has to be seen.

This is not an argument for removing every mention of the dangerous mode — a caller
who deliberately needs it should still find it documented in the options list. It is
an argument against pre-assembling it.

Same reasoning, smaller stakes: an example that passes a flag already set by
default. It teaches a habit that does nothing and grows every example that copies
it.
