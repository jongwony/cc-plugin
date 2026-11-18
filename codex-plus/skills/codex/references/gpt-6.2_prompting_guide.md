# Prompting the gpt-6 family from codex-plus

Operative notes for prompts this skill sends to a gpt-6 model — `gpt-6.2-astra`,
`gpt-6.2-sol`, `gpt-6-luna` — through `codex exec`. Behavior OpenAI's guidance
describes is to be checked against the model in use. Scoped to what changes
for an **unattended, file-delivered, tool-holding** run — the shape
`codex-run.sh` produces. General prompt craft that did not change with the
generation is not repeated here.

## Model facts

- Read a model's effort ladder from `codex debug models` and its context window,
  knowledge cutoff and price from
  https://developers.openai.com/api/docs/models/<slug> before choosing it. They
  move with each release, so this file does not copy them.
- The ladder listing omits `none` for every gpt-6 model, yet `gpt-6-luna`
  accepts it and runs at it; the 6.2 models reject it and the request errors —
  OpenAI's guidance points to `low` instead. A rung that works for luna is not
  portable to 6.2.
- Anything after the model's knowledge cutoff needs retrieval, and the prompt
  says so rather than assuming the model will notice.
- From 6.2 on, the API drops a conversation's reasoning items when it detects a
  mid-conversation change such as a model downgrade, and answer quality can fall.
  A resumed turn on a different `-m` pays that cost; `SKILL.md` step 6 is how a
  resume stays on the session's model.

## Autonomy and stop conditions

- **Where intent is unclear, the 6.2 models may propose a next step and wait for
  confirmation.** OpenAI's guidance is to adjust the prompt to the autonomy level
  the application needs.
- Runs from this skill are headless: `codex exec` has no approval step and no one
  to answer mid-run. A question therefore lands in the final message, and the
  answer costs a `-S` resume.
- So every prompt states how far to go without checking back, what "done"
  is, and that the work is checked against that "done" before the final
  message. Where a long run stops short of its final checks, higher effort is
  the lever OpenAI's guidance names for carrying it through them.
- Where a question is unavoidable, direct the model to **carry on under a stated
  assumption and name the assumption in its answer**, rather than stopping. The
  user resolves it on resume with the work already advanced.
- The exception is a prompt whose stated deliverable admits a question back —
  the prompt says so. A reviewing role alone does not: a review still
  delivers its judgment, with any assumption named.

## The final message

- The 6.2 models answer concisely and directly by default, and the final message
  is what the caller reads (`-o`, per `run-brief.md` § Take the answer in
  codex's own words). So the prompt names what that message must carry —
  findings, assumptions, what was left undone — and asks for it to stand on its
  own, without shorthand carried over from the model's tool calls or working
  notes.
