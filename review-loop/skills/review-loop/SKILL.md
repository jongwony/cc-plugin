---
name: review-loop
description: "Review-resolve loop over a change and its governing surfaces. Verifies each finding against the codebase and the base it is measured from, applies the repairs whose direction is settled, and re-reviews until a round adds none, handing what only the user can decide back as decisions."
skills:
  - aitesis:inquire
  - epharmoge:contextualize
---

# Review Loop

## Driving session

The loop runs in a session of its own, apart from the session that started it, which
reads the driving host's reference before starting it; that reference names how the session
is started. That session is the driving session. The
session that started it stands where the user stands: each
gate's question and the exit presentation go to it as a message, the turn ends at a gate,
and its reply is read as the user's answer; where a decision or a gate takes the user's own
answer, that reply carries their words. A person who drives the loop directly is
addressed directly.

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

A host not listed supplies its own reference from its own surface, covering what a listed
reference covers, and that reference is read in its place. A source it does not cover is
unavailable under Phase 0 rule 1, and a writer route it does not name is the Lean block's
`Delegation.none`. With no driving session named, the loop runs where it was started and is
addressed directly; with no split-consult context named, the consult is unavailable and is
recorded as residual.

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
Ask as well whether that contract still closes once merging puts the change into a
running system: work already in flight under the old definition, the order its parts
roll out in, and state the running system holds that the diff does not show. A source
names in `exercised`, as not reached, each fact this rests on that it could not
establish — whether merging deploys the change, or running state it could not read.
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
The block reads the sources that `entry` and the user's turns establish, and fixes how a
surviving finding is handled, which writer route an apply pass takes, and when the loop ends. The order of the phases, where the
loop holds for the user, and how it resumes are the rules below.
-/

namespace ReviewLoop

/-- The session as it stands: the invocation, the user's turns, each source's returns, the
    captured base, the design-decision ledger, and the trace. -/
axiom Session : Type

/-- A reviewer, by the name the host knows it under. -/
abbrev Source := String

/-- The sources a round owes reviews from. It holds at least one source by construction. -/
structure Sources where
  first : Source
  rest  : List Source

def Sources.toList (d : Sources) : List Source := d.first :: d.rest

/-- A finding a source reported, or one the loop's own goal reading or fit pass added. -/
structure Finding where
  source : Source
  site   : String
  claim  : String

/-! ── ENTRY ── -/

/-- How Phase 0 reads the sources. -/
inductive Entry
  | use (d : Sources)
  /-- the one invokable source, said as relayed -/
  | relay (s : Source)
  /-- a gate: the invokable sources with their actual coverage, cost and reporting limits and no
      default; or why a designated source is unavailable, with making it available, an available
      alternative, or stopping — the designation retained until that is settled -/
  | ask
  /-- the loop stops before any review, naming the missing capability -/
  | missing

/-- `designated`: the names of the sources this invocation designates; an effort level designated
    for a source travels with it to its adapter and is not compared here. `invokable`: what the
    host can run now. -/
def entry (designated invokable : List Source) : Entry :=
  match designated, invokable with
  | [], []      => .missing
  | [], [s]     => .relay s
  | [], _       => .ask
  | d :: ds, _  => if (d :: ds).all invokable.contains then .use ⟨d, ds⟩ else .ask

