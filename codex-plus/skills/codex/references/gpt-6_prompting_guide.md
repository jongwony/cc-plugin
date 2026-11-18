# Prompting the gpt-6 family from codex-plus

Operative notes for prompts this skill sends to a gpt-6 model — `gpt-6.2-astra`,
`gpt-6.2-sol`, `gpt-6-astra`, `gpt-6-sol`, `gpt-6-luna` — through `codex exec`.
OpenAI's guidance leads with the 6.2 models and keeps the earlier family under a
tab of its own; behavior it describes is to be checked against the model in use,
and the notes below keep the attribution to the model it was observed with. Scoped to what changes for an **unattended, file-delivered,
tool-holding** run — the shape `codex-run.sh` produces. General prompt craft
that did not change with the generation is not repeated here.

## Model facts

- Read a model's effort ladder from `codex debug models` and its context window,
  knowledge cutoff and price from
  https://developers.openai.com/api/docs/models/<slug> before choosing it. They
  move with each release, so this file does not copy them.
- The ladder listing omits `none` for every gpt-6 model, yet `gpt-6-sol` and
  `gpt-6-luna` accept it and run at it; `gpt-6-astra` and `gpt-6.2-astra` reject
  it and the request errors, and OpenAI's 6.2 guidance retires `none` for the 6.2
  models as a whole, pointing to `low`. A rung that works elsewhere on the menu is
  not portable to astra.
- Anything after the model's knowledge cutoff needs retrieval, and the prompt
  says so rather than assuming the model will notice.

## Autonomy and stop conditions

- **`gpt-6-astra` asks non-blocking questions while working, by default**, and
  for the 6.2 models OpenAI's guidance says that where intent is unclear the
  model may propose a next step and wait for confirmation. Its advice for both is
  to adjust the prompt to the autonomy level the application needs.
- Runs from this skill are headless: `codex exec` has no approval step and no one
  to answer mid-run. A question therefore lands in the final message, and the
  answer costs a `-S` resume.
- So every prompt states how far to go without checking back, and what "done"
  is.
- Where a question is unavoidable, direct the model to **carry on under a stated
  assumption and name the assumption in its answer**, rather than stopping. The
  user resolves it on resume with the work already advanced.
- The exception is a prompt whose stated deliverable admits a question back —
  the prompt says so. A reviewing role alone does not: a review still
  delivers its judgment, with any assumption named.
