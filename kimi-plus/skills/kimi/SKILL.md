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
2. Write the prompt to `/tmp/kimi_prompt_<suffix>.txt` using the Write tool
3. Execute via wrapper script: `${CLAUDE_PLUGIN_ROOT}/scripts/kimi-run.sh [options] /tmp/kimi_prompt_<suffix>.txt`

This per-invocation naming prevents file collisions across parallel sessions and team agents.

## Context Classification

Before writing the prompt file, classify available context on two orthogonal axes:

| | Session (already available) | Exploration (needs collection) |
|---|---|---|
| **AI-verifiable** | Extract paths, patterns, commands as **Pointers** — the kimi session self-verifies | Provide search hints, entry points — the kimi session self-explores |
| **User-specific** | Summarize intent, constraints, preferences from current session — **copy-only** | **Blocked** — no collection requests or questions |

**One boundary — Reference over Copy.** Both rows are two faces of the same partition: *re-derivability by the consumer*. The kimi session is the consumer that cannot re-derive the parent's session context, but CAN re-derive anything reachable under its `-C DIR` with its own tools. The AI-verifiable row is what it re-derives, so pass a **reference** (path / pattern / command); the User-specific row is what it cannot, so **copy** only that into the prompt. Operational test before each item: *"Can the kimi session re-derive this from shared substrate with its own tools?"* — yes → pass a pointer; no → copy it in.

**Rules**:
- **Pointers**: Provide file paths, grep patterns, test commands. Do not inline file contents — the kimi session re-derives them with its own tools, so a pointer is sufficient (copying is what you reserve for what it cannot re-derive).
- **Session Context**: Extract only what is already known from the current conversation. Organize as intent, constraints, and preferences.
- **No collection requests**: Never embed questions or requests for additional user-specific information in the prompt. If kimi needs more context, the user will resume with it.

### Prompt Template

Structure `/tmp/kimi_prompt_<suffix>.txt` with these sections:

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

Cross-vendor second opinions (architecture review, root-cause analysis, high-stakes reasoning) stay with `codex-plus`. This skill is the frontend-delegation executor lane, not a substitute for codex's review/analysis role.

## Running a Task
1. **No per-invocation model/effort ask** (unlike codex-plus) — defaults are `k3` (256K context, Moderato+) + `max` effort. Deviate only when the user explicitly names a different model (`k3[1m]`, `kimi-for-coding`, `kimi-for-coding-highspeed`) or effort. `k3[1m]` (1M context) is opt-in and plan-gated at a higher tier (see Prerequisites) — reserve it for genuinely long-context work (multi-file refactors, very large scratchpad sessions).
2. Select sandbox mode; default to `read-only` unless the task requires edits. Escalate to `workspace-write` for edit tasks with user awareness; `danger-full-access` requires explicit permission (see Error Handling).
3. Craft prompt per Context Classification and Prompt Template — classify context, write to `/tmp/kimi_prompt_<suffix>.txt`.
4. Delegate execution to a Bash subagent (Task tool) — never run `kimi-run.sh` directly in the main session. This keeps kimi's JSON response and full output out of the main context. Give the subagent:
   - the exact command: `${CLAUDE_PLUGIN_ROOT}/scripts/kimi-run.sh [options] /tmp/kimi_prompt_<suffix>.txt` with `-m MODEL` / `-r EFFORT` / `-s SANDBOX` / `-C DIR`, or `-S <SESSION_ID>` to resume.
   - return contract: run the command and return ONLY (a) a concise outcome summary and (b) the `SESSION_ID: <uuid>` line verbatim, exactly as the script prints it on its final stdout line.
5. Record each returned `SESSION_ID` against its purpose. This {purpose → SESSION_ID} map is the only resume handle.
6. Resume: write new instructions to a fresh `/tmp/kimi_prompt_<suffix>.txt`, then delegate to a Bash subagent running `${CLAUDE_PLUGIN_ROOT}/scripts/kimi-run.sh -S <SESSION_ID> /tmp/kimi_prompt_<suffix>.txt`. See Session Discipline below before resuming with a non-default model.
7. Summarize the outcome to the user. Inform the user: "Resume anytime with the recorded SESSION_ID."

## Session Discipline

One model per session. Switching models mid-session invalidates Moonshot's context cache and forces an expensive re-prefill. When resuming with `-S`, always pass the same `-m MODEL` the session started with — the script does not enforce or remember this, so track it in the {purpose → SESSION_ID} map alongside the model used.

## Quota Awareness

Kimi Code membership quota operates on a 7-day cycle plus a 5-hour rolling window, shared across devices and keys. On quota or 429-style errors, stop and report to the user — never retry-loop against a quota wall.

## Prerequisites

- A Kimi Code membership: Moderato tier or higher for the default `k3` (256K context). The opt-in `k3[1m]` (1M context) needs Allegretto or above — an Allegretto key was verified to be accepted for `k3[1m]` (2026-07), matching the official docs; the membership pricing page had been read as gating it at Allegro+, and that reading is not what the API enforces. Acceptance was confirmed at the call level only — it does not prove the server served a full 1M window rather than falling back.
- Keep thinking enabled. Per the Kimi Code docs, disabling it routes both K3 and K2.7 Code to K2.6 — a silent model downgrade, not an error.
- A coding key stored at gopass entry `api-key/kimi-coding`. `kimi-run.sh` pulls it at call time and never persists it.

## Error Handling
- Stop and report failures whenever a `kimi-run.sh` invocation exits non-zero; the script surfaces the raw JSON response on stderr — relay it and ask direction before retrying.
- Missing gopass entry (`api-key/kimi-coding`): surface the prerequisite to the user rather than attempting a workaround.
- Before using `-s danger-full-access`, ask the user for permission unless it was already given.
- Quota/429-style errors: stop immediately, report, do not retry-loop (see Quota Awareness).

### Quick Reference
Each command below runs **inside a Bash subagent**, which returns the outcome summary plus the `SESSION_ID: <uuid>` line.

| Use case | Command pattern |
| --- | --- |
| Read-only analysis | `${CLAUDE_PLUGIN_ROOT}/scripts/kimi-run.sh /tmp/kimi_prompt_<suffix>.txt` |
| Apply edits | `${CLAUDE_PLUGIN_ROOT}/scripts/kimi-run.sh -s workspace-write /tmp/kimi_prompt_<suffix>.txt` |
| Resume a session | `${CLAUDE_PLUGIN_ROOT}/scripts/kimi-run.sh -S <SESSION_ID> /tmp/kimi_prompt_<suffix>.txt` |
| Different dir | Add `-C <DIR>` to any pattern above |
| Custom model | Add `-m 'k3[1m]'` (plan-gated 1M opt-in) or `-r high` to any pattern above (name explicitly when deviating from defaults) |
| Capture answer to file | Add `-o <FILE>` to write kimi's final result text to FILE |

## Following Up
After `kimi-run.sh` completes, use `AskUserQuestion` to confirm next steps when the outcome is ambiguous or partial.
