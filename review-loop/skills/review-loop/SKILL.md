---
name: review-loop
description: "Convergence-paced review-resolve loop over a change and its governing surfaces. Verifies each finding against the codebase and the base it is measured from, then re-reviews until each is disposed of."
skills:
  - aitesis:inquire
  - epharmoge:contextualize
---

# Review Loop

## Caller Signature

```
/review-loop [source?] [scope?] [landing?]

source  : codex | code-review — one, or several reviewing in parallel
scope   : PR number | implicit current-branch PR / working tree
landing : head | stacked       (PR scope only)
```

Read only the driving host's reference before determining availability:

| Host | `source=code-review` | `source=codex` | Reference |
|---|---|---|---|
| Claude Code | Fork the available Claude `/code-review` skill | Run a fresh codex session through codex-plus | [Claude Code](references/host-claude-code.md) |

## Source Interface

```
(diff pointer, design intent) → { findings[], verdict, exercised, direction? }
finding   : [critical | high | medium | low | suggestion] file:line — description
verdict   : approve | needs-attention
exercised : axes judged; axes not reached and what stopped each
direction : optional shared-cause hypothesis with its falsifier
```

Every source able to report reach owes `exercised`, including on approval. Ask
explicitly whether the whole changed artifact's contract closes: declared values
have producers, branches have supplied inputs, and obligations reach their consumers.
Ask equally what the artifact carries that its remaining text already recovers: which
obligation fails on a clause's deletion, and which two places state one thing and would
have to be kept in step. Distinguish source analysis from executed checks.
Request `direction` after findings on a non-approval; no single mechanism is a
valid answer. A mechanism lacking a falsifier does not fill this slot. The loop
supplies neither reach nor a source direction by inference.

## Loop

