# Enforcement drift — pass 3

Run this pass when the skill under review ships something that enforces its claims:
a wrapper script, a validator, a `--help`, a JSON schema, a config template. A
pure-prose procedure skill has no enforcement layer; skip the pass and say so in
the report rather than leaving the section blank.

The pass answers one question per claim: **does the enforcement layer actually do
what the skill says it does?**

---

## Establish by running, not by reading

Read the script to find candidate claims. Confirm them by executing it. A claim
confirmed by reading is a claim about the reader's understanding of the code.

Inventory the skill's checkable assertions first — default values, accepted inputs,
what a flag does, what the output contains, what gets rejected. Then exercise each
one. Most can be checked without a live API call: usage output, argument parsing,
and pre-flight validation all run before any network work.

Where a real invocation is unavoidable, a stub on `PATH` that prints the arguments
and environment it received, then exits, reveals what the wrapper actually hands
off. That reads the handoff boundary — which is the thing in question — without
paying for the downstream call.

---

## Absence needs more than one channel

Presence is proved by one hit. Absence is not disproved by one miss, and this
asymmetry is the pass's most reliable source of wrong conclusions.

Two failure shapes worth checking for directly:

- **A value assigned outside the pattern searched.** A variable exported inside a
  conditional or `case` block does not match a search anchored to the start of a
  line. The variable is set; the search says it is not.
- **An option omitted from generated help.** A deprecated flag can remain fully
  functional while no longer appearing in `--help`. The help text says it is gone;
  the parser still accepts it, often with a warning that lands in whatever channel
  the caller is scraping for something else.

Before concluding that something is absent, calibrate the check with an input known
to be absent. If a deliberately invented flag name produces the same result as the
flag under test, the check cannot distinguish them and proves nothing about either.

A short-circuiting argument defeats this too: `--help` is commonly processed before
argument validation, so pairing an unknown flag with `--help` may exit cleanly and
say nothing about whether the flag is recognised.

---

## A guard needs a known-fail and a known-pass

A check that only ever passes is indistinguishable from a check that is not wired
up. Demonstrating a guard requires both arms:

- **Known-fail** — an input the guard should reject. Confirm it is rejected, and
  confirm the rejection names the guard's own reason rather than some later error.
- **Known-pass** — an input the guard should admit. Confirm it clears the guard.
  The proof that it cleared is that execution reaches a *different* failure or
  succeeds; a pass arm that fails for the same reason as the fail arm has shown
  nothing.

Choose the fail arm to discriminate. When a guard has been narrowed, the arm that
demonstrates the narrowing is an input that was previously valid — not one that was
always invalid, which would have been rejected before the change too.

---

## Check the skill's own verification claims for staleness

Skills and their pull requests often carry a table of checks that were run. Those
tables are written once and rarely revisited, so they record the enforcement
layer as it was at the time of writing.

Re-run the table rather than trusting it. A stale row is worse than a missing one:
a reader who reproduces it sees a mismatch and cannot tell whether the skill, the
tool, or their own environment is wrong. Common stale entries are counted output
("prints an N-line usage"), enumerated accepted values, and error message text —
each of which changes whenever the enforcement layer is edited.

Report each as `Claim | Observed | Verdict`, and route a stale claim to whichever
surface owns it: the skill body, or the pull request that carries the table.

---

## What this pass does not do

It does not judge whether the enforcement layer is well designed, and it does not
propose refactors. Its output is limited to agreement and disagreement between two
surfaces that are supposed to say the same thing.

One exception is worth raising when it appears: a claim the skill states in prose
that *could* be enforced but is not. That finding belongs to the channel test in
pass 2 — propose the guard, because a guard removes the paragraph.
