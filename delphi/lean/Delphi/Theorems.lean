import Contract.Delphi

/-! The guarantees the /delphi contract makes, each stated and proved here against
    `Contract.Delphi`, which extract.sh generates from the SKILL.md Lean block. -/

namespace Delphi

/-! Every judgment the block declares has an inhabited type, so none assumes what nothing
    inhabits. Each witness names no judgment's value. -/
instance instNonemptySession : Nonempty (type_of% @Session) := ⟨Unit⟩
instance instNonemptyDispose : Nonempty (type_of% @dispose) := ⟨fun _ _ => .drop⟩
instance instNonemptyKeepsOpen : Nonempty (type_of% @keepsOpen) := ⟨fun _ _ => false⟩
instance instNonemptyRoundClear : Nonempty (type_of% @roundClear) := ⟨fun _ _ => false⟩

/-- An answer that counts is on its brief and carries a character other than ASCII whitespace
    (`Char.isWhitespace`: space, tab, carriage return, line feed). -/
theorem answered_nonempty {cur : Nat} {a : Answer} (h : answered cur (some a) = true) :
    a.brief = cur ∧ a.text.all Char.isWhitespace = false := by
  simp [answered] at h
  exact ⟨h.1, by simpa using h.2⟩

/-- A missing answer is not an answer. -/
theorem answered_none (cur : Nat) : answered cur none = false := rfl

/-- The consult stops only on a round on the current brief. -/
theorem stop_on_current {s : Session} {cur : Nat} {r : Round} (h : stop s cur r = true) :
    r.brief = cur := by
  simp [stop, Round.view] at h
  exact h.1.1.1.1

/-- The consult stops only on a round where both seats answered the current brief. -/
theorem stop_needs_both {s : Session} {cur : Nat} {r : Round} (h : stop s cur r = true) :
    answered cur (r.answers .first) = true ∧ answered cur (r.answers .second) = true := by
  have hd := stop_on_current h
  simp [stop, Round.view, Round.complete] at h
  subst hd
  exact h.1.1.1.2

/-- A round in which a seat has not answered its brief never stops the consult. -/
theorem unanswered_never_stops {s : Session} {cur : Nat} {r : Round} (h : r.complete = false) :
    stop s cur r = false := by
  simp [stop, Round.view, h]

/-- A round on an earlier brief never stops the consult. -/
theorem stale_never_stops {s : Session} {cur : Nat} {r : Round} (h : r.brief ≠ cur) :
    stop s cur r = false := by
  simp [stop, Round.view, h]

/-- A round that is not `roundClear` — a pending choice that blocks closing, unfinished
    verification, an answer that does not evaluate the brief — never stops the consult, even with
    no objection. -/
theorem unclear_never_stops {s : Session} {cur : Nat} {r : Round}
    (h : roundClear s r.view = false) : stop s cur r = false := by
  simp only [stop, h, Bool.and_false, Bool.false_and]

/-- A round with a point whose disposition holds the brief open — an applied change, or a choice
    that blocks closing — never stops the consult. -/
theorem held_open_never_stops {s : Session} {cur : Nat} {r : Round} {p : Point}
    (hp : p ∈ r.view.points) (h : (dispose s p).holdsOpen = true) : stop s cur r = false := by
  have hne : (r.view.points.filter (fun p => (dispose s p).holdsOpen)) ≠ [] := by
    intro he
    have : p ∈ r.view.points.filter (fun p => (dispose s p).holdsOpen) := by
      simp [List.mem_filter, hp, h]
    rw [he] at this
    simp at this
  have hf : (r.view.points.filter (fun p => (dispose s p).holdsOpen)).isEmpty = false := by
    cases hl : r.view.points.filter (fun p => (dispose s p).holdsOpen) with
    | nil => exact absurd hl hne
    | cons _ _ => rfl
  simp only [stop]
  rw [hf]
  simp

/-- A stopping round raised nothing that keeps the consult open. -/
theorem stop_nothing_open {s : Session} {cur : Nat} {r : Round} (h : stop s cur r = true) :
    ∀ o ∈ r.objections, keepsOpen s o.point = false := by
  intro o ho
  simp [stop, Round.view] at h
  have := h.1.2 o ho
  simpa using this

/-- Whether a round stops depends only on its seat-free view: two rounds with the same brief,
    the same completeness and the same points stop alike, whichever seats raised the points. -/
theorem stop_depends_on_view (s : Session) (cur : Nat) {r₁ r₂ : Round}
    (h : r₁.view = r₂.view) : stop s cur r₁ = stop s cur r₂ := by
  simp only [stop, h]

/-- The disposition of an objection is independent of its `sources` field. It is not
    independence from the session, which the judgment also reads. -/
theorem dispose_ignores_sources (s : Session) {o₁ o₂ : Objection} (h : o₁.point = o₂.point) :
    dispose s o₁.point = dispose s o₂.point := by
  rw [h]

/-- Whether an objection keeps the consult open is independent of its `sources` field. -/
theorem keepsOpen_ignores_sources (s : Session) {o₁ o₂ : Objection}
    (h : o₁.point = o₂.point) : keepsOpen s o₁.point = keepsOpen s o₂.point := by
  rw [h]

/-- Where the consult stopped, the exit makes the panel's claim. -/
theorem exit_claim_stop {s : Session} {cur : Nat} {r : Round} {items : List (Point × Reason)}
    {rawAt : Seat → String} (h : stop s cur r = true) :
    (exit s cur r items rawAt).claim =
      "this panel raised no new grounded objection to the current brief in this material" := by
  simp [exit, h]

/-- Where the consult did not stop, the exit says that it ended before a stopping round. -/
theorem exit_claim_early {s : Session} {cur : Nat} {r : Round} {items : List (Point × Reason)}
    {rawAt : Seat → String} (h : stop s cur r = false) :
    (exit s cur r items rawAt).claim =
      "the consult ended before a round on the current brief stopped it" := by
  simp [exit, h]

/-- A round that is not `roundClear` never issues the panel's claim. -/
theorem unclear_no_claim {s : Session} {cur : Nat} {r : Round} {items : List (Point × Reason)}
    {rawAt : Seat → String} (h : roundClear s r.view = false) :
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
