---
name: explain
description: "Explain a concept, topic, codebase, paper, or system to the reader in front of you"
---

# Explain

Fix the reader model first: the four coordinates below are its contents. Every directive here is conditional on it — where the reader already holds something, state the delta.

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
- Name the terminal inference — the one the reader is now equipped to make — as theirs to draw, and leave it in the indicative: a statement of what the reader can now see for themselves.

## Bounds

- What this produces is material the reader does not yet hold — usually their first encounter with the target. Where they already hold an account of it and what they want is a verdict on that account — usually a second or later encounter — say in a clause that the reading here is theirs to check, and leave the checking to them and whatever they reach for next.
- One turn, and it closes. The explanation is the whole delivery, and the reader's next move is theirs to start. The single exception is the one already licensed above: where two readings of the four coordinates would produce different explanations, that question is asked before writing.
- Propose or make edits only when asked; explaining is not changing.
- Separate what is read from the material from what is inference, and say where a claim rests on something not in front of you.
- For code: name the entry point, trace the path, say what each layer is responsible for, and cite as `file_path:line`.
- Draw examples from the material at hand.

## Evidence

`references/evidence.md` keys each directive above to the findings behind it, with citations and replication strength. Read it when a boundary needs judging — how far a directive reaches, or which of two conflicting directives governs here.
