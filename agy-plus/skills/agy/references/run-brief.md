# What an agy prompt carries

Read this before writing a prompt file. It applies to every run — a judgment on
a decision, an execution, or a parallel multi-model check — and holds what the
prompt owes.

## Point, don't copy

- Pass a pointer — a file path, symbol, pattern, or command — for anything `agy`
  can inspect directly under `-C DIR`.
- Copy in only what `agy` cannot re-derive on disk (for example, session-bound
  context, user preferences stated in chat, or unrecorded test output).
- On resume (`-S <SESSION_ID>`), send only the new instruction; do not repeat
  the prior context.

## Declare the role

- Every prompt states the role `agy` acts in, matching what the request asks for.
  A request for a judgment or review names a **reviewing** role: `agy` evaluates
  and reports without editing files.
- Because `agy-run.sh` defaults to `--mode auto`, the declared role (or passing
  `-M plan`) is what prevents a reviewing run from modifying the tree. State the
  role explicitly rather than leaving it implied.

## Carry the decision when the run judges one

- What `agy` cannot derive from the repository is the decision itself:
  1. what is being chosen,
  2. the current approach and where it is still uncommitted,
  3. **what would change the answer** — the evidence or outcome that would flip
     the choice.
- State all three. On follow-up resumes, pass the same `-C` directory so file
  pointers stay anchored to the same tree.

## Preserve the answer's substance

- Because `agy-run.sh` passes raw JSON through to the Bash subagent, instruct
  the subagent to return `response` faithfully (not over-compressed into a
  one-line summary) whenever the run is a review, diagnosis, or decision
  judgment.

## Choosing model, effort, and parallelism

- A model, effort, or model list the caller already named is the answer; pass it
  through without re-asking.
- Otherwise, choose flexibly based on the task:
  - **Routine / fast lookup or scoped edit**: omit `-m` (uses `agy`'s default)
    or pick a fast/medium slug from `agy models`.
  - **Deep reasoning, architecture review, or hard debugging**: pick a higher
    tier slug or pass `-r high` / `-r xhigh` / `-r max`.
  - **High-stakes judgment or second opinion**: run 2+ distinct models in
    parallel (separate subagent calls in one turn, same prompt file, different
    `-m`) and compare their responses alongside each `SESSION_ID`.
- On resume (`-S`), omit `-m` by default so the conversation stays locked to the
  model that started it.
