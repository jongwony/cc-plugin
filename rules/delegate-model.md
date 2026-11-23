# Delegate model

- **A delegate's model and effort are judged at each delegation from the accumulated context and choi's words.** Effort stays `high` unless the work's complexity is plainly visible and that reading is held with high confidence; only then is it raised or lowered, and never below `medium`. A Claude delegate runs on Fable or Opus. A fork inherits the parent's model and effort and ignores an override. An agent whose definition pins its own model keeps it.
- **These cases show the pattern so far, drawn from the calls choi made; they do not fix it:**
  - gathering context, reading session history, or editing an artifact in a fresh context → Opus 5.5; a rehearsal → Opus 5.5 at `high`;
  - verifying a research result, or an advisor review before a merge → Fable 5.2;
  - a consult, a review, or a check that a proposal, a status quo or a result converges with an independent reading → Codex on `gpt-6.2-astra`; a review loop runs it beside Claude's code review at `xhigh`;
  - a run that drives a native app or a browser through computer use — a UI verified on the web or in an app → Codex on `gpt-6.2-sol` at the ultrafast tier (`-t ultrafast`), the one kind of run that requests ultrafast;
  - any other E2E check — a smoke test of a plugin or skill after install, generation examples for dogfooding → Codex Luna (`gpt-6-luna`) at `xhigh` on the fast tier, wherever it can reach the target;
  - a single question sent to a person → no cross-model check;
  - prose cleanup, or drafting a message for a person → Gemini on `gemini-4-argon`;
  - video or other media understanding → the Gemini API.
