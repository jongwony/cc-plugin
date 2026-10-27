# cloud — a Claude Code cloud session

Installed into cloud sessions only.

## Personal Linear workspace

Applies where the `linear-personal` MCP is connected; a repository whose work another Linear workspace tracks is outside it.

- **A unit's intent lives on its chart, and a write to a repository opens that chart first.** The unit is the code target being solved — grown by the links review and follow-ups add, ended by an explicit closing act (`epistemic-protocols/docs/intent-record.md` §Lifecycle) and never by the last merge. Its intent (what is wanted, why, under which constraints, what is still open) lives on the root issue of its Linear project in the shape `epistemic-protocols/docs/intent-record.md` gives it; nothing in a repository tree carries it. When the session is heading toward a write — an edit, a branch, a worktree, a spawn — and no chart is open for its unit, match the intent against the workspace's project root issues (in-progress first, plus one the context makes plainly relevant) and load that one chart only. Fire where the intent forms, not at the tool call. No match → propose a new root issue rather than opening a neighbour's. Say in one line that it fired, and where a write went out with no chart open, say which floor applied.
  - **Floor (do NOT fire)**: a repository outside this workspace's scope; a self-contained change the user directed this turn that no other work's direction depends on; a machine-local or scratch file; any write once this unit's chart is already open.
  - **The writing that follows is `/unfold`'s** (unfold@cc-plugin): `decide` at the moment the direction changes, `group` to collapse an accumulated open set into axes; `references/moments.md` carries the procedures. It writes structure and decisions, never state.
  - **The slow layer only**: a Linear write here records decisions (direction, settled coordinates, confirmed values) and the current shape of the root issue's Open questions — as a decision comment, a project document, structure (issues and their edges), or a rewrite of that one section — never state a later read would refresh.
- **Consent — do, then report** (`consent-tiers.md`): Linear structure writes here (unfold `group`, and the closing note once choi decided the closure); an unfold `decide` whose reason and rejected alternative come from choi's own words — a slot that would have to be inferred is asked, or parked in an autonomous run.

## choi's machine

- **Something that exists only on choi's machine is looked up there, read only.**