```lean
/-!
How to read this block. It is core Lean 4 and elaborates as written, and you are the model it is
written for: you read it, and by inference over the context you settle each element it leaves
open. Every `axiom` is one of those judgments — a black box to the contract, yours to make from
the material in front of you; its doc comment says what you judge there, and nothing in this
block decides it for you. Every `def`, `inductive`, and `structure` is fixed by the contract.
The block fixes where the loop goes from one phase to the next; what a phase does, and how it
resumes after a gate, is its rules below.
-/

namespace ReviewLoop

/-- The session as it stands: the invocation, the user's turns, each source's returns, the
    captured base, the design-decision ledger, and the trace. -/
axiom Session : Type

/-- A reviewer, by the name the host knows it under. -/
abbrev Source := String

/-- A finding a source reported, or one the loop's own goal reading added. -/
structure Finding where
  source : Source
  site   : String
  claim  : String

/-! ── ENTRY ── -/

/-- How Phase 0 reads the sources. -/
inductive Entry
  | use (sources : List Source)
  /-- the one invokable source, said as relayed -/
  | relay (s : Source)
  /-- a gate: the invokable sources with their actual coverage, cost and reporting limits and no
      default; or why a designated source is unavailable, with making it available, an available
      alternative, or stopping — the designation retained until that is settled -/
  | ask
  /-- the loop stops, naming the missing capability -/
  | missing

/-- `designated`: the names of the sources this invocation designates; an effort level designated
    for a source travels with it to its adapter and is not compared here. `invokable`: what the
    host can run now. -/
def entry (designated invokable : List Source) : Entry :=
  match designated, invokable with
  | [], []    => .missing
  | [], [s]   => .relay s
  | [], _     => .ask
  | _ :: _, _ => if designated.all invokable.contains then .use designated else .ask

/-! ── FINDINGS ── -/

/-- **Your judgment**, through `/inquire` on the finding against the current artifact: the
    artifact refutes it. A refuted finding is dropped with its cited basis and takes no
    provenance. -/
axiom Refuted : Session → Finding → Prop

/-- Where a surviving finding's issue stood at the captured base. -/
inductive Provenance
  /-- the issue already held -/
  | preExisting
  /-- absent at base; the change alone supplies the defect -/
  | introduced
  /-- absent at base, but an independent condition is jointly necessary -/
  | indeterminate

/-- **Your reading** of the captured base for a surviving finding, following moves and renames. -/
axiom provenance : Session → Finding → Provenance

/-- The side a finding takes when scope is decided. -/
inductive Side | ofChange | preExisting

def Provenance.side : Provenance → Side
  | .introduced    => .ofChange
  | .preExisting   => .preExisting
  | .indeterminate => .preExisting

/-- How a finding ends: a verified repair, a drop with its cited basis, or carried with its
    reason — a successor handover or declared residual. -/
inductive Disposition | applied | dropped | carried

/-- **Your reading**: the disposition a citable ground already settles for this finding — the
    user's prior direction, the PR's purpose, a governing rule harvested under Phase 0 rule 4, or
    citable precedent — or `none`. -/
axiom settled : Session → Finding → Option Disposition

inductive Class
  /-- Extension: a verified bug with a self-evident localized fix, or another deterministic edit
      whose plausible shapes do not materially diverge -/
  | mechanical
  /-- Constitution: materially different repair trajectories (withholding a whole carrier, where
      another repair keeps part of what it delivers, is one), unresolved design trade-offs, or
      unentrusted scope/risk decisions -/
  | judgment

/-- **Your judgment** of a surviving finding that nothing cited settles. -/
axiom classOf : Session → Finding → Class

/-- **Your judgment**: a citable scope license — purpose, mandated sweep, or settled precedent —
    takes the repair of this pre-existing-side defect into this unit. -/
axiom Licensed : Session → Finding → Prop

/-- What Phase 3 does with one surviving finding. -/
inductive Handling
  /-- relayed with its basis, recording side effects; no question -/
  | relay (d : Disposition)
  /-- applied and reported, without a disposition gate -/
  | apply
  /-- a disposition gate -/
  | gate

open Classical in
noncomputable def handling (s : Session) (f : Finding) : Handling :=
  match settled s f with
  | some d => .relay d
  | none =>
    match classOf s f, (provenance s f).side with
    | .mechanical, .ofChange    => .apply
    | .mechanical, .preExisting => if Licensed s f then .apply else .gate
    | .judgment, _              => .gate

/-! ── APPLY PASS ── -/

/-- The most the host offers for an apply pass: a full-context fork where it offers one, otherwise
    a fresh-context delegate, otherwise none. -/
inductive Delegation | fullContextFork | freshContextDelegate | none

/-- The writer route. `fork`: one full-context fork per apply pass. `brief`: a fresh-context
    delegate, handed the enumerated predicate and screened sites in a self-contained brief.
    `inline`: the driving session writes. -/
inductive Route | fork | brief | inline

/-- `parentHeld`: the pass holds an action the driving session keeps for risk. -/
def route (d : Delegation) (parentHeld : Bool) : Route :=
  if parentHeld then .inline else
    match d with
    | .fullContextFork      => .fork
    | .freshContextDelegate => .brief
    | .none                 => .inline

inductive Actor | drivingSession | delegate

/-- Who performs step 1 of Phase 4. -/
def scanHolder : Route → Actor
  | .fork => .delegate
  | _     => .drivingSession

/-- Who performs steps 4 and 5 of Phase 4. -/
def writer : Route → Actor
  | .inline => .drivingSession
  | _       => .delegate

/-! ── CONVERGENCE ── -/

/-- **Your reading**: every surfaced finding is dispositioned. -/
axiom AllDispositioned : Session → Prop

/-- **Your reading**: a recurrence awaits diagnosis. -/
axiom RecurrencePending : Session → Prop

/-- **Your reading**: an edit has landed since the latest review. -/
axiom EditedSinceReview : Session → Prop

/-- **Your reading**, for one source the loop is using, on the current reviewed artifact: it
    returned `approve`, or a full re-review returned zero new non-refuted findings. A finding is
    new in its discovery review even when deferred or handed over; its later return is not new and
    preserves the disposition. -/
axiom Clear : Session → Source → Prop

/-- **Your reading**: every source the loop is using completed a full re-review. -/
axiom FullyReReviewed : Session → List Source → Prop

/-- **Your reading** of Phase 3: the verified set names a shared cause. -/
axiom SharedCause : Session → Prop

/-- **Your reading**: every root on the trace maps to its resolution. -/
axiom RootsResolved : Session → Prop

/-- Phase 3's root-resolved end: the loop ends as it stands, the round's findings go to the user
    unrepaired with their dispositions, and no repair is chosen or applied. -/
def RootResolved (sources : List Source) (s : Session) : Prop :=
  FullyReReviewed s sources ∧ ¬ SharedCause s ∧ RootsResolved s ∧ ¬ RecurrencePending s

/-- Convergence holds only of the current reviewed artifact. `sources`, here and in `RootResolved`
    and `next`: the sources the loop is using — those `entry` settled (`Entry.use`'s list, or the
    one `Entry.relay` names), as the user has since changed them at a sources gate. -/
def Converged (sources : List Source) (s : Session) : Prop :=
  AllDispositioned s ∧ ¬ RecurrencePending s ∧ ¬ EditedSinceReview s ∧
    ((∀ x ∈ sources, Clear s x) ∨ RootResolved sources s)

inductive Exit
  | converged
  /-- reported as non-convergence, with the latest reviewed artifact, later edits, unfinished
      repairs, residuals, and retained judgments -/
  | notConverged

open Classical in
noncomputable def exitAs (sources : List Source) (s : Session) : Exit :=
  if Converged sources s then .converged else .notConverged

/-! ── LOOP ── -/

/-- One round is `obtain` (Phase 1), `verify` (Phase 2), `settle` (Phase 3), `apply` (Phase 4),
    `decide` (Phase 5's reading of convergence); `enter` is Phase 0. From the second round on,
    `obtain` is the full re-review Phase 5 describes, with its pointer. -/
inductive Phase | enter | obtain | verify | settle | apply | decide

/-- What only the user's turn settles. -/
inductive Gate
  /-- `Entry.ask` -/
  | sources
  /-- Phase 0 rule 2: no changes -/
  | scope
  /-- Phase 0 rule 3: where PR repairs land, raised before the first repair; or recovery direction -/
  | landing
  /-- Phase 1: a call ended without a usable review -/
  | failedCall
  /-- `Handling.gate`, or a direction Phase 3 leaves to the user -/
  | disposition
  /-- Phase 4 step 2: an unsettled epistemic risk -/
  | risk

/-- **Your reading**: the gate this phase's work has raised that no turn of the user's has yet
    settled, or `none`. -/
axiom pending : Session → Phase → Option Gate

/-- **Your reading**: a turn of the user's ends the loop. -/
axiom UserEnds : Session → Prop

/-- **Your reading**: the settled dispositions leave a repair to write. -/
axiom RepairOwed : Session → Prop

inductive Step
  | go (p : Phase)
  /-- the gate is presented and the turn ends; silence settles nothing, and what waits on the gate
      does not proceed; on the user's answer the phase resumes where it held -/
  | hold (g : Gate)
  | exit (e : Exit)

open Classical in
/-- Read when phase `p`'s work is complete. A judgment Phase 4 returns to Phase 3 is settled inside
    the apply pass, which then resumes (step 6): the phase stays `apply`. -/
noncomputable def next (sources : List Source) (s : Session) (p : Phase) : Step :=
  if UserEnds s then .exit (exitAs sources s)
  else
    match pending s p with
    | some g => .hold g
    | none =>
      match p with
      | .enter  => .go .obtain
      | .obtain => .go .verify
      | .verify => .go .settle
      | .settle =>
        if RootResolved sources s then .exit (exitAs sources s)
        else if RepairOwed s then .go .apply
        else .go .decide
      | .apply  => .go .decide
      | .decide => if Converged sources s then .exit .converged else .go .obtain

end ReviewLoop
```

