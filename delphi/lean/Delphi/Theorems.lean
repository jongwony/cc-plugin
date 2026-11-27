import Contract.Delphi

/-! The guarantees the /delphi contract makes, each stated and proved here against
    `Contract.Delphi`, which extract.sh generates from the SKILL.md Lean block. -/

namespace Delphi

/-- Every judgment the block declares has an inhabited type, so none assumes what nothing
    inhabits. -/
example : Nonempty (type_of% @Session) := ⟨Unit⟩
example : Nonempty (type_of% @dispose) := ⟨fun _ _ => .drop⟩
example : Nonempty (type_of% @keepsOpen) := ⟨fun _ _ => false⟩
example : Nonempty (type_of% @roundClear) := ⟨fun _ _ => false⟩

/-- An empty or whitespace-only answer is not an answer, and an answer counts only on its own
    brief. -/
theorem answered_nonempty {cur : Nat} {a : Answer} (h : answered cur (some a) = true) :
    a.brief = cur ∧ a.text.all Char.isWhitespace = false := by
  simp [answered] at h
  exact ⟨h.1, by simpa using h.2⟩

/-- A missing answer is not an answer. -/
theorem answered_none (cur : Nat) : answered cur none = false := rfl

/-- The consult stops only on a round on the current brief. -/
theorem stop_on_current {s : Session} {cur : Nat} {r : Round} (h : stop s cur r = true) :
    r.brief = cur := by
  simp [stop] at h
  exact h.1.1.1

/-- The consult stops only on a round where both seats gave a non-empty answer on the current
    brief. -/
theorem stop_needs_both {s : Session} {cur : Nat} {r : Round} (h : stop s cur r = true) :
    answered cur (r.answers .first) = true ∧ answered cur (r.answers .second) = true := by
  have hd := stop_on_current h
  simp [stop, Round.complete] at h
  subst hd
  exact h.1.1.2

/-- A round with a seat missing never stops the consult. -/
theorem incomplete_never_stops {s : Session} {cur : Nat} {r : Round} (h : r.complete = false) :
    stop s cur r = false := by
  simp [stop, h]

/-- A round on an earlier brief never stops the consult. -/
theorem stale_never_stops {s : Session} {cur : Nat} {r : Round} (h : r.brief ≠ cur) :
    stop s cur r = false := by
  simp [stop, h]

/-- A round that is not `roundClear` — a pending choice, unfinished verification, an answer that
    does not evaluate the brief — never stops the consult, even with no objection. -/
theorem unclear_never_stops {s : Session} {cur : Nat} {r : Round} (h : roundClear s r = false) :
    stop s cur r = false := by
  simp [stop, h]

/-- A stopping round raised nothing that keeps the consult open. -/
theorem stop_nothing_open {s : Session} {cur : Nat} {r : Round} (h : stop s cur r = true) :
    ∀ o ∈ r.objections, keepsOpen s o.point = false := by
  intro o ho
  simp [stop] at h
  have := h.2 o ho
  simpa using this

/-- Where an objection goes does not depend on its `sources` field: two objections with the same
    point are disposed of alike, whichever seats they list. -/
theorem dispose_ignores_provenance (s : Session) {o₁ o₂ : Objection} (h : o₁.point = o₂.point) :
    dispose s o₁.point = dispose s o₂.point := by
  rw [h]

/-- Whether an objection keeps the consult open does not depend on which seats it lists. -/
theorem keepsOpen_ignores_provenance (s : Session) {o₁ o₂ : Objection}
    (h : o₁.point = o₂.point) : keepsOpen s o₁.point = keepsOpen s o₂.point := by
  rw [h]

/-- The exit makes the panel's claim only where the consult stopped. -/
theorem exit_claim_stop {s : Session} {cur : Nat} {r : Round} {items : List (Point × Reason)}
    {rawAt : Seat → String} (h : stop s cur r = true) :
    (exit s cur r items rawAt).claim =
      "this panel raised no new grounded objection to the current brief in this material" := by
  simp [exit, h]

/-- An exit that did not stop says the consult ended before a stopping round. -/
theorem exit_claim_early {s : Session} {cur : Nat} {r : Round} {items : List (Point × Reason)}
    {rawAt : Seat → String} (h : stop s cur r = false) :
    (exit s cur r items rawAt).claim =
      "the consult ended before a round on the current brief stopped it" := by
  simp [exit, h]

/-- A round that is not `roundClear` never issues the panel's claim. -/
theorem unclear_no_claim {s : Session} {cur : Nat} {r : Round} {items : List (Point × Reason)}
    {rawAt : Seat → String} (h : roundClear s r = false) :
    (exit s cur r items rawAt).claim =
      "the consult ended before a round on the current brief stopped it" :=
  exit_claim_early (unclear_never_stops h)

/-- The exit hands over exactly the open items it is given. -/
theorem exit_hands_over {s : Session} {cur : Nat} {r : Round} {items : List (Point × Reason)}
    {rawAt : Seat → String} : (exit s cur r items rawAt).toUser = items := rfl

/-- Where open items remain, the exit gives both seats' raw-answer pointers. -/
theorem exit_raw_when_open {s : Session} {cur : Nat} {r : Round} {items : List (Point × Reason)}
    {rawAt : Seat → String} (h : items ≠ []) :
    (exit s cur r items rawAt).raw = [(.first, rawAt .first), (.second, rawAt .second)] := by
  simp [exit, h]

/-- Where no open item remains, the exit gives no raw-answer pointer. -/
theorem exit_no_raw_when_closed {s : Session} {cur : Nat} {r : Round}
    {rawAt : Seat → String} : (exit s cur r [] rawAt).raw = [] := by
  simp [exit]

end Delphi
