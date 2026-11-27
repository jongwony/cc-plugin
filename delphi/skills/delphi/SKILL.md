---
name: delphi
description: "User-invoked via /delphi. A Delphi-style consult on a draft decision: two advisors from other vendors answer one read-only brief, the facilitator verifies the premises their answers lean on and applies what verification settles, the user decides user-held values and open splits, and the same advisor sessions are resumed with only what changed until a round on the current brief brings no new grounded objection."
---

# Delphi

## Caller Signature

```
/delphi [decision?]

decision : what is about to be committed, and the current draft — read from the session when not given
panel    : two advisors, by default Codex (codex-plus) and Antigravity (agy-plus)
```

Each advisor runs through its own plugin; that plugin and the delegation rule in force choose its model within the bound below, its effort and flags, keep its session resumable, and say how it reaches files outside its working directory. Each seat is one session on one model from its own vendor — a Gemini model for Antigravity — resumed every round, where its plugin would otherwise run several models in parallel.

## Procedure

- **Brief.** One brief, identical for both seats, written as a consult per stint `references/prompting.md`: the reviewing role and that it changes no file, the decision, the settled constraints, the current draft, entry points to the evidence, and what would change the answer. Every path the brief names is a plain file each advisor can read without running a command; content reached only through a command, such as `git show`, is saved to a file first. The first brief is number 1, and every brief sent after it, a delta brief included, takes the next number.
- **Dispatch.** Both seats run in parallel. Record each seat's session id, and keep each of its answers verbatim, one file per round — saved by the facilitator where the seat's plugin returns the answer as text; every later round resumes that session.
- **Read.** Read each answer whole, in its own words. Only an answer that evaluates the brief is recorded as the seat's `Answer`; a reply that asks for clarification or refuses is recorded as none. A run that failed outright — a nonzero exit, an agy `ERROR` — is not retried: it goes to the user as its plugin's error handling directs. A seat that has not `answered` (Lean block), or whose run its plugin reports incomplete, is run once more on the current brief by resuming the same session; failing again, it goes to the user.
- **Verify.** Check the factual premises each answer leans on — those of its objections and those of its endorsement — against their primary sources, one premise at a time: two answers agreeing are two claims, not a check.
- **Dispose.** Each objection's point takes one route, with its provenance recorded beside it:
  - a point that turns only on a value the user holds goes to the user without verification;
  - a point resting on factual premises drops each premise verification refutes; what remains goes to the user where it turns on a value the user holds, and is applied where it holds and no such value is left;
  - a point raised and disposed of before, coming with no new evidence or failure condition, keeps its earlier disposition — an unanswered referral stays open, and this is not a refuted drop;
  - a premise the answers share that verification refutes: where only an endorsement's reason fails and the draft is right, the assessment is corrected; where the draft is wrong and the fix is factual, the draft is repaired, which makes a new current brief; where the fix turns on the user's choice, it goes to the user and the round is not `roundClear`;
  - a premise that cannot be verified goes to the user with the choice it bears on;
  - a split that survives verification — two grounded positions recommending opposite options — gives the user the alternatives and the trade-off; the facilitator picks neither.
- **Hand over.** Present the revised draft, what was applied and on what ground, and each item routed to the user with its reason and what verification found of its premises — the items, not the seats' raw answers; where an item is routed to the user, stop for their answer. The user's decisions become the next brief's `Decision`s.
- **Stop.** End where `stop` holds on the current brief, or where the user ends it, and hand over the `exit`. A factual repair of the draft, or new context bearing on the decision, makes a new current brief at the moment it is decided — before `stop` is read — so the round that found it does not stop on the old brief. Where the exit leaves items the user has not decided, it also gives each seat's raw-answer pointer — its answer files and its session id — for the user to open on demand.
- **Delta round.** Where `stop` does not hold, resume the same two sessions with a `DeltaBrief`. Its free text names no seat and counts no agreement either — no "you both", no tally, no repeated verdict.

The Lean block holds within one round; what spans rounds reaches it as parameters and judgments. Across rounds the prose holds: an item routed to the user that no answer of theirs has settled is carried into every later hand over, into each `DeltaBrief`'s open points and into the `exit`; a decided point goes to the seats as a `Decision`, not again as an open point.

## Lean