## Rules

### Phase 0 — Set the invocation and its ground

1. Settle the sources as `entry` has it.
2. Resolve explicit or current-branch PR scope; otherwise use the working tree.
   Capture the resolved diff base SHA and changed-file list. For working-tree scope,
   include staged, unstaged, and recursively enumerated untracked paths, and retain
   the captured `HEAD` as base even after loop commits. No changes means ask what to
   review and stop. For a PR, read [PR scope](references/pr-scope.md) **before the
   first review** for checkout and base preparation, and again before repairs for landing.
3. For PR repairs, relay an already-settled `head` or `stacked` landing, including a
   stated standing practice. State the reading and its basis. When unsettled, proceed
   with read-only review and finding disposition; ask before the first repair.
   Silence at that gate stops repairs. Hold the settled landing for this invocation
   while keeping the captured review base. An invocation ending without repairs
   needs no landing choice.
   A correction before repairs are committed replaces a misread designation; after
   commits, show what landed where and stop for recovery direction. A deliberately
   different settled landing belongs to a new invocation.
4. Harvest intent for the changed surface: applicable rules, project-guide rationale,
   adjacent design comments, and relevant context already at hand. Resolve the project's
   goal and authority order from its own declarations; report what the search did not
   find. Convey repository material as
   pointers. Convey loop-constituted design decisions as content with their constitutive
   basis, keeping the user's words where they establish direction. Only decisions
   holding independently of current code state enter this design-decision ledger; a
   revised decision supersedes its predecessor, with the retirement on the trace.
