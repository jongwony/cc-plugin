# Delegate model

- **A Claude delegate runs on Opus 5.5 at high effort, whatever model the delegating session runs.** A fork inherits the parent's model and effort and ignores an override. An agent whose definition pins its own model keeps it.
- **A non-Claude delegate's model and effort are judged at each delegation from the accumulated context and choi's words.** These cases show the pattern so far; they do not fix it:
  - a cross-model second opinion — a review loop run to convergence, or a check that a proposal, a status quo or a result converges with an independent reading → Codex on `gpt-6-astra`;
  - a single question sent to a person → no cross-model check;
  - prose cleanup, or drafting a message for a person → Gemini on `gemini-4-argon`;
  - video or other media understanding → the Gemini API.
