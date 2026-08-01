---
name: kimi-plus
description: |
  This skill should be used when the user asks to "run kimi", "use kimi", "delegate to kimi", "kimi resume", or requests frontend-delegation work suited to a lightweight resumable executor — scratchpad HTML iteration, visual/UI iteration loops, screenshot-to-component passes, component scaffolding, or mass boilerplate generation (stories, test skeletons). Executes tasks via the Claude Code CLI env-swapped to the Kimi K3 coding endpoint, with session management.
---

# Kimi Skill Guide

## Language
All prompts passed to `kimi-run.sh` MUST be in English.

## Prompt Delivery
1. Generate a short unique suffix (e.g., `a3f9`, timestamp fragment, or task keyword) for this invocation
2. Write the prompt to `<scratchpad>/kimi_prompt_<suffix>.txt` using the Write tool — `<scratchpad>` is the session's scratchpad directory, the `/private/tmp/…/scratchpad` path announced in the system prompt; writes there run without permission prompts. When no scratchpad directory is announced, fall back to `/private/tmp`.
3. Execute via wrapper script: `${CLAUDE_PLUGIN_ROOT}/scripts/kimi-run.sh [options] <scratchpad>/kimi_prompt_<suffix>.txt`

## Context Classification

Before writing the prompt file, classify available context on two orthogonal axes:

- **AI-verifiable × Session (already available)** — extract paths, patterns, commands as **Pointers**; the kimi session self-verifies them.
- **AI-verifiable × Exploration (needs collection)** — provide search hints and entry points; the kimi session self-explores from them.
- **User-specific × Session (already available)** — summarize intent, constraints, and preferences from the current session, **copy-only**.
- **User-specific × Exploration (needs collection)** — **blocked**; this cell carries no collection requests or questions.

**Test each item before including it**: *"Can the kimi session re-derive this from shared substrate with its own tools?"* — yes → pass a pointer; no → copy it in.

**Rules**:
- **Pointers**: Provide file paths, grep patterns, test commands. Reserve copying for what the kimi session cannot re-derive.
- **Session Context**: Extract only what is already known from the current conversation. Organize as intent, constraints, and preferences.
- **No collection requests**: The prompt carries only user-specific information already in hand; when kimi needs more, the user supplies it on resume.

### Prompt Template

