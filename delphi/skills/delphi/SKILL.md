---
name: delphi
description: "User-invoked via /delphi. A Delphi-style consult on a draft decision: two advisors from other vendors answer one read-only brief, the facilitator verifies the grounds their answers lean on and applies what verification settles, the user decides user-held values and open splits, and the same advisor sessions are resumed with only what changed until a round on the current draft brings no new grounded objection."
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

- **Brief.** One brief, identical for both seats, written as a consult per stint `references/prompting.md`: the reviewing role and that it changes no file, the decision, the settled constraints, the current draft, entry points to the evidence, and what would change the answer. Every path the brief names is one each advisor can read.
- **Dispatch.** Both seats run in parallel. Record each seat's session id, and keep each of its answers verbatim, one file per round — saved by the facilitator where the seat's plugin returns the answer as text; every later round resumes that session.
- **Read.** Read each answer whole, in its own words. A run that failed outright — a nonzero exit, an agy `ERROR` — is not retried: it goes to the user as its plugin's error handling directs. A seat that has not `answered` (Lean block), or whose run its plugin reports incomplete, is run once more on the current draft before the round is processed; failing again, it goes to the user.
- **Verify.** Check the factual grounds each answer leans on — its objections' and its endorsement's — against their primary sources: two answers agreeing are two claims, not a check. A premise the draft leans on that fails or cannot be verified, shared or not, enters the round as an objection no seat raised.
- **Dispose.** Each objection goes where `dispose` sends it, with its `provenance` recorded beside it.
- **Hand over.** Present the revised draft, what was applied and on what ground, and each item routed to the user with its reason and what verification found of its grounds — the items, not the seats' raw answers; where an item is routed to the user, stop for their answer. The user's decisions become the next round's `Decision`s.
- **Stop.** End where `stop` holds on the current draft — only an applied objection that changes the draft's text, or a user decision that revises it, makes a new current draft — or where the user ends it, and hand over the `exit`. Where it leaves items the user has not decided, it also gives each seat's raw-answer pointer — its answer files and its session id — for the user to open on demand.
- **Delta round.** Where `stop` does not hold, resume the same two sessions with a `DeltaBrief`. Its free text names no seat and counts no agreement either — no "you both", no tally, no repeated verdict.

The Lean block holds within one round and takes what spans rounds as parameters. Across rounds the prose holds: an item routed to the user that no answer of theirs has settled is carried into every later hand over, into each `DeltaBrief`'s open points and into the `exit`; a decided point is not sent to the seats again; and a decided point a seat raises again is dropped unless it comes with new evidence, which sends it back to the user.

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

/-- What an advisor returned for one round: the number of the draft it answered, and its text as
    returned by a run its plugin reports complete. -/
structure Answer where
  draft : Nat
  text  : String

/-- An answer counts on the current draft only when it answers that draft and carries more than
    whitespace. -/
def answered (current : Nat) : Option Answer → Bool
  | some a => a.draft == current && !a.text.all Char.isWhitespace
  | none   => false

/-- An objection's content, apart from who raised it. The judgments below take a point, never
    the seats an objection lists. -/
structure Point where
  text : String

/-- An objection as raised in a round, one per distinct point: its content and every seat that
    raised it — none for one the facilitator raised, such as a premise that failed or could not
    be verified. -/
structure Objection where
  point   : Point
  sources : List Seat

/-- Recorded beside an objection; it is not evidence that the objection holds. -/
inductive Provenance
  | both
  | one
  | facilitator

def provenance (o : Objection) : Provenance :=
  if o.sources.contains .first && o.sources.contains .second then .both
  else if o.sources.isEmpty then .facilitator
  else .one

/-- What verification against the primary source found for an objection's factual grounds. -/
inductive Verdict
  | holds
  | fails
  | unverifiable

/-- **Your judgment**: checking the point's factual grounds against their primary sources, not
    against the other advisor's answer. `holds` only where the grounds hold at their primary
    sources and establish what the point claims. -/
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

/-- `current`: the number of the draft now standing. The consult stops on a complete round on
    that draft that raised nothing that keeps it open. An incomplete round, or a round on an
    earlier draft, never stops it. -/
noncomputable def stop (s : Session) (current : Nat) (r : Round) : Bool :=
  r.draft == current && r.complete && (r.objections.filter (keepsOpen s)).isEmpty

/-- A user decision carried into the next round: the choice, as a constraint. The facts it leans
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
      then "this panel raised no new grounded objection to the current draft in this material"
      else "the consult ended before a round on the current draft stopped it" }

end Delphi
```
