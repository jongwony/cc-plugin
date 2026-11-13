# Delegate model

- **A delegate's model and effort are judged at each delegation from the accumulated context and choi's words.** Effort stays `high` unless the work's complexity is plainly visible and that reading is held with high confidence; only then is it raised or lowered, and never below `medium`. Haiku is not among the models judged. A fork inherits the parent's model and effort and ignores an override. An agent whose definition pins its own model keeps it.
- **These cases show the pattern so far; they do not fix it:**
  - a Claude delegate → Opus 5.5, whatever model the delegating session runs;
  - a cross-model second opinion — a review loop run to convergence, or a check that a proposal, a status quo or a result converges with an independent reading → Codex on `gpt-6-astra`;
  - a single question sent to a person → no cross-model check;
  - prose cleanup, or drafting a message for a person → Gemini on `gemini-4-argon`;
  - video or other media understanding → the Gemini API.
