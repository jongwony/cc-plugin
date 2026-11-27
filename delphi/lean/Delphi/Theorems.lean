import Contract.Delphi

/-! The guarantees the /delphi contract makes, each stated and proved here against
    `Contract.Delphi`, which extract.sh generates from the SKILL.md Lean block. -/

namespace Delphi

/-- Every judgment the block declares has an inhabited type, so none assumes what nothing
    inhabits. -/
example : Nonempty Type := ⟨Unit⟩
example : Nonempty (Session → Point → Verdict) := ⟨fun _ _ => .holds⟩
example : Nonempty (Session → Point → Bool) := ⟨fun _ _ => false⟩

/-- An empty or whitespace-only answer is not an answer. -/
theorem answered_nonempty {cur : Nat} {a : Answer} (h : answered cur (some a) = true) :
    a.draft = cur ∧ a.text.all Char.isWhitespace = false := by
  simp [answered] at h
  exact ⟨h.1, by simpa using h.2⟩

/-- A missing answer is not an answer. -/
theorem answered_none (cur : Nat) : answered cur none = false := rfl

/-- The consult stops only on a round where both seats gave a non-empty answer on the current
    draft. -/
theorem stop_needs_both {s : Session} {r : Round} (h : stop s r = true) :
    answered r.draft (r.answers .first) = true ∧ answered r.draft (r.answers .second) = true := by
  simp [stop, Round.complete] at h
  exact h.1

/-- A round with a seat missing never stops the consult. -/
theorem incomplete_never_stops {s : Session} {r : Round} (h : r.complete = false) :
    stop s r = false := by
  simp [stop, h]

/-- A stopping round raised nothing that keeps the consult open. -/
theorem stop_nothing_open {s : Session} {r : Round} (h : stop s r = true) :
    ∀ o ∈ r.objections, keepsOpen s o = false := by
  intro o ho
  simp [stop] at h
  have := h.2 o ho
  simpa using this

/-- Where an objection goes does not depend on which seats raised it: agreement between the two
    advisors is not evidence. -/
theorem dispose_ignores_provenance (s : Session) {o₁ o₂ : Objection} (h : o₁.point = o₂.point) :
    dispose s o₁ = dispose s o₂ := by
  simp [dispose, h]

/-- A value only the user holds always goes to the user, whatever verification found. -/
theorem userHeld_goes_to_user {s : Session} {p : Point} (h : userHeld s p = true) :
    disposePoint s p = .toUser .userValue := by
  simp [disposePoint, h]

/-- An item routed to the user is never one the facilitator settles. -/
theorem toUser_not_settled {s : Session} {o : Objection} {r : Reason}
    (h : dispose s o = .toUser r) : (dispose s o).settledByFacilitator = false := by
  rw [h]; rfl

/-- What the facilitator settles is exactly `apply` or `drop`. -/
theorem settled_iff (d : Disposition) :
    d.settledByFacilitator = true ↔ d = .apply ∨ d = .drop := by
  cases d <;> simp [Disposition.settledByFacilitator]

/-- Every item the exit hands to the user is one `dispose` routed there, with that reason. -/
theorem exit_items_routed {s : Session} {r : Round} {p : Point} {why : Reason}
    (h : (p, why) ∈ (exit s r).toUser) :
    ∃ o ∈ r.objections, o.point = p ∧ dispose s o = .toUser why := by
  simp only [exit, List.mem_filterMap] at h
  obtain ⟨o, ho, hm⟩ := h
  refine ⟨o, ho, ?_⟩
  cases hd : dispose s o with
  | apply => simp [hd] at hm
  | drop => simp [hd] at hm
  | toUser w =>
    simp [hd] at hm
    exact ⟨hm.1, by rw [hm.2]⟩

/-- The exit claims no more than that this panel found nothing further in this material. -/
theorem exit_claim (s : Session) (r : Round) :
    (exit s r).claim = "this panel found no further objection in this material" := rfl

end Delphi
