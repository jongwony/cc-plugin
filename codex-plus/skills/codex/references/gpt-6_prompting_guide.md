# Prompting the gpt-6 family from codex-plus

Operative notes for prompts this skill sends to a gpt-6 model — `gpt-6-astra`,
`gpt-6-sol`, `gpt-6-luna` — through `codex exec`. OpenAI's guidance covers the
family on one page and describes behavior it observed with astra, to be checked
against the model in use; the notes below keep that attribution. Scoped to what changes for an **unattended, file-delivered,
tool-holding** run — the shape `codex-run.sh` produces. General prompt craft
that did not change with the generation is not repeated here.

## Model facts

- Read a model's effort ladder from `codex debug models` and its context window,
  knowledge cutoff and price from
  https://developers.openai.com/api/docs/models/<slug> before choosing it. They
  move with each release, so this file does not copy them.
- The ladder listing omits `none` for every gpt-6 model, yet `gpt-6-sol` and
  `gpt-6-luna` accept it and run at it; `gpt-6-astra` rejects it and the request
  errors. A rung that works elsewhere on the menu is not portable to astra.
- Anything after the model's knowledge cutoff needs retrieval, and the prompt
  says so rather than assuming the model will notice.

## Autonomy and stop conditions

- **astra asks non-blocking questions while working, by default.** OpenAI's
  guidance is to adjust the prompt to the autonomy level the application needs.
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