Structure `<scratchpad>/kimi_prompt_<suffix>.txt` with these sections:

    ## Task
    [User's request — framed as a complete end-to-end objective]

    ## Pointers
    - files: [relevant file paths for kimi to read/verify]
    - patterns: [grep patterns or keywords to explore]
    - commands: [test/build commands if relevant]

    ## Session Context
    - intent: [user's goal in one sentence]
    - constraints: [limitations, compatibility requirements]
    - preferences: [coding style, library choices, conventions]

Omit empty sections.

## Intended Role

Kimi is a lightweight, resumable headless coding executor packaged like `codex-plus` but scoped to a different lane:

- **Visual/UI iteration loops** — scratchpad HTML iteration, screenshot-to-component passes, quick front-end prototyping cycles.
- **Mass boilerplate generation** — component scaffolding, stories, test skeletons, repetitive structural code.

Cross-vendor second opinions (architecture review, root-cause analysis, high-stakes reasoning) stay with `codex-plus`. This skill is the frontend-delegation executor lane.

**A kimi run cannot spawn subagents.** Split a task that seems to need one and issue the pieces yourself. When a returned artifact does not look like kimi's work, check the run log for a handoff to another tier before concluding the model underperformed.

## Running a Task
1. Run with the defaults — `k3[1m]` at `high` effort, thinking on. The default carries the 1M window, so long-context work (multi-file refactors, very large scratchpad sessions) needs no flag.

   **One model, one window.** The context-window variables are pinned to 1M and do not follow `-m`, which is an unvalidated passthrough. `-m k3-256k` drops to the fixed 256K model at roughly half the quota while the window declaration stays at 1M — reach for it when a run plainly does not need the window and that mismatch is acceptable.

   **Effort — `high` or `max`.** `high` is the default and carries most frontend and artifact work. Pass `-r max` when the run turns on real design judgment rather than when a task merely feels important. What the choice costs is quota (see Quota Awareness), not time.
2. Select sandbox mode; default to `read-only` unless the task requires edits. Escalate to `workspace-write` for edit tasks with user awareness. Choose `auto` when the task must run its own verification — `workspace-write` permits file edits but still denies arbitrary Bash, so a linter, build, or test will not run under it; `auto` puts a classifier in front of each action instead, so those commands execute while a review layer remains. Under `auto`, state the task's boundary in the prompt itself (what it may touch, what it must not) — that conveyed boundary is what the review layer binds to. `danger-full-access` removes the review layer entirely and requires explicit permission (see Error Handling).
3. Craft prompt per Context Classification and Prompt Template — classify context, write to `<scratchpad>/kimi_prompt_<suffix>.txt`.
4. Run `kimi-run.sh` as a background job (Bash `run_in_background=true`) — never run it blocking inline in the main session. Backgrounding frees the main session: it runs detached (do other work; the session is re-invoked when the job exits) instead of freezing on a multi-minute run. The command: `${CLAUDE_PLUGIN_ROOT}/scripts/kimi-run.sh [options] <scratchpad>/kimi_prompt_<suffix>.txt` with `-m MODEL` / `-r EFFORT` / `-s SANDBOX` / `-C DIR`, or `-S <SESSION_ID>` to resume. Details:
   - **mid-run progress via the scratchpad stream file**: the wrapper streams claude's event log to `<scratchpad>/kimi_prompt_<suffix>.stream.jsonl` (co-located with the prompt file). Open it on demand to check a long run mid-flight — byte-bound it (`tail -c`) or `jq` for the events you care about (a bare line-based `tail` will not cap it: one JSONL event can be many MB). Expect **buffered bursts, not a smooth live tick**: a mid-run read shows accumulated progress arriving in chunks with quiet gaps (the thinking-phase `thinking_tokens` events are the main live signal), and the answer lands as one event near completion — so a quiet gap is not a stalled run;
   - **result + resume handle**: on completion the script prints kimi's RESULT text and, as its final stdout line, `SESSION_ID: <uuid>`. Recover the SESSION_ID with a **bounded `tail` of the job's output file** (`tail -c` / `tail -n`), not the inline Bash result: a large RESULT (over ~30K chars) is shown as a preview from the START and spilled to a file, so the trailing SESSION_ID line drops out of the inline view — and `-o` routes only the RESULT text, never the SESSION_ID line, so it is no substitute;
   - pass `-o <FILE>` to also route the RESULT text to a file you read deliberately — the answer can be a large artifact (a generated HTML page, say). `<FILE>` must be non-empty and must not be the reserved `<prompt>.stream.jsonl` path (the RESULT write would clobber the diagnostic stream).
5. Record each returned `SESSION_ID` against its purpose. This {purpose → SESSION_ID} map is the only resume handle.
6. Resume: write new instructions to a fresh `<scratchpad>/kimi_prompt_<suffix>.txt`, then background-run `${CLAUDE_PLUGIN_ROOT}/scripts/kimi-run.sh -S <SESSION_ID> <scratchpad>/kimi_prompt_<suffix>.txt` (same `run_in_background=true` pattern). See Session Discipline below before resuming with a non-default model.
7. Summarize the outcome to the user. Inform the user: "Resume anytime with the recorded SESSION_ID."

## Session Discipline

One model and one effort level per session — changing either mid-session invalidates the prompt cache and charges the re-prefill to quota. Pass the same `-m MODEL` and `-r EFFORT` on every `-S` resume; the script does not remember them, so track both in the {purpose → SESSION_ID} map.

## Quota Awareness

Quota refreshes on a 7-day cycle from the subscription date and does not carry over, with a rolling 5-hour window on top of it. Every logged-in device and API key draws on the same pool, so a wall reached here was not necessarily spent here. On quota or 429-style errors, stop and report to the user — never retry-loop against a quota wall.

## Prerequisites

- A Kimi Code membership carrying the 1M tier. The wrapper pins its window to match; a membership without it would need `-m` on every run.
- Thinking stays on. A thinking-disabled request routes K3 and K2.7 Code to K2.6, a downgrade that surfaces as lower quality rather than an error, so keep `MAX_THINKING_TOKENS` positive (the wrapper defaults it to 32000) and raise it when a task needs a deeper budget.
- The Kimi coding key exported as `MOONSHOT_CODING_KEY` before invoking; sourcing it is machine-local setup outside this plugin's concern. `kimi-run.sh` reads it from the env, confines it to claude's process, and never persists it.

## Error Handling
- **The wrapper does not reword runtime failures.** On any nonzero exit from the work itself, the underlying tool's own stderr and exit code pass straight through. Read that raw output as the diagnostic; for a claude or jq failure the full event log is in `<prompt>.stream.jsonl`. Pre-flight validation is the exception — a bad flag, a missing prompt file, absent `jq`, an unknown sandbox tier, or an unset `MOONSHOT_CODING_KEY` emits a one-line `Error:` and exits 1 before any tool runs.
- **A successful (exit 0) run can still carry an empty result — check for it; the wrapper does not.** The script prints whatever the final `result` event held, extracting `.result` and `.session_id` independently — so the two empty-result shapes differ. If the stream carried **no result event at all**, both the RESULT and the `SESSION_ID` line come back empty. If it carried a **result event with an error subtype and no `.result`** (quota exhausted, max turns, cancellation), the RESULT is empty but the `SESSION_ID` line is still present — resume works even when the answer is empty. Either way the exit code is 0, so do not trust it alone: when the result is empty, open the stream file and read the final result event's `subtype`/`is_error` for the cause.
- **Validate the `SESSION_ID` line independently of RESULT.** `.session_id` is extracted separately from `.result`, so a perfectly good RESULT can still come back with an empty `SESSION_ID: ` line (a result event carrying a missing, empty, or non-string `session_id`). Exit is 0 and the RESULT looks fine, so the empty-result check above never fires — check the SESSION_ID line on its own, and if it is empty treat the resume handle as lost (open the stream file for the session id, or accept the session is not resumable) rather than recording a blank handle in the {purpose → SESSION_ID} map.
- When inspecting the stream file, use byte-bounded reads (`tail -c` / `head -c`) or a `jq` field projection — never bare line-based `head`/`tail` (a single JSONL event can be many MB and a line count will not cap it), and never `cat` it whole into context.
- `-o <FILE>` is written only after a successful run — the RESULT text and the `SESSION_ID` line are already on stdout by then — so an unwritable `-o` path fails late, with the resume handle already delivered.
- Unset `MOONSHOT_CODING_KEY`: a one-line pre-flight error names it and exits 1; export the key before retrying.
- Before using `-s danger-full-access`, ask the user for permission unless it was already given.
- Quota/429-style errors: stop immediately, report, do not retry-loop (see Quota Awareness). A quota failure can arrive as claude's raw error, or as an empty-result exit-0 run (above) — check both.

### Quick Reference
Each command below runs as a **background job** (`run_in_background=true`); check progress mid-run by opening the co-located `<scratchpad>/kimi_prompt_<suffix>.stream.jsonl` on demand, and read the `SESSION_ID: <uuid>` line from the job's output when it exits.

Base patterns:
- Read-only analysis — `${CLAUDE_PLUGIN_ROOT}/scripts/kimi-run.sh <scratchpad>/kimi_prompt_<suffix>.txt`
- Apply edits — `${CLAUDE_PLUGIN_ROOT}/scripts/kimi-run.sh -s workspace-write <scratchpad>/kimi_prompt_<suffix>.txt`
- Edit and self-verify (lint/build/test) — `${CLAUDE_PLUGIN_ROOT}/scripts/kimi-run.sh -s auto <scratchpad>/kimi_prompt_<suffix>.txt`
- Resume a session — `${CLAUDE_PLUGIN_ROOT}/scripts/kimi-run.sh -S <SESSION_ID> <scratchpad>/kimi_prompt_<suffix>.txt`

Modifiers, added to any base pattern above:
- Different working directory — `-C <DIR>`
- Cheaper, narrower run — `-m k3-256k` drops to the fixed 256K model at roughly half the quota. The window declaration stays pinned at 1M, so use it only when that mismatch is acceptable
- Long context is the default — `k3[1m]` needs no flag
- Deeper reasoning — `-r max` (the default is `high`); an unaccepted value is rejected before the run rather than silently discarded
- Capture the answer to a file — `-o <FILE>` writes kimi's final result text to FILE

## Following Up
After `kimi-run.sh` completes, use `AskUserQuestion` to confirm next steps when the outcome is ambiguous or partial.