```lean
/-!
How to read this block. It is core Lean 4 and elaborates as written, and you are the model it is
written for: you read it, and by inference over the context you settle each element it leaves
open. Every `axiom` is one of those judgments — a black box to the contract, yours to make from
the material in front of you; its doc comment says what you judge there, and nothing in this
block decides it for you. Every `def`, `inductive`, and `structure` is fixed by the contract.
The block fixes what counts as an answer, what a disposition may read, what a delta brief can
carry, and when the consult stops. The routes an objection takes, the order of the steps and
where the run holds for the user are the procedure above.
-/

namespace Delphi

/-- The session as it stands: the decision, the briefs, every advisor answer, the user's turns,
    and what verification found. -/
axiom Session : Type

/-- The two seats of the panel. A seat is who answered; it travels with an objection only as
    its provenance. -/
inductive Seat
  | first
  | second
  deriving BEq, DecidableEq -- elab: lets provenance test membership

/-- What an advisor returned for one round: the number of the brief it answered, and its text.
    Only an answer the Read step judges to evaluate the brief is recorded as `some`; a reply that
    does not evaluate it — a request for clarification, a refusal — is `none`, as a missing one
    is. -/
structure Answer where
  brief : Nat
  text  : String

/-- An answer counts on the current brief only when it answers that brief and carries more than
    whitespace. -/
def answered (current : Nat) : Option Answer → Bool
  | some a => a.brief == current && !a.text.all Char.isWhitespace
  | none   => false

/-- An objection's content, apart from who raised it. The judgments below take a point, never
    the seats an objection lists. -/
structure Point where
  text : String

/-- An objection as raised in a round, one per distinct point: its content and every seat that
    raised it. -/
structure Objection where
  point   : Point
  sources : List Seat

/-- Recorded beside an objection; it is not evidence that the objection holds. -/
inductive Provenance
  | both
  | one

def provenance (o : Objection) : Provenance :=
  if o.sources.contains .first && o.sources.contains .second then .both else .one

/-- Why an item goes to the user. -/
inductive Reason
  | userValue
  | split
  | unverified

/-- Where an objection's point goes. `keepEarlier`: a repeat that keeps its earlier disposition,
    distinct from a refuted `drop`. -/
inductive Disposition
  | apply
  | drop
  | keepEarlier
  | toUser (r : Reason)

/-- **Your judgment**: the route the Dispose step gives the point, after this round's
    verification. -/
axiom dispose : Session → Point → Disposition

/-- **Your judgment**: the point keeps the consult open — it is new (not raised and disposed of
    before, or now carrying new evidence or a failure condition), its grounds hold at their
    primary sources, and it bears on the draft or on a decision the user made — judged after
    this round's verification of objection and endorsement premises. -/
axiom keepsOpen : Session → Point → Bool

/-- One round on one brief: the brief's number, each seat's answer, and the objections raised. -/
structure Round where
  brief      : Nat
  answers    : Seat → Option Answer
  objections : List Objection

def Round.complete (r : Round) : Bool :=
  answered r.brief (r.answers .first) && answered r.brief (r.answers .second)

/-- **Your judgment**, made after Read and Verify: both answers evaluate the brief, this round's
    verification of objection and endorsement premises is complete, and no choice that blocks
    closing is pending — the user's choice that a refuted premise's fix turns on. Items deferred
    to the user or left unverifiable, carried in `exit.toUser`, do not block it. -/
axiom roundClear : Session → Round → Bool

/-- `current`: the number of the brief now standing. The consult stops on a complete round on
    that brief that is `roundClear` and raised nothing that keeps it open. An incomplete round,
    a round on an earlier brief, or a round that is not `roundClear` never stops it. -/
noncomputable def stop (s : Session) (current : Nat) (r : Round) : Bool :=
  r.brief == current && r.complete && roundClear s r &&
    (r.objections.filter (fun o => keepsOpen s o.point)).isEmpty

/-- A user decision carried into the next brief: the choice, as a constraint. The facts it leans
    on are not part of it and stay open to objection. -/
structure Decision where
  choice : String

/-- What a resumed session receives. It has no field for a seat, a count, or a verdict: points
    travel without their provenance. `openPoints` are the open items as the prose carries them
    across rounds. What its free text may say is the Delta round step's. -/
structure DeltaBrief where
  changedWording : String
  newEvidence    : List String
  openPoints     : List Point
  decisions      : List Decision

/-- What the exit hands over: the items still open, each seat's raw-answer pointer where any item
    remains, and the claim. -/
structure Exit where
  toUser : List (Point × Reason)
  raw    : List (Seat × String)
  claim  : String

/-- `openItems`: the items still open, as the prose carries them across rounds. `rawAt`: where
    each seat's raw answers are kept — its answer files and its session id. The panel's claim is
    made only where the consult stopped; an exit the user called earlier says so instead. -/
noncomputable def exit (s : Session) (current : Nat) (r : Round) (openItems : List (Point × Reason))
    (rawAt : Seat → String) : Exit :=
  { toUser := openItems,
    raw := if openItems.isEmpty then [] else [(.first, rawAt .first), (.second, rawAt .second)],
    claim := if stop s current r
      then "this panel raised no new grounded objection to the current brief in this material"
      else "the consult ended before a round on the current brief stopped it" }

end Delphi
```
