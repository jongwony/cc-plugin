---
name: explain
description: "Explain a concept, topic, codebase, paper, or system to the reader in front of you"
---

# Explain

Fix the reader model first: the four coordinates below are its contents. Every directive here is conditional on it — where the reader already holds something, do not re-teach it, state the delta.

## Four coordinates

Read them off the session before writing. Where the session does not settle one, state the reading being used in a clause and continue; ask only where two readings would produce different explanations.

- **Schema** — what the reader holds *about this specific target*. Assess knowledge of the concrete target separately from knowledge of the concepts it is built from, and sequence each part on its own reading. A term the reader used correctly is evidence about that term, not about the pattern around it; seniority is not evidence at all.
  - Without the schema: one element per unit.
  - With it: name the pattern the reader already understands and stop there, where naming it answers the question.
- **Foil** — what the reader expected instead. Recover it: the explanation is the difference, and the causes worth giving are the few that separate the actual from the expected. Where no foil is recoverable, either explain without one or name the expectation a reader in their position would likely hold and mark it as an assumption.
- **Level** — computational (what it does), algorithmic (how), realizational (what it runs on). Answer at the level the question was posed at, say which level the answer sits at, and descend only where the reader's answer requires it.
- **Wrong model** — the mistaken account the reader is *actually* running. Where there is evidence they hold one, name it, state it fairly, say where it fails, then give the right one; where none is in evidence, skip this. Where the error assigns the target the properties of a category it does not belong to, say the category changes — incremental patching does not move it. Decide the category from the target's properties, not from its label.

## Method

- Start at the reader's question, not at the foundations. What is formally prior is a poor predictor of what is learnable.
- Name the components and what each is for, then show how they interact. Naming the pieces carries more than a preamble that stays abstract.
- Decompose where the pieces are separable, and stage the re-integration explicitly. Where the reader already holds the pieces, go straight to the interaction.
- Put the explanation at its referent.
- Draw the picture when relations are what is being explained; decoration carrying no relation earns nothing.
- Carry an analogy only with all three: the correspondence stated element by element, the point where it stops holding said in the same breath, and a re-description in the target's own vocabulary so what the reader keeps is the target. Where two analogies both map cleanly, comparing them beats elaborating one. Drop an analogy that would need its own explanation.
- Give two examples that vary on surface and hold structure constant. For a reader without the schema, trace one of them completely, step by step. For a reader with it, one contrast pair or edge case replaces the traced instance.
- Cut extraneous material, not mechanism. Where the question is a mechanism question, the steps producing the function are the answer.
- Leave the terminal inference — the one the reader is now equipped to make — to the reader, and say it is theirs. Place any other prompt as a specific question at the seam it belongs to.

## Close

Check at the level the explanation was pitched at: for a mechanism question, ask for the steps between two named points; for a functional question, a functional answer is a correct one. Assent — "that was clear" — is not evidence at any level.

Where the answer comes back incomplete, re-read the four coordinates rather than the reader: one of schema, foil, level, or wrong model was misjudged.

## Bounds

- Propose or make edits only when asked; explaining is not changing.
- Separate what is read from the material from what is inference, and say where a claim rests on something not in front of you.
- For code: name the entry point, trace the path, say what each layer is responsible for, and cite as `file_path:line`.
- Draw examples from the material at hand.

## Evidence

`references/evidence.md` keys each directive above to the findings behind it, with citations and replication strength. Read it when a boundary needs judging — how far a directive reaches, or which of two conflicting directives governs here.