5. **Preserve reviewer independence.** Convey design intent, allowing the reviewer to
   challenge defects that intent causes. Keep fix-status claims, dispositions,
   do-not-reflag instructions, shared-cause hypotheses, and Phase 3 split-consult
   answers out of reviewer context and out of surfaces harvested into it. Calibrate
   source severity by actual consequence against the mission: silent wrong results are
   critical, broken runtime behavior high, edge-condition failures medium, and
   consistency-only discrepancies low/suggestion; a convention-explained wording
   preference is not a defect.
6. Announce once that the user may end the loop at any time, receiving the trace and an
   optional offer to record what outlives it.

### Phase 1 — Obtain the round's reviews

Use the selected host route and source adapter with the captured pointer and current
intent bundle. Several designated sources review that same pointer in parallel, each in
its own context; the round's findings are their union, each keeping its source.

Use each source's first read-only review call to confirm its command and contract
through startup, any skill expansion, and returned output. When execution contradicts
the expected contract, diagnose that mismatch; unresolved source or scope mismatches
contribute no verdict and follow the incomplete-call rule.

A call ending without a usable review contributes no verdict and satisfies neither
convergence arm. Show what returned and ask whether to continue this round without that
source's review, switch source, or stop. A failure that persists makes the source
unavailable under Phase 0 rule 1, where its designation is settled. An extraction
failure calls for inspecting raw output; it does not prove source failure. A capable
source omitting reach leaves the missing report visible as residual.

### Phase 2 — Verify and attribute

Invoke `/inquire` — the skill call itself, for every finding however plain it looks — on
each finding against the current artifact before acting. `Refuted` is read from it; each
survivor then takes its `provenance`.

### Phase 3 — Read the cause and settle disposition

Once per round, examine the artifact against the project's stated goal, even when
the source found nothing. Name the goal and consequence behind any additional finding,
verify it through Phase 2, and include it in classification. Record an empty goal
reading too; omit this pass only where no declared goal was found.

Where one designated source's review this round leaves that source `Clear` and another's
new findings survive verification, consult across that split before reading the set: ask
the source still holding findings what in the artifact would turn its verdict to
approve, and give those findings to the converged source to adjudicate, withholding the
loop's dispositions from both. A consult is not a review. Its answers are material that
Phase 2 and this reading weigh, never a verdict or a vote for either side.

Read the verified set for a shared mechanism, competing explanations, unexplained
findings, and a falsifier. A source direction is one candidate, reconsidered after
verification; agreement with the loop's reading is not independent corroboration.
Materially different root and local repairs are a plan-level judgment even when each
isolated fix looks mechanical.

A shared-cause reading may direct repair only while its falsifier holds off. It neither
drops findings nor becomes constituted design intent. Recheck the falsifier when the
surviving set changes or a repair lands; retire a defeated reading and reclassify
unlanded work. Across rounds, compare new findings with prior fix predicates on the
trace: a previously matching site missed by a sweep calls for completing the
enumeration; an instance outside that predicate calls for reconsidering the abstraction.
A later-created or newly matching site does not falsify an earlier sweep.

