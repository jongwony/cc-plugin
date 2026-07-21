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

This per-invocation naming prevents file collisions across team agents sharing a session scratchpad; parallel sessions are already isolated by their own scratchpad directories.

## Context Classification

Before writing the prompt file, classify available context on two orthogonal axes:

- **AI-verifiable × Session (already available)** — extract paths, patterns, commands as **Pointers**; the kimi session self-verifies them.
- **AI-verifiable × Exploration (needs collection)** — provide search hints and entry points; the kimi session self-explores from them.
- **User-specific × Session (already available)** — summarize intent, constraints, and preferences from the current session, **copy-only**.
- **User-specific × Exploration (needs collection)** — **blocked**; this cell carries no collection requests or questions.

**One boundary — Reference over Copy.** Both rows are two faces of the same partition: *re-derivability by the consumer*. The kimi session is the consumer that cannot re-derive the parent's session context, but CAN re-derive anything reachable under its `-C DIR` with its own tools. The AI-verifiable row is what it re-derives, so pass a **reference** (path / pattern / command); the User-specific row is what it cannot, so **copy** only that into the prompt. Operational test before each item: *"Can the kimi session re-derive this from shared substrate with its own tools?"* — yes → pass a pointer; no → copy it in.

**Rules**:
- **Pointers**: Provide file paths, grep patterns, test commands. A pointer is sufficient — the kimi session re-derives the contents with its own tools, and copying is what you reserve for what it cannot re-derive.
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

Omit empty sections. `## Pointers` enables the kimi session to self-verify; `## Session Context` provides copy-only background without requiring follow-up.

## Intended Role

Kimi is a lightweight, resumable headless coding executor packaged like `codex-plus` but scoped to a different lane:

- **Visual/UI iteration loops** — scratchpad HTML iteration, screenshot-to-component passes, quick front-end prototyping cycles.
- **Mass boilerplate generation** — component scaffolding, stories, test skeletons, repetitive structural code.

Cross-vendor second opinions (architecture review, root-cause analysis, high-stakes reasoning) stay with `codex-plus`. This skill is the frontend-delegation executor lane.

**The kimi session is the end of the chain.** It loads ambient `CLAUDE.md` and `rules/*.md` for its own working directory — the user-global layer always, plus the project layer of whatever `-C DIR` points at — including a Tier Registry that routes frontend work here and delegates non-trivial edits to an executor. A user-global Tier Registry therefore reaches the child no matter which repo it runs in. Those rules read as true inside the wrapper too, and they carry no termination condition, so an unpinned session concludes it should delegate rather than execute: it attempts the recursive skill call, and when that is blocked it does not conclude it is the executor — it spawns a subagent on some other tier instead. That run still exits 0 with a file on disk, so the failure is silent: the deliverable exists but the model you asked for never produced it.

`kimi-run.sh` closes this on two layers. It denies both delegation channels it can deny — the recursive skill call and the subagent tool (`Task`) — via `--disallowedTools`, so those are enforced by the CLI rather than left to the model's compliance. It also pins an executor stance via `--append-system-prompt`, which applies on resume as well. The stance is what covers the one channel that cannot be denied: shelling out to another CLI through Bash, whose reachability varies by sandbox tier and by what the permission layer makes of the specific command rather than being closed outright anywhere. So a kimi run cannot spawn subagents at all — if a task seems to need that, it needs to be split by the caller instead. When a returned artifact does not look like kimi's work, check the run log for a fallback-tier handoff before assuming the model underperformed.

## Running a Task
1. Run with the defaults — `k3` (256K context) at `max` effort, thinking on — and pass a different model or effort only when the user names one. For genuinely long-context work (multi-file refactors, very large scratchpad sessions), `-m 'k3[1m]'` opens the 1M window; `kimi-run.sh -h` lists the remaining values.
2. Select sandbox mode; default to `read-only` unless the task requires edits. Escalate to `workspace-write` for edit tasks with user awareness. Choose `auto` when the task must run its own verification — `workspace-write` permits file edits but still denies arbitrary Bash, so a linter, build, or test will not run under it; `auto` puts a classifier in front of each action instead, so those commands execute while a review layer remains. Under `auto`, state the task's boundary in the prompt itself (what it may touch, what it must not) — that conveyed boundary is what the review layer binds to. `danger-full-access` removes the review layer entirely and requires explicit permission (see Error Handling).
3. Craft prompt per Context Classification and Prompt Template — classify context, write to `<scratchpad>/kimi_prompt_<suffix>.txt`.
4. Run `kimi-run.sh` as a background job (Bash `run_in_background=true`) — never run it blocking inline in the main session. Backgrounding serves two ends at once: it keeps kimi's full JSON output in the job's output file (out of the main context unless you read it), and it gives pollable liveness on long runs — a blocking or subagent run is a black box until it returns, which is the silent-multi-minute-run problem. The command: `${CLAUDE_PLUGIN_ROOT}/scripts/kimi-run.sh [options] <scratchpad>/kimi_prompt_<suffix>.txt` with `-m MODEL` / `-r EFFORT` / `-s SANDBOX` / `-C DIR`, or `-S <SESSION_ID>` to resume. Keep the bulk out of context:
   - pass `-o <FILE>` so kimi's final result text lands in a file you read deliberately, not inline;
   - while it runs, poll progress with BashOutput and read only bounded slices — a `tail`, or an on-demand `grep`/`jq` over the output file when you actually need to filter the event stream (not an always-on transform); the session is re-invoked when the job exits;
   - capture the `SESSION_ID: <uuid>` line — the script's final stdout line — from the completed output.
