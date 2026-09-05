---
name: codex-plus
description: |
  This skill should be used when the user asks to "run codex", "use codex CLI", "delegate to codex", "codex resume", or "continue with codex". Executes tasks via OpenAI Codex CLI with model selection, reasoning effort configuration, and session management.
---

# Codex Skill Guide

## Language
All prompts passed to `codex` MUST be in English.

## Prompt Delivery
1. Generate a short unique suffix (e.g., `a3f9`, timestamp fragment, or task keyword) for this invocation
2. Write the prompt to `<scratchpad>/codex_prompt_<suffix>.txt` using the Write tool — `<scratchpad>` is the session's scratchpad directory, the `/private/tmp/…/scratchpad` path announced in the system prompt; writes there run without permission prompts. When no scratchpad directory is announced, fall back to `/private/tmp`.
3. Execute via wrapper script: `${CLAUDE_PLUGIN_ROOT}/scripts/codex-run.sh [options] <scratchpad>/codex_prompt_<suffix>.txt`

## Context Classification

Before writing the prompt file, classify available context on two orthogonal axes:

- **AI-verifiable × Session (already available)** — extract paths, patterns, commands as **Pointers**; codex self-verifies them.
- **AI-verifiable × Exploration (needs collection)** — provide search hints and entry points; codex self-explores from them.
- **User-specific × Session (already available)** — summarize intent, constraints, and preferences from the current session, **copy-only**.
- **User-specific × Exploration (needs collection)** — **blocked**; this cell carries no collection requests or questions.

**Test each item before including it**: *"Can codex re-derive this from shared substrate with its own tools?"* — yes → pass a pointer; no → copy it in.

**Rules**:
- **Pointers**: Provide file paths, grep patterns, test commands. Reserve copying for what codex cannot re-derive.
- **Session Context**: Extract only what is already known from the current conversation. Organize as intent, constraints, and preferences.
- **No collection requests**: The prompt carries only user-specific information already in hand; when codex needs more, the user supplies it on resume. This bounds the prompt file only — pre-prompt orchestration stays free, so `AskUserQuestion` for model selection is fine.

### Prompt Template

