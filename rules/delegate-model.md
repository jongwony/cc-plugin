# Delegate model

- **A Claude delegate runs on Opus 5.5 at high effort, whatever model the delegating session runs.** A fork inherits the parent's model and effort and ignores an override. An agent whose definition pins its own model keeps it.
- **A cross-model second opinion goes to Codex on `gpt-6-astra` at `high` effort** — a review loop run to convergence, or a check that a proposal, a status quo or a result converges with an independent reading. A single question sent to a person goes out without one.
- **Prose cleanup and drafting a message for a person go to Gemini on `gemini-4-argon`** — stripping metaphor the reader does not need, condensing what to ask someone.
- **Video and other media understanding goes to the Gemini API.**