Where `RootResolved` holds on that reading, the loop ends there.

`handling` settles each surviving finding.

Reopen only a genuinely live competing judgment. Packaging an identical mechanical fix
does not reopen disposition.

For conflicting governing surfaces, cite an applicable declared authority order or
settled direction to identify what governs. That settles direction, not repair shape
or execution permission. Where direction remains unsettled or its authority is
contested, show both surfaces, their disagreement, and their authority relation or
its absence; ask an open-ended direction question and retain the user's words.

Where findings pull one clause or invariant in opposite directions and nothing
governing decides between them, the clause holds a judgment the governing surfaces
leave open: a Judgment gate showing both readings and any repair already landed in
one direction, not a repair either reading settles.

Read every repair as an ablation before classifying it. A finding grounds a repair
through the consequence it verified; a finding that shows only something unstated
grounds none and is dropped on that basis. The repair is the least text that resolves
that consequence and loses no other obligation — an existing carrier before a new one,
a removal before an addition — and that reading is a recommendation, not the
disposition.

**Recurrence:** identify the same defect by clause/invariant, not phrasing or line.
An initial uninformed return is absorbed by settled policy. Instance-specific
dismissals/deferrals never enter reviewer context, so their returns keep that
disposition and remain residual. A return after a fix was visible or a constituted
decision conveyed requires diagnosis before convergence. A still-self-evident
incomplete repair stays Mechanical and is rewritten in the next apply pass with the
recurrence history in its hand-off. A
contested design decision reaches a judgment gate with the recurrence history;
a third recurrence after the escalated re-apply discredits the Mechanical diagnosis
and also gates. End recurrence through repair or constituted direction, not reviewer
suppression.

Read trajectory from recurrence, causes, and base provenance, not finding-count
trends. Separate introduced, fix-induced, and pre-existing-side work when deciding
what this unit carries. A rising count changes neither the criterion nor source scope.

### Phase 4 — Apply and check the bundle

For PR scope, follow [PR scope](references/pr-scope.md) before the first edit.

The driving session settles disposition and hands the apply pass to the writer `route`
names; the host reference (for Claude Code, [Claude Code](references/host-claude-code.md)
§ Writer fork) names the fork mechanism.

A writer returns to the driving session whenever it stops — at a gate it cannot
settle, before step 4's `/contextualize` call, after which it is resumed with the
sheet, or at the end of the pass — carrying what Trace and Exit requires of the pass
so far, so the driving session records rather than re-derives it.

1. The scan holder scans planned change points, adjacent interactions, and repeated
   instances. Derive each fix's predicate from the violated invariant and verified
   cause. Trace relevant state through production, transfer, invalidation, and
   consumption, including transitions and interleavings; where a repair changes what
   reaches whom, the consumers are every recipient of that delivery, with its absence
   paths, not only the recipient the finding names. Enumerate the predicate's sites.
   State the observation that would falsify the repair and select bounded checks from
   it. Return a live judgment about consistency or evidence support to Phase 3 before
   its dependent repair. Semantically verify and risk-screen every site before writing
   it; a new unscreened site returns for screening. Sweep matching sites in this apply
   pass within the settled scope, reporting expansion.
2. Risk is separate from Mechanical/Judgment classification. Route substrate actions
   to host permissions; an unsettled epistemic risk goes to the user for apply, defer,
   or drop. Rejection blocks an edit not yet written.
3. Repeated fix-induced follow-ups across consecutive rounds, or findings under one
   supported shared-cause reading that recur across rounds while their repairs keep
   adding case handling, move
   judgment, not writing: the next apply pass returns its enumerated predicate and sites
   to Phase 3 before writing. For fix-induced follow-ups, Phase 3 reads whether those
   repairs have become a chain in which
   each answers a problem the previous addition created rather than the original
   finding's subject. Such a chain suggests the first addition computed what the
   contract leaves to judgment; removing that surrogate with the machinery grown around
   it, against adding the next case, is the plan-level root-or-local judgment. For a
   recurring shared cause, narrowing the artifact's declared input domain or premises so
   the cause falls outside the contract stands against the next repair, and against
   the reconsidered abstraction Phase 3 calls for, in that same judgment. Return to
   autonomous apply after a review without either pattern.
