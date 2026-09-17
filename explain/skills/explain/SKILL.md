---
name: explain
description: "Explain a concept, topic, codebase, paper, or system to the reader in front of you — sequenced on what that reader already holds rather than on the subject's own foundations. Use for 설명해줘, 이게 뭔지, 이해시켜줘, 쉽게 풀어줘, 어떻게 동작하는지, explain, walk me through, help me understand."
---

# Explain

An explanation is not a rendering of the target. It is the difference between what the reader already holds and what the target actually is, delivered at the level their question was asked at.

So the reader model is the first work, not a closing courtesy. Everything below is conditioned on it: the same target explained to someone who holds the schema and to someone who does not are two different operations, not a long version and a short one. Support that carries a reader without the schema — staged build-up, worked examples, restatement, analogy — becomes material the reader with the schema must process and then discard, which costs them more than silence would.

## Fix four coordinates first

Read them off the session before writing a sentence. Where the session does not settle one, state the reading being used in a clause and continue; ask only where two readings would produce different explanations and nothing in front of you breaks the tie.

- **Schema** — what does the reader already hold *about this specific target*? Expertise is object-specific: someone fluent in distributed systems is a novice on this codebase and an expert on its concepts. Sequence each part on its own reading. The evidence they already used a term correctly settles it; seniority does not.
- **Foil** — what did the reader expect instead? Their question is almost always "why this rather than that", with the *that* unstated. Recover it, and the explanation is the difference. Where no foil is recoverable, name the one a reader in their position would most likely hold and explain against it.
- **Level** — computational (what it does), algorithmic (how), or realizational (what it runs on). Answer at the level the question was posed at, and say which level the answer sits at. Descending a level unbidden adds detail that makes an explanation feel rigorous while teaching nothing.
- **Wrong model** — what mistaken account is the reader likely running? A plainly correct statement gets grafted onto an intact wrong framework without the conflict surfacing. Name the wrong model, state it fairly, say where it fails, then give the right one. Where the error is a category error — a declarative constraint read as a sequence of steps, a protocol read as a conversation — say the category changes; incremental patching does not move it.

## Method

- **Start at the reader's question and descend only as their answer requires.** Foundations-first sequencing orders by what is formally prior, which is a poor predictor of what is learnable; the correct entry point is usually mid-level.
- **Name the components and what each is for, then show how they interact.** Naming the pieces up front is the part of "set the stage" that carries; an abstract bridging preamble is not.
- **Decompose where the pieces are separable, and stage the re-integration explicitly.** Difficulty tracks how many pieces must be held at once, not how much material there is. Where the pieces only mean anything together, an explanation made of well-explained parts leaves the reader unable to see the system. Where the reader already holds the pieces, skip to the interaction.
- **Explain in the reader's chunk size.** For a reader without the schema, one element per unit. For a reader with it, name the whole pattern — "it's a reader-writer lock", "it's a CRDT" — and stop; the name is the explanation, and unfolding its interior is the cost this skill exists to avoid.
- **Put the explanation at its referent.** Annotate the line, the diagram element, the equation term in place. Text that mutually refers to something the reader must go find and hold makes them do the integration.
- **Give few causes, well chosen.** Exhaustiveness is a defect: it raises the load and reads as less explanatory, not more. Select the causes that separate the actual from the foil.
- **Draw the picture when relations are what is being explained.** A diagram showing how parts relate is the strongest single move available; decoration that carries no relation is the weakest.
- **Carry an analogy only with its mapping, its breaking point, and its retirement.** State the correspondence element by element — an analogy left to land on its own mostly does not. Say in the same breath where it stops holding, because retrieval runs on surface resemblance while transfer runs on structure, so an unbounded analogy produces confident wrong inferences along the surface. Then re-describe the thing in its own vocabulary, so what the reader keeps is the target and not the stand-in. Two short analogies compared against each other beat one elaborated analogy. An analogy that would need its own explanation is dropped.
- **Give examples in pairs.** Vary the surface, hold the structure constant, so the reader can align them; a single example invites generalization along its surface. For a reader without the schema, trace one instance completely, step by step. For a reader with it, a contrast pair or an edge case carries more than a traced instance.
- **Cut extraneous material, not mechanism.** Concision is a budget for detail, not a target. A functional summary — what the thing accomplishes — is exactly the form that manufactures confidence without understanding, so where the question is a mechanism question, the steps that produce the function are the answer and cutting them is cutting the explanation.
- **Leave the terminal inference to the reader and mark it as theirs.** Place a specific question at the seam where it matters — "why does this step need the lock?" — rather than a general invitation to think about it. An explanation the reader has to close is held longer than one that closes itself, and it will feel like the worse explanation.

## Close on a mechanism, not on assent

End by asking for the step between two points — "walk through what happens between A and B" — rather than whether it made sense. Assent measures nothing: the sense of understanding runs ahead of the ability to produce the steps, and fluent delivery widens that gap. Treat "that was clear" as no evidence, and a reader's correct restatement of the *function* as no evidence either.

Where an answer comes back incomplete, that is a reading of the four coordinates, not a failure of the reader: it usually means the schema was misjudged or the level was wrong.

## Bounds

- Explaining is not changing. Propose no edit unless asked.
- Separate what is read from the material from what is inference, and say where a claim rests on something not in front of you rather than smoothing it over.
- For code: name the entry point, trace the path, say what each layer is responsible for, and cite as `file_path:line`.
- Draw examples from the material at hand rather than inventing generic ones.

## Evidence

`references/evidence.md` maps each directive above to the finding behind it, its citation, and how well it replicates. Read it when a boundary condition needs judging — how far to trust a directive that is fighting another one, or whether a default is safe to break.
