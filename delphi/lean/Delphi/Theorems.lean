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

/-- The consult stops only on a round on the current draft. -/
theorem stop_on_current {s : Session} {cur : Nat} {r : Round} (h : stop s cur r = true) :
    r.draft = cur := by
  simp [stop] at h
  exact h.1.1

/-- The consult stops only on a round where both seats gave a non-empty answer on the current
    draft. -/
theorem stop_needs_both {s : Session} {cur : Nat} {r : Round} (h : stop s cur r = true) :
    answered cur (r.answers .first) = true ∧ answered cur (r.answers .second) = true := by
  have hd := stop_on_current h
  simp [stop, Round.complete] at h
  subst hd
  exact h.1.2

/-- A round with a seat missing never stops the consult. -/
theorem incomplete_never_stops {s : Session} {cur : Nat} {r : Round} (h : r.complete = false) :
    stop s cur r = false := by
  simp [stop, h]

/-- A round on an earlier draft never stops the consult. -/
theorem stale_never_stops {s : Session} {cur : Nat} {r : Round} (h : r.draft ≠ cur) :
    stop s cur r = false := by
  simp [stop, h]

/-- A stopping round raised nothing that keeps the consult open. -/
theorem stop_nothing_open {s : Session} {cur : Nat} {r : Round} (h : stop s cur r = true) :
    ∀ o ∈ r.objections, keepsOpen s o = false := by
  intro o ho
  simp [stop] at h
  have := h.2 o ho
  simpa using this

/-- Where an objection goes does not depend on its `sources` field: two objections with the same
    point are disposed of alike, whichever seats they list. -/
theorem dispose_ignores_provenance (s : Session) {o₁ o₂ : Objection} (h : o₁.point = o₂.point) :
    dispose s o₁ = dispose s o₂ := by
  simp [dispose, h]

/-- An objection no seat raised is recorded as the facilitator's. -/
theorem provenance_facilitator (p : Point) : provenance ⟨p, []⟩ = .facilitator := rfl

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

/-- A point the user has decided is never sent back to the seats as open. -/
theorem decided_not_open {s : Session} {r : Round} {w : String} {e : List String}
    {ds : List Decision} {p : Point} (hp : decided s p = true) :
    p ∉ (delta s r w e ds).openPoints := by
  simp only [delta, List.mem_map, List.mem_filter, not_exists, not_and]
  intro o hm hop
  subst hop
  simp [hp] at hm

/-- Every item the exit hands to the user is one `dispose` routed there, with that reason, and
    one the user has not decided. -/
theorem exit_items_routed {s : Session} {cur : Nat} {r : Round} {p : Point} {why : Reason}
    (h : (p, why) ∈ (exit s cur r).toUser) :
    ∃ o ∈ r.objections, o.point = p ∧ dispose s o = .toUser why ∧ decided s p = false := by
  simp only [exit, List.mem_filterMap] at h
  obtain ⟨o, ho, hm⟩ := h
  refine ⟨o, ho, ?_⟩
  cases hdec : decided s o.point with
  | true => simp [hdec] at hm
  | false =>
    cases hd : dispose s o with
    | apply => simp [hdec, hd] at hm
    | drop => simp [hdec, hd] at hm
    | toUser w =>
      simp [hdec, hd] at hm
      obtain ⟨h1, h2⟩ := hm
      subst h1
      exact ⟨rfl, by rw [h2], hdec⟩

/-- The exit claims that this panel found nothing further in this material only where the
    consult stopped. -/
theorem exit_claim_stop {s : Session} {cur : Nat} {r : Round} (h : stop s cur r = true) :
    (exit s cur r).claim = "this panel found no further objection in this material" := by
  simp [exit, h]

/-- An exit that did not stop says the consult ended before a stopping round. -/
theorem exit_claim_early {s : Session} {cur : Nat} {r : Round} (h : stop s cur r = false) :
    (exit s cur r).claim = "the consult ended before a round on the current draft stopped it" := by
  simp [exit, h]

end Delphi
