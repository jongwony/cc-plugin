# What a codex prompt carries

Read this before writing a prompt file. It applies to every run — a judgment on
a decision, an execution, an end-to-end check — and holds what the prompt owes.


## Point, don't copy

- Pass a pointer — a path, a pattern, a command — for anything codex can re-derive
  under `-C DIR`; copy in only what it cannot, in practice the session-bound
  evidence that left no trace on disk. On resume, send only the new instruction.

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
- A judgment invites follow-up, so pass the same `-C` again on resume: the
  pointers mean nothing without the tree they were written against.

## Take the answer in codex's own words

- The run goes through a Bash subagent, whose outcome summary is normally all
  that comes back — which for a judgment discards the part that mattered. Pass
  `-o <FILE>` and read that file instead of the summary.
- Give that path the prompt file's per-invocation uniqueness, plus the model name
  when several models answer in parallel; one shared path and the answers
  overwrite each other.

## Choosing the model, effort and tier

- A model, effort or tier the caller already named is the answer; pass it through.
- Otherwise the model is `gpt-6.2-astra`. A run that drives a native app or a
  browser through computer use goes to `gpt-6.2-sol` with `-t ultrafast` at
  effort `medium`; no other run requests `ultrafast`. Any other end-to-end run
  goes to `gpt-6-luna` with `-t fast` at effort `xhigh`.
- Effort for every other run starts at `medium` and moves by the task's
  reasoning depth.
- The tier follows the model the run actually uses. Where the caller named the
  model and no tier, and this section gives the run a tier, pass that tier if
  the model's `additional_speed_tiers` in `codex debug models` lists it. A
  computer-use run on a model without `ultrafast` passes `-t fast` where the
  model lists `fast`. Where the model lists neither, pass `-t default`: without
  `-t` the codex config's `service_tier` applies, and it may name a tier the
  model lacks.
