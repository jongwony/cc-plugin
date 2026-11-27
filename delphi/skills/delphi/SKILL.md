---
name: delphi
description: "Delphi-style consult just before a consequential commitment — a direction, a design, a policy: one identical read-only brief goes to two advisors from other vendors, the facilitator verifies the grounds their answers lean on, applies what verification settles, hands splits and user-held values to the user, then resumes the same advisor sessions with only what changed until no new grounded objection appears. User-invoked via /delphi."
---

# Delphi

## Caller Signature

```
/delphi [decision?]

decision : what is about to be committed, and the current draft — read from the session when not given
panel    : two advisors, by default Codex (codex-plus) and Antigravity (agy-plus)
```

Each advisor runs through its own plugin; that plugin and the delegation rule in force choose its model, effort and flags, keep its session resumable, and say how it reaches files outside its working directory.

## Procedure

- **Brief.** One brief, identical for both seats, written as a consult per stint `references/prompting.md`: the reviewing role and that it changes no file, the decision, the settled constraints, the current draft, entry points to the evidence, and what would change the answer. Every path the brief names is one each advisor can read.
- **Dispatch.** Both seats run in parallel. Record each seat's session id; every later round resumes that session.
- **Read.** Read each answer whole, in its own words. A seat that has not `answered` (Lean block) — its run returned nothing, or it answered an earlier draft — is run again on the current draft before the round is processed.
- **Verify.** Check each objection's factual grounds against its primary source, the ones both answers lean on included: two answers agreeing are two claims, not a check.
- **Dispose.** Each objection goes where `dispose` sends it, with its `provenance` recorded beside it.
- **Hand over.** Present the revised draft, what was applied and on what ground, and each item routed to the user with its reason; then stop for the user's answer. The user's decisions become the next round's `Decision`s.
- **Delta round.** Resume the same two sessions with a `DeltaBrief`. Its free text names no seat and counts no agreement either — no "you both", no tally, no repeated verdict.
- **Stop.** End where `stop` holds, or where the user ends it, and hand over the `exit`.

## Lean

```lean
/-!
How to read this block. It is core Lean 4 and elaborates as written, and you are the model it is
written for: you read it, and by inference over the context you settle each element it leaves
open. Every `axiom` is one of those judgments — a black box to the contract, yours to make from
the material in front of you; its doc comment says what you judge there, and nothing in this
block decides it for you. Every `def`, `inductive`, and `structure` is fixed by the contract.
The block fixes what counts as an answer, where an objection goes, what a delta brief can carry,
and when the consult stops. The order of the steps and where the run holds for the user are the
procedure above.
-/

namespace Delphi

/-- The session as it stands: the decision, the drafts, every advisor answer, the user's turns,
    and what each objection's verification found. -/
axiom Session : Type

/-- The two seats of the panel. A seat is who answered; it travels with an objection only as
    its provenance. -/
inductive Seat
  | first
  | second
  deriving BEq, DecidableEq -- elab: lets provenance test membership

/-- What an advisor returned for one round: the draft it answered, by its round number, and its
    text as returned. -/
structure Answer where
  draft : Nat
  text  : String

/-- An answer counts on the current draft only when it answers that draft and carries more than
    whitespace. -/
def answered (current : Nat) : Option Answer → Bool
  | some a => a.draft == current && !a.text.all Char.isWhitespace
  | none   => false

/-- An objection's content, apart from who raised it. Every judgment below reads only this. -/
structure Point where
  text : String

/-- An objection as raised in a round: its content and the seats that raised it. -/
structure Objection where
  point   : Point
  sources : List Seat

/-- Recorded beside an objection; it is not evidence that the objection holds. -/
inductive Provenance
  | both
  | one

def provenance (o : Objection) : Provenance :=
  if o.sources.contains .first && o.sources.contains .second then .both else .one

/-- What verification against the primary source found for an objection's factual grounds. -/
inductive Verdict
  | holds
  | fails
  | unverifiable

/-- **Your judgment**: checking the point's factual grounds against their primary sources, not
    against the other advisor's answer. -/
axiom verified : Session → Point → Verdict

/-- **Your judgment**: the point turns on a value only the user holds — a cost they bear, a
    priority, a promise — so that no source can settle it. -/
axiom userHeld : Session → Point → Bool

/-- **Your judgment**: the advisors take opposed positions on the point and verification of the
    grounds leaves the choice between them open. -/
axiom split : Session → Point → Bool

/-- **Your judgment**: the point, were it acted on, would change the draft or a decision the user
    made. -/
axiom bears : Session → Point → Bool

/-- **Your judgment**: the point was not raised and disposed of in an earlier round, or it was and
    now comes with new evidence or a failure condition it lacked then. -/
axiom isNew : Session → Point → Bool

/-- Why an item goes to the user. -/
inductive Reason
  | userValue
  | split
  | unverified

/-- Where an objection goes. `apply` and `drop` are the facilitator's; `toUser` is not. -/
inductive Disposition
  | apply
  | drop
  | toUser (r : Reason)

def Disposition.settledByFacilitator : Disposition → Bool
  | .apply    => true
  | .drop     => true
  | .toUser _ => false

/-- A verified point applies whichever seats raised it; a point verification refutes is dropped;
    a user-held value, a split verification leaves open, and an unverifiable ground go to the
    user. -/
noncomputable def disposePoint (s : Session) (p : Point) : Disposition :=
  if userHeld s p then .toUser .userValue
  else match verified s p with
    | .fails        => .drop
    | .unverifiable => .toUser .unverified
    | .holds        => if split s p then .toUser .split else .apply

noncomputable def dispose (s : Session) (o : Objection) : Disposition :=
  disposePoint s o.point

/-- One round on one draft: the draft's number, each seat's answer, and the objections raised. -/
structure Round where
  draft      : Nat
  answers    : Seat → Option Answer
  objections : List Objection

def Round.complete (r : Round) : Bool :=
  answered r.draft (r.answers .first) && answered r.draft (r.answers .second)

/-- An objection that keeps the consult open: new, verified, and bearing on the draft or a
    decision. -/
noncomputable def keepsOpen (s : Session) (o : Objection) : Bool :=
  isNew s o.point &&
    (match verified s o.point with | .holds => true | _ => false) &&
    bears s o.point

/-- The consult stops on a complete round that raised nothing that keeps it open. An incomplete
    round never stops it. -/
noncomputable def stop (s : Session) (r : Round) : Bool :=
  r.complete && (r.objections.filter (keepsOpen s)).isEmpty

/-- A user decision carried into the next round: the choice, as a constraint. The facts it leans
    on are not part of it and stay open to objection. -/
structure Decision where
  choice : String

/-- What a resumed session receives. It has no field for a seat, a count, or a verdict: points
    travel without their provenance, so the brief cannot say who raised what or how many agreed. -/
structure DeltaBrief where
  changedWording : String
  newEvidence    : List String
  openPoints     : List Point
  decisions      : List Decision

noncomputable def delta (s : Session) (r : Round) (changedWording : String) (newEvidence : List String)
    (decisions : List Decision) : DeltaBrief :=
  { changedWording, newEvidence, decisions,
    openPoints := (r.objections.filter fun o =>
      match dispose s o with | .toUser _ => true | _ => false).map (·.point) }

/-- What the exit hands over. -/
structure Exit where
  toUser : List (Point × Reason)
  claim  : String

noncomputable def exit (s : Session) (r : Round) : Exit :=
  { toUser := r.objections.filterMap fun o =>
      match dispose s o with | .toUser why => some (o.point, why) | _ => none,
    claim := "this panel found no further objection in this material" }

end Delphi
```