/-- **Your reading**: the sources in force — those `entry` settled (`Entry.use`'s, or the one
    `Entry.relay` names, or the user's answer to `Entry.ask`), as a later turn of the user's has
    replaced them: a switch offered when a call ended without a usable review, or a correction of
    the designation. Continuing a round without a failed source's review leaves that source in
    force. `none` while no designation exists: `entry` gave `Entry.missing`, or at the initial
    selection no answer to `Entry.ask` has yet named a source. An established designation stays
    in force until a turn of the user's changes it, a sources gate raised later included. -/
axiom inForce : Session → Option Sources

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
    user's prior direction, the PR's purpose, a governing rule the Phase 0 harvest found, or
    citable precedent — or `none`. A ground that settles `applied` settles that the finding is
    repaired; it settles the repair's shape and its scope only where it says so, and `classOf`
    and `Licensed` read what it leaves. -/
axiom settled : Session → Finding → Option Disposition

inductive Class
  /-- Extension: a verified bug with a self-evident localized fix, or another deterministic edit
      whose plausible shapes do not materially diverge -/
  | mechanical
  /-- Constitution: materially different repair trajectories (withholding a whole carrier, where
      another repair keeps part of what it delivers, is one), unresolved design trade-offs,
      unentrusted scope/risk decisions, a repair that rests on a value only the user holds, or a
      repair whose Mechanical diagnosis a recurrence after its diagnosed rewrite has discredited -/
  | judgment

/-- **Your judgment** of a surviving finding that is to be repaired or whose disposition nothing
    cited settles: whether a repair choice is still live once what `settled` gives is taken as
    fixed. -/
axiom classOf : Session → Finding → Class

/-- **Your judgment**: a citable scope license — the user's direction, the purpose, a mandated
    sweep, or settled precedent — takes the repair of this pre-existing-side defect into this
    unit. -/
axiom Licensed : Session → Finding → Prop

/-- What Phase 3 does with one surviving finding. -/
inductive Handling
  /-- relayed with its basis, recording side effects; no question -/
  | relay (d : Disposition)
  /-- applied and reported with its basis — the cited ground where one settled it — without a
      decision -/
  | apply
  /-- a decision for the user, recorded with its consequence and whether it blocks the merge, and
      left open and unrepaired — not yet a disposition; no further repair is written and one
      already landed stays as it is; the loop neither picks a side nor repeats the fix, and goes
      on with what is settled. The user's answer, a scope answer included, sets
      the disposition recorded. -/
  | decide

open Classical in
/-- A settled drop or carry is relayed. Every other finding is repaired or decided on what is
    still live in it and on whether its side is in scope, whether or not a ground settled that it
    is repaired. -/
noncomputable def handling (s : Session) (f : Finding) : Handling :=
  match settled s f with
  | some .dropped => .relay .dropped
  | some .carried => .relay .carried
  | _ =>
    match classOf s f, (provenance s f).side with
    | .judgment, _              => .decide
    | .mechanical, .ofChange    => .apply
    | .mechanical, .preExisting => if Licensed s f then .apply else .decide

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

/-- Who scans the planned change points and enumerates the predicate's sites in Phase 4. -/
def scanHolder : Route → Actor
  | .fork => .delegate
  | _     => .drivingSession

/-- Who checks the written sites and reconciles the fit pass's result in Phase 4. -/
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

/-- **Your reading**: the trace records the latest round's goal reading of the current reviewed
    artifact against the project's stated goal, an empty reading included; or no declared goal
    was found. -/
axiom GoalRead : Session → Prop

/-- **Your reading**, for one source, of its usable return in the latest round: on that round's
    full review of the current reviewed artifact, as `FullyReviewed` reads it, it returned
    `approve` or zero new non-refuted findings. A return from an earlier round does not
    count, even on the same artifact. A finding is new in its
    discovery review even when deferred or handed over; its later return is not new and
    preserves the disposition. -/
axiom Clear : Session → Source → Prop

/-- **Your reading**: this source's usable return in the latest round is a full review of the
    current reviewed artifact, whether the round's first review or a re-review: one whose reach
    covered that artifact. -/
axiom FullyReviewed : Session → Source → Prop

/-- **Your reading**: the latest round, on the current reviewed artifact, left no repair that is
    settled and writable now unwritten, whether `handling` gave it `Handling.apply` or a user's
    answer settled it. A repair whose shape is still open, or whose sites wait on an open
    decision, is not writable now and stays with that decision. -/
axiom NoSettledRepair : Session → Prop

/-- **Your reading**: every surfaced finding is dispositioned or left open as a decision
    (`Handling.decide`). -/
axiom AllHandled : Session → Prop

/-- What every end the loop reaches on its own shares, on the current reviewed artifact: no
    recurrence awaits diagnosis, no edit has landed since the latest review, the goal reading is
    on the trace, and no settled repair is left to write. -/
def Ended (s : Session) : Prop :=
  ¬ RecurrencePending s ∧ ¬ EditedSinceReview s ∧ GoalRead s ∧ NoSettledRepair s

/-- Convergence holds only of the current reviewed artifact, and only through reviews every source
    in force owes; before any designation exists there is nothing to converge on. -/
def Converged (s : Session) : Prop :=
  match inForce s with
  | none   => False
  | some d => Ended s ∧ AllDispositioned s ∧ ∀ x ∈ d.toList, Clear s x

/-- The loop has done what review can settle: a completed round on the current reviewed artifact,
    with a full review from every source in force, added no further settled repair. What is
    left is the user's to decide; every source converging is not required. -/
def Settled (s : Session) : Prop :=
  match inForce s with
  | none   => False
  | some d => Ended s ∧ AllHandled s ∧ ∀ x ∈ d.toList, FullyReviewed s x

inductive Exit
  | converged
  /-- not convergence: the loop ends with its decisions handed to the user -/
  | settled
  /-- reported as non-convergence, with the latest reviewed artifact, later edits, unfinished
      repairs, residuals, and retained decisions -/
  | notConverged

open Classical in
/-- How any exit is reported: the user's, a stop, or Phase 5's. An
    exit before any designation exists, at `Entry.missing` or at the first sources gate, is
    reported as `Exit.notConverged`. -/
noncomputable def exitAs (s : Session) : Exit :=
  if Converged s then .converged else if Settled s then .settled else .notConverged

end ReviewLoop
```

## Rules

The phases run in order. A gate presents its question and ends the turn: silence settles
nothing, what waits on the gate does not proceed, and the user's answer resumes the work
where it held. A decision (`Handling.decide`) is not a gate: it is recorded, the round goes
on with what is settled, and the exit hands it over; an answer that arrives earlier is
carried out on the next apply pass. A decision takes the user's own answer, carried in their
words, not the starting session's; a mechanical finding within this change's scope never
becomes one, since `handling` applies it.

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
intent bundle. Several sources in force review that same pointer in parallel, each in
its own context, except where the host reference orders a source; the round's findings are their union, each keeping its source.

Use each source's first review call to confirm its command and contract
through startup, any skill expansion, and returned output. When execution contradicts
the expected contract, diagnose that mismatch; unresolved source or scope mismatches
contribute no verdict and follow the incomplete-call rule.

Review is read-only. Where the host reference says a source's runtime cannot hold a
review read-only, that reference names the check that a call wrote nothing, the capture it
can restore from, and how that source is ordered beside the others. A call the check
catches ends without a usable review, and its presentation shows the change and asks
whether to restore within the incomplete-call question, as one question settled before any
further review call, Phase 2 verification, or apply pass.

A call ending without a usable review contributes no verdict and satisfies neither
`Converged` nor `Settled`. Show what returned and ask whether to continue this round without that
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

Where one in-force source's review this round leaves that source `Clear` and another's
new findings survive verification, consult across that split before reading the set: ask
the source still holding findings what in the artifact would turn its verdict to
approve, and give those findings to the converged source to adjudicate, withholding the
loop's dispositions from both. A consult is not a review. Its answers are material that
Phase 2 and this reading weigh, never a verdict or a vote for either side. A finding that
survives the consult goes to `handling` like any other; where the consult and verification
leave its repair direction open, it reads as `judgment` there and becomes a decision, not a
side the loop picks.

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

`handling` settles each surviving finding.

Reopen only a genuinely live competing judgment. Packaging an identical mechanical fix
does not reopen disposition.

For conflicting governing surfaces, cite an applicable declared authority order or
settled direction to identify what governs. That settles direction, not repair shape
or execution permission. Where direction remains unsettled or its authority is
contested, record a decision showing both surfaces, their disagreement, and their
authority relation or its absence, put as an open-ended direction question; retain the
user's words when they answer.

Where findings pull one clause or invariant in opposite directions and nothing
governing decides between them, the clause holds a judgment the governing surfaces
leave open: a decision showing both readings and any repair already landed in
one direction, not a repair either reading settles.

Each decision carries its consequence — who would act on the wrong answer, how soon,
and what could take it back — and whether it blocks the merge: it does where merging with
that wrong answer would carry it to the running service, its users, or the sessions that
load a changed rule or skill.

Read every repair as an ablation before classifying it. A finding grounds a repair
through the consequence it verified; a finding that shows only something unstated
grounds none and is dropped on that basis. The repair is the least text that resolves
that consequence and loses no other obligation — an existing carrier before a new one,
a removal before an addition — and that reading is a recommendation, not the
disposition. Before classifying a repair that closes one path, read it across the paths
under the same cause: where it adds a case, conjunct or guard to a definition or a rule
so that a judgment holds on that path, and the same judgment must hold on every path
reaching the same end, the repair is that judgment placed once where every path passes,
with the cases standing in for it removed — or, its alternative, the declared input
domain or premises narrowed so the cause falls outside the contract. Unless a citable ground already settles
where that judgment goes, either way it is a plan-level Judgment item, not Mechanical.

**Recurrence:** identify the same defect by clause/invariant, not phrasing or line.
An initial uninformed return is absorbed by settled policy. Instance-specific
dismissals/deferrals never enter reviewer context, so their returns keep that
disposition and remain residual. A return after a fix was visible or a constituted
decision conveyed requires diagnosis before the loop ends. A still-self-evident
incomplete repair stays Mechanical and is rewritten once in the next apply pass with
the recurrence history in its hand-off; a recurrence after that diagnosed rewrite
discredits the Mechanical diagnosis and becomes a decision, showing the repair already
landed and judging its consequence and merge-blocking flag with that repair in place, and
the loop does not repeat the fix. A contested design decision becomes a decision with the
recurrence history.
End recurrence through repair or constituted direction, not reviewer suppression.

Read trajectory from recurrence, causes, and base provenance, not finding-count
trends. Separate introduced, fix-induced, and pre-existing-side work when deciding
what this unit carries. A rising count changes neither the criterion nor source scope.

### Phase 4 — Apply and check the bundle

An apply pass runs where the settled dispositions leave a repair to write; otherwise the
round goes to Phase 5.

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
   or drop, and takes the user's own answer, as a decision does.
   Rejection blocks an edit not yet written.
3. Repeated fix-induced follow-ups across consecutive rounds move judgment, not
   writing: the next apply pass returns its enumerated predicate and sites to Phase 3
   before writing. Phase 3 reads whether those repairs have become a chain in which
   each answers a problem the previous addition created rather than the original
   finding's subject. Such a chain suggests the first addition computed what the
   contract leaves to judgment; removing that surrogate with the machinery grown around
   it, against adding the next case, is the plan-level root-or-local judgment. Return to
   autonomous apply after a review without that pattern.
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
   to Phase 3, where `handling` reads it; a decision it becomes carries the handling the
   sheet proposed.
   Reconcile an already-written adaptation with its settled disposition before hand-forward.
   A self-evident repair stays within that disposition; a competing repair or a live
   judgment about evidence support returns to Phase 3 with the current artifact and
   consequences. A defer or drop verdict states whether the landed effect remains and
   its authorized basis; the verdict alone does not authorize retaining it. Where the
   evidence and the user's direction leave what becomes of the landed effect genuinely
   open, this step holds on one question to the user, whether that effect stays in this
   unit; the answer, the user's own as for a decision, resumes the
   step, and an invocation that ends at that gate reports the effect as unresolved. Where either outcome is settled, reconcile the artifact to it and
   check it. After
   reconciliation and checks, including explicit unavailable-check limits, the writer
   commits to the settled landing for PR scope and pushes where that landing has a
   remote, then returns.
6. After a judgment returned to Phase 3 is settled, resume the pending step in the
   same apply pass with that answer. Where Phase 3 records it as a decision instead, its
   dependent repair is carried unrepaired with it, and the pending step resumes on the
   sites that do not depend on it.

### Phase 5 — Re-review and stop on evidence

When the processed round has not reached an end below, a settled repair still unwritten
goes to Phase 4 first; then refresh changed files and
design intent and obtain a **full** re-review from each source in force, including
after dispositions that landed no edit. For PR scope, use the re-review pointer supplied
by [PR scope](references/pr-scope.md). Where the ledger convention puts a repair's
derivation in its commit message, that message is a fix-status claim under Phase 0 rule
5: point the re-review at the ledger through the pre-repair range only, and state that
the repair commits are judged from their content in the diff as part of the whole range.

These reviews are the next round's: Phase 1's rules for parallel sources and failed
calls apply to them, and their findings and direction go straight to Phase 2. End where
`Converged` holds, or where `Settled` holds. The loop
never merges; the session that started it reads the exit's merge-blocking decisions before
it does.

Unreached axes, missing reach reports, open deferrals, and explicitly retained
adaptation effects remain residual; they do not themselves force another round and are
never reported as clearance.

An external interruption supplies no convergence evidence.

## Trace and Exit

Present each round's trace and continue without a gate:

```
Round k — host / source / route — reviewed base → head or working-tree state — verdict
Exercised: source-reported reach and gaps (omit for a standing no-channel source)
Call: observed settings or diagnostics, when present
Goal: loop's goal reading and its findings, including none (omit if no declared goal)
Roots: Phase 3 shared-cause reading — each shared cause with the findings it explains, or none; any split consult with its question and answer
Relay: autonomously dispositioned findings → applied | dropped: basis | carried: reason
Gated: findings a gate put to the user → applied | dropped: basis | carried: reason
Decisions: findings recorded for the user → consequence, blocks the merge or not; answered → applied | dropped: basis | carried: reason
Apply: writer route (fork | brief | inline) → commits or new head, or tree state (omit if no pass ran)
Landing: repair destination (PR only)
```

Each verified finding carries base provenance; an applied fix also carries its predicate
and sweep side effects. Carry the loop's check artifact, evidence, unexercised limits,
and unavailable-check reasons with that repair's Relay/Gated/Decisions entry; keep this loop-side
evidence distinct from the source-reported `Exercised` line. Assign exactly one
Relay/Gated/Decisions home: Gated where a gate asked the user, epistemic risk gates
included; Decisions where `handling` recorded one, a later Phase 4 gate's answer
included. Record the fit pass as its own entry, with adaptation, any retroactive rejecting verdict, and
the resulting artifact state and disposition. Preserve write discrepancies and their
reconciliation; carried reasons are records, while subsequent reviews detect findings
fresh.

At every exit, present the exit as `exitAs` reads it, what ended it — the loop's own end, the
user's stop, or an outside interruption — and, where a review ran, the reviewed head (or
working-tree state) and the sources in force, the open decisions heaviest consequence first
with those that block the merge marked — each decision's consequence and merge-blocking flag
judged afresh on the final reviewed artifact — and the accumulated dispositions and residual,
including standing source limits. Read [exit handover](references/exit-handover.md) before
offering durable recording.