4. Read every written and swept site against its disposition and exercise the repaired
   invariant through the transitions, orderings and recipients identified by the scan,
   absence paths included; a check offered as a guard shows that it rejects the failure
   it names. Repair a known discrepancy within the settled disposition and re-check the
   affected bundle before hand-forward; a live judgment returns to Phase 3. Record
   unavailable checks with their reason and consequence for confidence. The driving
   session invokes `/contextualize` — the skill call itself, however small the bundle —
   once on the whole applied bundle against the design-decision ledger and
   touched-surface conventions.
5. An adaptation that `/contextualize` actually writes re-enters scan, site screening,
   sweep, and write verification once. What its sheet hands back as the user's returns
   to Phase 3 as a Judgment item, with the handling the sheet proposed.
   Reconcile an already-written adaptation with its settled disposition before hand-forward.
   A self-evident repair stays within that disposition; a competing repair or a live
   judgment about evidence support returns to Phase 3 with the current artifact and
   consequences. A defer or drop verdict states whether the landed effect remains and
   its authorized basis; the verdict alone does not authorize retaining it. After
   reconciliation and checks, including explicit unavailable-check limits, the writer
   commits to the settled landing for PR scope and pushes where that landing has a
   remote, then returns.
6. After a judgment returned to Phase 3 is settled, resume the pending step in the
   same apply pass with that answer.

### Phase 5 — Re-review and stop on evidence

When the processed round has not earned convergence below, refresh changed files and
design intent and obtain a **full** re-review from each designated source, including
after dispositions that landed no edit. For PR scope, use the re-review pointer supplied
by [PR scope](references/pr-scope.md). Where the ledger convention puts a repair's
derivation in its commit message, that message is a fix-status claim under Phase 0 rule
5: point the re-review at the ledger through the pre-repair range only, and state that
the repair commits are judged from their content in the diff as part of the whole range.

These reviews are the next round's: Phase 1's rules for parallel sources and failed
calls apply to them, and their findings and direction go straight to Phase 2. Converge
only where `Converged` holds.

Unreached axes, missing reach reports, open deferrals, and explicitly retained
adaptation effects remain residual; they do not themselves force another round and are
never reported as clearance.

The user may exit at any point; an external interruption supplies no convergence
evidence.

## Trace and Exit

Present each round's trace and continue without a gate:

```
Round k — host / source / route — reviewed base → head or working-tree state — verdict
Exercised: source-reported reach and gaps (omit for a standing no-channel source)
Call: observed settings or diagnostics, when present
Goal: loop's goal reading and its findings, including none (omit if no declared goal)
Roots: Phase 3 shared-cause reading — each shared cause with the findings it explains, or none; any split consult with its question and answer
Relay: autonomously dispositioned findings → applied | dropped: basis | carried: reason
Gated: findings requiring user judgment → applied | dropped: basis | carried: reason
Apply: writer route (fork | brief | inline) → commits or new head, or tree state (omit if no pass ran)
Landing: repair destination (PR only)
```

Each verified finding carries base provenance; an applied fix also carries its predicate
and sweep side effects. Carry the loop's check artifact, evidence, unexercised limits,
and unavailable-check reasons with that repair's Relay/Gated entry; keep this loop-side
evidence distinct from the source-reported `Exercised` line. Assign exactly one
Relay/Gated home by whether the user was asked, including epistemic risk gates. Record
the fit pass as its own entry, with adaptation, any retroactive rejecting verdict, and
the resulting artifact state and disposition. Preserve write discrepancies and their
reconciliation; carried reasons are records, while subsequent reviews detect findings
fresh.

At every exit, present the accumulated dispositions and residual,
including standing source limits. Read [exit handover](references/exit-handover.md)
before offering durable recording.