5. Record each returned `SESSION_ID` against its purpose. This {purpose → SESSION_ID} map is the only resume handle.
6. Resume: write new instructions to a fresh `<scratchpad>/kimi_prompt_<suffix>.txt`, then background-run `${CLAUDE_PLUGIN_ROOT}/scripts/kimi-run.sh -S <SESSION_ID> <scratchpad>/kimi_prompt_<suffix>.txt` (same `run_in_background=true` pattern). See Session Discipline below before resuming with a non-default model.
7. Summarize the outcome to the user. Inform the user: "Resume anytime with the recorded SESSION_ID."

## Session Discipline

One model per session. Switching models mid-session invalidates Moonshot's context cache and forces an expensive re-prefill. When resuming with `-S`, always pass the same `-m MODEL` the session started with — the script does not enforce or remember this, so track it in the {purpose → SESSION_ID} map alongside the model used.

## Quota Awareness

Kimi Code membership quota operates on a 7-day cycle plus a 5-hour rolling window, shared across devices and keys. On quota or 429-style errors, stop and report to the user — never retry-loop against a quota wall.

## Prerequisites

- A Kimi Code membership: Moderato or higher for the default `k3` (256K context); `k3[1m]` (1M context) needs Allegretto or above, verified accepted at the call level (2026-07) — acceptance on its own leaves open whether a full 1M window was served.
- Thinking runs on by default and stays on: the Kimi Code docs state that a thinking-disabled request routes K3 and K2.7 Code to K2.6, a downgrade that surfaces as lower quality rather than an error. `kimi-run.sh` exports a positive `MAX_THINKING_TOKENS` (default 32000); keep it positive, and raise it when a task needs a deeper budget. Verified 2026-07: the default configuration returns real thinking content on the stream.
- A coding key stored at gopass entry `api-key/kimi-coding`. `kimi-run.sh` pulls it at call time and never persists it.

## Error Handling
- Stop and report failures whenever a `kimi-run.sh` invocation exits non-zero. When the failure came from claude or from processing its response, the script surfaces the raw JSON on stderr — relay it and ask direction before retrying. Setup failures (bad arguments, a missing prompt file, an unreachable `-C` directory, a missing gopass entry, an unwritable `-o` path) print a one-line stderr message instead, with no JSON to relay.
- Missing gopass entry (`api-key/kimi-coding`): surface the prerequisite to the user rather than attempting a workaround.
- Before using `-s danger-full-access`, ask the user for permission unless it was already given.
- Quota/429-style errors: stop immediately, report, do not retry-loop (see Quota Awareness).

### Quick Reference
Each command below runs as a **background job** (`run_in_background=true`); poll it with BashOutput while it runs and read the `SESSION_ID: <uuid>` line from its output when it exits.

Base patterns:
- Read-only analysis — `${CLAUDE_PLUGIN_ROOT}/scripts/kimi-run.sh <scratchpad>/kimi_prompt_<suffix>.txt`
- Apply edits — `${CLAUDE_PLUGIN_ROOT}/scripts/kimi-run.sh -s workspace-write <scratchpad>/kimi_prompt_<suffix>.txt`
- Edit and self-verify (lint/build/test) — `${CLAUDE_PLUGIN_ROOT}/scripts/kimi-run.sh -s auto <scratchpad>/kimi_prompt_<suffix>.txt`
- Resume a session — `${CLAUDE_PLUGIN_ROOT}/scripts/kimi-run.sh -S <SESSION_ID> <scratchpad>/kimi_prompt_<suffix>.txt`

Modifiers, added to any base pattern above:
- Different working directory — `-C <DIR>`
- Long-context opt-in — `-m 'k3[1m]'`, plan-gated at a higher membership tier
- Change reasoning effort — `-r EFFORT` (the default is already `max`, the ceiling; `-r high` is *lower*, for lighter runs)
- Capture the answer to a file — `-o <FILE>` writes kimi's final result text to FILE

## Following Up
After `kimi-run.sh` completes, use `AskUserQuestion` to confirm next steps when the outcome is ambiguous or partial.
