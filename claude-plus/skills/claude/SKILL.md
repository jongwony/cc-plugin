---
name: claude-plus
description: |
  This skill should be used when the user asks to "consult fable", "ask fable", "run claude", "delegate to claude", "claude resume", or "continue with claude" — and whenever a decision wants a second judgment from a model that is not the one holding the question. Runs bounded work through the Claude Code CLI with model selection, effort configuration, and session management.
---

# Claude Plus

Two uses share one path: **delegating execution** to a Claude session, and
**consulting** a Claude model for a judgment. Both go through
`scripts/claude-run.sh`, which owns the invocation; this file owns what to send
and what to accept back.

The default model is `fable`. A consult is worth asking for because the
answering model is not the one already holding the question — keep it that way
when overriding.

## Where this runs

This skill loads in more than one harness, and how to reach the wrapper differs
by harness.

- **The wrapper is always `../../scripts/claude-run.sh` relative to this file** —
  resolve it from the directory this SKILL.md was loaded from. That holds in
  every harness and under every install layout, so prefer it.
- `${CLAUDE_PLUGIN_ROOT}/scripts/claude-run.sh` is the same file where that
  variable is set. Claude Code sets it; **Codex does not** — it is a Claude Code
  variable, and was observed unset in a fresh Codex session with this plugin
  installed. Use it only after confirming it is non-empty.
- Run `claude-run.sh -h` for the flag set, and `command -v claude` before
  depending on the CLI. Report an unavailable executable or a missing
  integration before the work that depends on it.
- **Invocation files are caller-relative.** The prompt file, `-o` and `-D`
  resolve against the directory the wrapper is invoked from, and they are
  resolved before `-C` takes effect — so a relative path names a caller-side
  file, never one under the `-C` tree. Pass absolute paths for all three. `-C`
  governs where the run executes, which is what the *pointers inside the prompt*
  resolve against; that is a different question and the one `-C` is for.
- All prompts sent to `claude` are written in English.

## Select and prepare

- Select Claude when the user designates it, when the task needs a
  Claude-specific capability or an existing Claude conversation, or when a
  decision wants a judgment from a different model. Keep ordinary work in the
  current harness otherwise.
- Write the prompt to a file under the calling session's scratchpad, named with
  a short unique suffix — `<scratchpad>/claude_prompt_<suffix>.txt`, as an
  absolute path. Parallel runs each get their own file; one shared name and they
  overwrite each other. Where the harness announces no scratchpad directory,
  fall back to a directory under `${TMPDIR:-/tmp}`.
- State in every prompt the **role** the run is acting in, read from what the
  request actually asks for. A headless run has no approval step, so the role is
  what holds it to its lane.
- Carry what the run cannot re-derive; point at everything else. Test each item:
  *can Claude reach this with its own tools from the directory it runs in?* Yes
  → pass a path, pattern or command. No → copy it in. Session-bound intent and
  evidence that left no trace on disk are the copy-only case.
- Name the goal, the completion condition, the output destination, the permitted
  actions, and the decisions the user has kept. Point at the governing
  instructions rather than restating them.
- When the task needs a specific skill, plugin or MCP server, verify it is
  available in the target environment and name it in the prompt.
- Select the actual project directory with `-C`: it is where the run executes,
  so it is what the prompt's pointers resolve against. The invocation files are
  not among them — see **Where this runs**. `-a/--add-dir` grants extra reads; it
  does not replace the working directory. Apply the current task's repository
  isolation rules to delegated edits.

## Run and observe

- Record the run in a durable task record outside the run directory: the session
  id the wrapper prints, the task identity, and the working directory. The run
  directory is disposable; the record is what a later turn resumes from.
- Read the wrapper's stdout for `RUN_DIR:` and `SESSION_ID:`, plus `RESUMED:` or
  `FORKED_FROM:` when either applies. A `SESSION_ID_MISMATCH:` line means the id
  that actually exists is the one the stream reported — record that one.
- Summarize progress for the user from the run directory; leave the raw stream
  there rather than in the conversation.
- An empty completion file alone does not establish a stall. Text deltas, tool
  events and final results are distinct signals — read all three alongside
  process status before calling a run stuck.
- Before any mutating retry, confirm the prior process ended, and inspect the
  partial artifacts and external effects it left behind.

## Consult Mode

A consult asks for a judgment on a decision rather than for work to be carried
out — the reasoning is the deliverable, not a changed file. Three things differ.

- **The role is reviewing.** Say so in the prompt: the run is asked what it
  thinks of a decision, not to implement it. The permission mode permits writes,
  so the declared role is what keeps a consult from editing.
- **Carry the decision.** What the reviewer cannot re-derive is what is being
  chosen, the approach taken so far and where it is still uncommitted, and the
  item most often left out — **what would change the answer**, the evidence or
  outcome that would flip it. State those three; everything else goes through
  the pointer test above.
- **Take the reviewer's own words.** Pass `-o <FILE>` and read that file. A
  summary of a consult discards the part that mattered. Give the file the same
  per-invocation uniqueness as the prompt, plus the model name when consulting
  several models in parallel.

A consult invites follow-up, so pass the same `-C` again when resuming one: the
pointers mean nothing without the tree they were written against.

## Continue the conversation

To continue an identified session rather than start one — a correction sent back
within the turn that launched it, a later turn resuming it, a fork, or a failed
resume — read `references/resume.md`.

## Collect and verify

- The wrapper exits nonzero when the process failed, when the stream carried no
  result event, or when the result reports `is_error`. Treat any of those as a
  failed or incomplete run and preserve the run directory's diagnostic files.
  A created session or a written output file is not task completion.
- Reconcile `run.json` against the durable task record: `assigned_session_id`
  against `first_event_session_id`, and both against what was recorded at
  launch.
- Read the answer from `final.md`, or from the `-o` destination for a consult.
- Before reporting success, inspect the claimed artifact and run the checks its
  use calls for. Keep three things distinct in the report: what the run claimed,
  what this session verified, and what neither covered.
- In the final response, link the artifact, give the session id, say whether the
  conversation was new, resumed or forked, and state the verification outcome.
  Retain the run coordinates for subsequent corrections.

## Reference guide

- Read Anthropic's prompting best practices —
  https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
  — before writing a prompt file, and again whenever a run stopped early, asked a
  question instead of deciding, or returned a claim its artifacts do not support.
- Navigate that page by heading: `## Model-specific guidance` for per-model
  differences, `## General principles` for clarity, examples and XML structuring,
  `## Output and formatting`, `## Tool use`, `## Thinking and reasoning` for
  effort and extended thinking, `## Agentic systems` for unattended runs, stop
  conditions and subagents, `## Capability-specific tips`,
  `## Migration considerations`.
- For the technique index and interactive tutorials, read the prompt engineering
  overview —
  https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview
- For the harness this skill drives rather than the model it prompts, read Claude
  Code's programmatic-run page — https://code.claude.com/docs/en/headless — and
  its CLI reference — https://code.claude.com/docs/en/cli-reference. Verify a
  flag against the installed CLI's `--help` before relying on it.
