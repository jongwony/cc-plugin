# What a codex prompt carries

Read this before writing a prompt file. It applies to every run — a judgment on
a decision, an execution, an end-to-end check — and holds what the prompt owes
beyond `## Context Classification` in SKILL.md.

## Declare the role

- Every prompt names the role codex acts in, taken from what the request actually
  asks for. A request for a judgment on a decision names a **reviewing** role:
  codex says what it thinks of the decision and does not implement it.
- The default sandbox permits writes, so the declared role is what keeps a
  reviewing run from editing. Write the role down rather than leaving it to be
  inferred from the prompt's shape.

## Carry the decision when the run judges one

- What codex cannot re-derive with its own tools is the decision: what is being
  chosen, the approach taken so far and where it is still uncommitted, and **what
  would change the answer** — the evidence or outcome that would flip it. State
  all three. That last item is the one most often omitted.
- Everything else goes through Context Classification's test: a pointer when
  codex can re-derive it under `-C DIR`, copied in when it cannot — in practice
  the session-bound evidence that left no trace on disk.
- A judgment invites follow-up, so pass the same `-C` again on resume: the
  pointers mean nothing without the tree they were written against.

## Take the answer in codex's own words

- The run goes through a Bash subagent, whose outcome summary is normally all
  that comes back — which for a judgment discards the part that mattered. Pass
  `-o <FILE>` and read that file instead of the summary.
- Give that path the prompt file's per-invocation uniqueness, plus the model name
  when several models answer in parallel; one shared path and the answers
  overwrite each other.

## Sandbox

- Leave `-s` at its default for a reviewing run: `workspace-write` is the only
  mode short of full access with network, and a judgment routinely needs the
  network to check a claim against a live source rather than recollection.

## Choosing the model and effort

- A model or effort the caller already named is the answer; pass it through.
- Otherwise choose per request, reading each model's description and effort
  ladder off `codex debug models`:
  - a judgment on a decision runs on a frontier model — `gpt-6-astra`;
  - an end-to-end or browser run goes to `gpt-6-luna`;
  - other work reads the descriptions for the fit — `gpt-6-sol` is the catalog's
    workhorse for coding and everyday work.
- Start effort at `medium` and move it by the task's reasoning depth; the prompting
  guide's `## Choosing an effort rung` carries how.
