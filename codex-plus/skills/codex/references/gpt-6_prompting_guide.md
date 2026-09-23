# Prompting the gpt-6 family from codex-plus

Operative notes for prompts this skill sends to a gpt-6 model — `gpt-6-astra`,
`gpt-6-sol`, `gpt-6-luna` — through `codex exec`. OpenAI's guidance covers the
family on one page and describes behavior it observed with astra, to be checked
against the model in use; the notes below keep that attribution. Scoped to what changes for an **unattended, file-delivered,
tool-holding** run — the shape `codex-run.sh` produces. General prompt craft
that did not change with the generation is not repeated here.

Sources, and how each line is marked:

- **Unmarked** — read off an OpenAI page: the model card
  (`developers.openai.com/api/docs/models/<slug>`), the model guidance
  (`.../guides/latest-model`), or the Codex
  subagents page (`developers.openai.com/codex/subagents`).
- **`[secondary]`** — not found on an OpenAI page; taken from third-party
  write-ups. Treat as a lead, not a citation.
- **`[applied]`** — extended from an OpenAI statement to this skill's situation.
  The source carries the general claim; the consequence drawn for an unattended
  `codex exec` run is drawn here and is not in the source.

## Model facts

- Read a model's effort ladder from `codex debug models` and its context window,
  knowledge cutoff and price from `developers.openai.com/api/docs/models/<slug>`
  before choosing it. They move with each release, so this file does not copy
  them.
- The ladder listing omits `none` for every gpt-6 model, yet `gpt-6-sol` and
  `gpt-6-luna` accept it and run at it; `gpt-6-astra` rejects it and the request
  errors. A rung that works elsewhere on the menu is not portable to astra.
- Anything after the model's knowledge cutoff needs retrieval, and the prompt
  says so rather than assuming the model will notice.
- Stop sending `temperature`, `top_p`, `top_logprobs`. `codex-run.sh` never sent
  them, so nothing in this skill changes — recorded so a future flag is not
  added. `[secondary]`

## Autonomy and stop conditions

- **astra asks non-blocking questions while working, by default.** OpenAI's
  guidance is to adjust the prompt to the autonomy level the application needs.
- Runs from this skill are headless: `codex exec` has no approval step and no one
  to answer mid-run. A question therefore lands in the final message, and the
  answer costs a `-S` resume.
- So every prompt states, in the `## Task` section: how far to go without
  checking back, and what "done" is.
- Where a question is unavoidable, direct the model to **carry on under a stated
  assumption and name the assumption in its answer**, rather than stopping. The
  user resolves it on resume with the work already advanced.
- A genuine consult inverts this: a question is a legitimate deliverable there,
  and the reviewing role the prompt declares already says so.

## Instruction priority

- astra follows longer instructions better than prior models but is **more
  sensitive to information in context**. Unclear or conflicting guidance in a
  skill file can make it pause and block work early.
- State the priority of instructions explicitly when the prompt carries more than
  one source of rules (user request vs. repo conventions vs. a linked doc).
- Say each rule once. Repeating "ask first" / "do not mutate" / "wait for
  approval" drives unnecessary approval requests for actions that were in scope.
- Before sending, reread the prompt for two rules that pull opposite ways. Under
  astra that is a stall, not a tie-break.

## Context discipline

- The skill's Context Classification rule — pointers for anything codex can
  re-derive, copy only what it cannot — **matters more under astra, not less**.
  Greater in-context sensitivity means copied material carries more weight, so a
  copied-in summary competes harder with what the tools would have found.
- Keep giving the model the tree (`-C DIR`) and the search hints. A model that can
  look is worth more than a transcript of a previous look.
- Long sessions amplify repeated prompt and tool content; on resume, add only the
  new instruction rather than restating the original task.

## Reconcile before switching

- When astra's answer contradicts evidence already collected, **do not silently
  adopt it**. Resume the same session and put the conflict itself: what was
  found, what astra proposed, and which constraint decides.
- astra saw the pointers but may have weighed them lightly. One reconcile turn is
  cheaper than committing to the wrong branch and is the whole reason resume is
  by explicit session id.

## Choosing an effort rung

- `medium` is the wrapper's fallback and the starting point. OpenAI's guidance is to
  compare a rung against its neighbours on representative work rather than assume
  the highest wins.
- Raise to `high`/`xhigh`/`max`/`ultra` for reasoning depth, not for task size.
  A long mechanical task does not need a higher rung; a short load-bearing
  judgment may.
- `low` is for latency-bound work. Runs here are unattended, so a cheap wrong
  answer costs a resume instead of saving time.
- A rung is not portable across models: the rung a task needs on luna is not the
  rung it needs on astra. Read the rung off the task on the model you are
  actually running, rather than carrying one across.

## Subagents

- A codex subagent inherits the parent's model and `model_reasoning_effort`
  unless the spawn request, an `[agents]` default in `config.toml`, or the custom
  agent file sets them.
- Subagent runs cost more than a comparable single-agent run — each does its own
  model and tool work. Ask for them when the work genuinely splits.
- A prompt that asks for subagents says how to divide the work, whether codex
  waits for all of them before continuing, and what each returns.
- Fast scans belong on a cheaper model — `gpt-6-luna` in this family. `[applied]`
  — the page's own example names `gpt-5.6-terra` against a higher-effort `gpt-5.6`
  config and predates gpt-6, so its holding for the gpt-6 family is drawn here
  rather than stated there.