Structure `<scratchpad>/codex_prompt_<suffix>.txt` with these sections:

    ## Task
    [User's request — framed as a complete end-to-end objective]

    ## Pointers
    - files: [relevant file paths for codex to read/verify]
    - patterns: [grep patterns or keywords to explore]
    - commands: [test/build commands if relevant]

    ## Session Context
    - intent: [user's goal in one sentence]
    - constraints: [limitations, compatibility requirements]
    - preferences: [coding style, library choices, conventions]

Omit empty sections.

## Consult Mode (review, not execution)

A consult asks codex to judge a decision rather than carry out work — the reasoning is the deliverable, not a changed file. Four things differ from a task run.

**Declare the role.** Every prompt this skill sends names the role codex is acting in, taken from what the request actually asks for rather than from a fixed set; a consult names a **reviewing** role — codex is asked what it thinks of a decision, not to implement it. Make that call yourself and write it down rather than leaving it to be inferred from the prompt's shape.

**Carry the decision; point at everything else.** The part codex cannot re-derive with its own tools is the decision — what is being chosen, the approach taken so far and where it is still uncommitted, and the item most often omitted: **what would change the answer**, the evidence or outcome that would flip it. State those. Everything else goes through `## Context Classification`'s test: a pointer when codex can re-derive it under `-C DIR`, copied in when it cannot — in practice the session-bound evidence that left no trace on disk. Codex searches for itself, and handing it the tools beats transcribing what the search would have found. A consult invites follow-up, so pass the same `-C` again when you resume one: the pointers mean nothing without the tree they were written against.

**Take the reviewer's own words, not the summary.** The run goes through a Bash subagent, so its outcome summary is normally all that comes back — which for a consult discards the part that mattered. Pass `-o <FILE>` to write codex's final message verbatim, then read that file instead of relying on the summary. Give that path the same per-invocation uniqueness as the prompt file, plus the model name when consulting several in parallel — one shared path and the reviewers overwrite each other, leaving an answer that reads complete but is not the one you think.

**Leave the sandbox at its default, and no ask when the caller already decided.** Do not reach for `-s`: the default is `workspace-write` with network access, and a consult routinely needs the network to check a claim against a live source rather than against its own recollection. The default permits writes, so what keeps a consult from editing is the reviewing role declared above — not the sandbox. When the caller arrives with the model and reasoning effort already fixed, use those and skip the model/effort question in `## Running a Task` step 1.

## Image Generation Requests

When the delegated task is image generation or image editing:

- Include `$imagegen` in the prompt so downstream clients treat it as an explicit image-generation request.
- Keep the local prompt here minimal and task-specific.
- Defer prompt construction details to the installed `imagegen` skill when available.
- Use `references/image-gen-models-prompting-guide.ipynb` only as the backing reference for model choice, prompt structure, text rendering, edits, and multi-image workflows.

## Running a Task
1. Run on `gpt-6-astra` at `medium` unless the caller named otherwise. Designation normally arrives upstream, in the request itself, so a model or effort already named there IS the answer — do not re-ask it.

   Ask (via `AskUserQuestion`, a **single prompt with two questions**; model selection is **multi-select**, so several models can run in parallel) only where the choice is genuinely open: neither model nor effort was named, and the task's shape does not settle them.

   Models:
   - `gpt-6-astra` — the default, used whenever no model was named. OpenAI's most capable model, for complex and demanding end-to-end work. It is also what `~/.codex/config.toml` already selects for interactive codex, so a run through this wrapper and a run the user starts by hand now land on the same model.
   - `gpt-5.6-sol` — the previous default; a reliable agentic workhorse for everyday tasks. The pick when capability is not what the task is short of, and astra's per-token cost is not worth paying.
   - `gpt-5.6-terra` — balanced agentic coding model; lighter usage, faster than Sol, same effort ladder.
   - `gpt-5.6-luna` — a "Fast and affordable agentic coding model" in codex's own registry; the cost-efficient pick for browser / computer-use E2E runs and implementation work that writes a lot of code, usually at `xhigh`.

   Reasoning effort is selected once and applied identically to all chosen models. `medium` is the wrapper's default and the starting point here — raise it to `high`, `xhigh` or `max` where the task's reasoning depth warrants. astra's ladder is `low|medium|high|xhigh|max` and has no `none` rung. `low` exists but is for latency-bound work; runs from this skill are unattended, where a cheap wrong answer costs a resume rather than saving time.

2. Select sandbox mode. Omitting `-s` gives `workspace-write` **with network access** — codex offers no network under `read-only` at all, so this is the only mode short of full access that has any. Pass `-s read-only` when a run must neither touch the tree nor reach off-machine; `-s danger-full-access` only when it must write outside the workspace. Because the default already permits writes, what bounds a run that is meant to only read is the role its prompt declares — state it.
3. Craft prompt per Context Classification and Prompt Template — classify context, write to `<scratchpad>/codex_prompt_<suffix>.txt`.
4. Delegate execution to a Bash subagent (Task tool) — never run `codex-run.sh` directly in the main session. This keeps codex's verbose banner and full output out of the main context. Give the subagent:
   - the exact command: `${CLAUDE_PLUGIN_ROOT}/scripts/codex-run.sh [options] <scratchpad>/codex_prompt_<suffix>.txt` with `-m MODEL` / `-r EFFORT` / `-s SANDBOX` / `-C DIR`, or `-S <SESSION_ID>` to resume.
   - return contract: run the command and return ONLY (a) a concise outcome summary and (b) the session id. codex prints `session id: <uuid>` to stderr; the subagent extracts that line verbatim and returns it as `SESSION_ID: <uuid>`. The wrapper does no parsing — stderr is left unsuppressed precisely so the subagent can read the session id and any failure straight from the output.
   - **Single model**: one subagent call.
   - **Multiple models**: issue parallel subagent calls (one per model) in a single response — same prompt, sandbox, and effort, different `-m`. Each returns its own `SESSION_ID`.
5. Record each returned `SESSION_ID` against its purpose/model. This {purpose → SESSION_ID} map is the only resume handle.
6. Resume: write new instructions to a fresh `<scratchpad>/codex_prompt_<suffix>.txt`, then delegate to a Bash subagent running `${CLAUDE_PLUGIN_ROOT}/scripts/codex-run.sh -S <SESSION_ID> <scratchpad>/codex_prompt_<suffix>.txt`. Resume is always by explicit id, which stays deterministic under parallel sessions. The session keeps its original model/effort/sandbox settings. `-C` is the exception: `codex exec resume` has no `--cd`, so pass the same `-C <DIR>` again and the wrapper restores it before handing off. Omit it and the resumed turn runs wherever the subagent happens to be, re-resolving every pointer against that tree without saying so.
7. Summarize each outcome to the user; for parallel work, surface which `SESSION_ID` maps to which branch. Inform the user: "Resume anytime with 'codex resume'."

### Quick Reference
Each command below runs **inside a Bash subagent**, which returns the outcome summary plus the `session id: <uuid>` line as `SESSION_ID: <uuid>`.

Base patterns:
- Analysis or unattended edits, network reachable — `${CLAUDE_PLUGIN_ROOT}/scripts/codex-run.sh -m MODEL <scratchpad>/codex_prompt_<suffix>.txt` (the default sandbox: workspace-write, network on — it applies edits without prompting, because `codex exec` is headless and has no approval step to opt out of)
- Neither writes nor network — `${CLAUDE_PLUGIN_ROOT}/scripts/codex-run.sh -s read-only <scratchpad>/codex_prompt_<suffix>.txt`
- Write outside the workspace — `${CLAUDE_PLUGIN_ROOT}/scripts/codex-run.sh -s danger-full-access <scratchpad>/codex_prompt_<suffix>.txt`
- Resume a session — `${CLAUDE_PLUGIN_ROOT}/scripts/codex-run.sh -S <SESSION_ID> <scratchpad>/codex_prompt_<suffix>.txt`; the explicit id is the resume path, deterministic under parallel sessions.

Modifiers, added to any base pattern above:
- Different working directory — `-C <DIR>`; pass it again on resume (step 6)
- Model and effort — `-m gpt-5.6-sol`, `-r xhigh` (effort defaults to `medium`; `-r` raises it)
- Capture the answer to a file — `-o <FILE>` writes codex's final message to FILE deterministically

## Following Up
After `codex` completes, use `AskUserQuestion` to confirm next steps. Restate model/reasoning/sandbox when proposing actions.

## Error Handling
- Stop and report failures whenever `codex --version` or a `codex exec` command exits non-zero; request direction before retrying.
- Before you use high-impact flags (`--sandbox danger-full-access`, `--skip-git-repo-check`) ask the user for permission using AskUserQuestion unless it was already given.
- When output includes warnings or partial results, summarize them and ask how to adjust using `AskUserQuestion`.

## Reference Guide

Read the reference before writing a prompt for `gpt-6-astra`, and again whenever a
run came back having stopped early or asked a question instead of deciding.

**File**: `references/gpt-6-astra_prompting_guide.md`

Key sections (grep patterns for navigation):
- `## Model facts` - effort ladder, context window, knowledge cutoff, price, parameters to stop sending
- `## Autonomy and stop conditions` - astra asks non-blocking questions by default; what an unattended `codex exec` prompt has to state in place of that
- `## Instruction priority` - astra weighs in-context material more heavily, and conflicting guidance in a skill file stops work early
- `## Context discipline` - why this skill's pointer-over-copy rule matters more under astra rather than less
- `## Reconcile before switching` - what to send when astra's answer contradicts evidence already in hand
- `## Choosing an effort rung` - reading the rung off the task instead of off habit
- `## Subagents` - what a spawned agent inherits, and how to override it

**Historical**: `references/gpt-5-4_prompting_guide.md` is the GPT-5.4-era guide,
kept for provenance. Do not prompt against it — it describes a model this skill no
longer runs, and its migration table stops two generations back. Read it only to
see what a pattern used to say.

Read the image reference when the delegated task involves image generation, image editing, slides, diagrams, ads, UI mockups, in-image text, or image prompt tuning.

**File**: `references/image-gen-models-prompting-guide.ipynb`

Use the notebook directly instead of duplicating its per-use-case guidance here.

Read the Chrome reference **before** delegating a browser or computer-use task.
Driving Chrome from codex needs a bootstrap and a tool name that are not
discoverable from the task, and the most common failure — `codex` on `PATH`
resolving to a wrapper with its own `CODEX_HOME` — presents as a browser problem
while all four bundled diagnostics still exit `0`.

**File**: `references/chrome.md`

It carries the setup, the operation surface, and a symptom table. Do not read the
troubleshooting reference up front — the symptom table says when to load it.

**File**: `references/chrome-troubleshooting.md`

Load it only after a browser run has actually failed, matching the symptom first.
