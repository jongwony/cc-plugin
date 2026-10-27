# Instruction surfaces

A surface's type is set by who reads it and when it enters that reader's context, not by its file format. Establish a surface's actual loading moment rather than reading it off the directory name or the extension. The earlier a surface enters, the less it carries.

## Types

- **Memory — loaded at every session start.** A `rules/*.md` with no `paths`, and the `CLAUDE.md` / `AGENTS.md` at or above the working directory. A rule is memory: the state and what it binds. A `description` — a skill's, an agent's, a plugin's — is startup-loaded whatever file it sits in, and is written to this type.
- **Skill — loaded on invocation or event.** A `SKILL.md` body, an agent file's body, model-visible hook output. Carry the procedure being invoked and the ground the event itself supplies, not the material it operates on.
- **Progressive disclosure — read on demand.** `references/`, an agent-facing file a surface names as its read point, a nested `CLAUDE.md`, a `paths`-scoped rule (these two enter when Claude reads a matching file). Carry the full procedure and the ground the named read point needs.
  - `premise/`, and a Northstar read from outside its own repository, load the same way and carry ground rather than procedure: the principle the surfaces that cite it derive from, ranking above them. A change to one revises that principle.
- **Document — a person reads it to understand.** `preferences.md` §Externalization governs it.

## Form for the first three types

- One bullet per condition or moment, each naming the state, what triggers it, and the command or reference it resolves to.
- No diagrams, no tables whose cells hold sentences, no narrative. A short lookup table (agent → mention → domain) is fine.
- Operative content only; rationale goes to the ledger (commit message).
- Nothing a model reaches by inference — only values choi holds and facts the model cannot observe.
- What another surface, the harness, or the environment already supplies stays with that owner.
- A rule that only holds on choi's machine (local paths, local CLIs, user-installed plugins, harness tools) or carries private identifiers goes to the local, unpublished rules, not here.

## Where the ground is

Each line names the epistemic-protocols premise section that carries the concept in full; read it when the concept bears on the surface being written.

- Admitting a clause — `premise/instruction-authoring.md` §Override Gate (the obligation it serves, the friction observed)
- Removing before adding — `premise/instruction-authoring.md` §Subtraction at Revision Time, §Deletion by Default, Retention on Evidence (ablate, restore only what failed)
- Principle before example — `premise/instruction-authoring.md` §Zero-Shot Instruction Preference
- Positive statement before prohibition — `premise/instruction-authoring.md` §Prohibition Base Rate and White Bear Avoidance
- Two live instructions at one situation — `premise/instruction-authoring.md` §Conflicting Instructions (re-derive rather than append)
- One home per obligation — `premise/instruction-authoring.md` §No Duplication (MECE)
- Inscribing only the slow layer — `premise/instruction-authoring.md` §Inscription Economics (volatility, loading moment)
- Narrowing the domain rather than writing in the answer — `premise/specification-and-judgment.md` §What a Type Layer Does on the Indeterminate Side, §Cases in Place of a Judgment
- Present state apart from its derivation — `premise/instruction-authoring.md` §State and Ledger
