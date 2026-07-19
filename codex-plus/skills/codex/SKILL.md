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

This per-invocation naming prevents file collisions across team agents sharing a session scratchpad; parallel sessions are already isolated by their own scratchpad directories.

## Context Classification

Before writing the prompt file, classify available context on two orthogonal axes:

- **AI-verifiable × Session (already available)** — extract paths, patterns, commands as **Pointers**; codex self-verifies them.
- **AI-verifiable × Exploration (needs collection)** — provide search hints and entry points; codex self-explores from them.
- **User-specific × Session (already available)** — summarize intent, constraints, and preferences from the current session, **copy-only**.
- **User-specific × Exploration (needs collection)** — **blocked**; this cell carries no collection requests or questions.

**One boundary — Reference over Copy.** Both rows are two faces of the same partition: *re-derivability by the consumer*. Codex is the consumer that cannot re-derive the parent's session context, but CAN re-derive anything reachable by its own tools under `-C DIR`. The AI-verifiable row is what codex re-derives, so pass a **reference** (path / pattern / command); the User-specific row is what it cannot, so **copy** only that into the prompt. Operational test before each item: *"Can codex re-derive this from shared substrate with its own tools?"* — yes → pass a pointer; no → copy it in.

**Rules**:
- **Pointers**: Provide file paths, grep patterns, test commands. A pointer is sufficient — codex re-derives the contents with its own tools, and copying is what you reserve for what it cannot re-derive.
- **Session Context**: Extract only what is already known from the current conversation. Organize as intent, constraints, and preferences.
- **No collection requests**: The prompt carries only user-specific information already in hand; when codex needs more, the user supplies it on resume. This bounds the content written into the prompt file, leaving pre-prompt orchestration free (e.g., `AskUserQuestion` for model selection).

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

Omit empty sections. `## Pointers` enables codex to self-verify; `## Session Context` provides copy-only background without requiring follow-up.

## Image Generation Requests

When the delegated task is image generation or image editing:

- Include `$imagegen` in the prompt so downstream clients treat it as an explicit image-generation request.
- Keep the local prompt here minimal and task-specific.
- Defer prompt construction details to the installed `imagegen` skill when available.
- Use `references/image-gen-models-prompting-guide.ipynb` only as the backing reference for model choice, prompt structure, text rendering, edits, and multi-image workflows.

## Running a Task
1. Ask the user (via `AskUserQuestion`) which model(s) and reasoning effort in a **single prompt with two questions**. Model selection is **multi-select** — multiple models can be chosen for parallel execution.

   Models to offer:
   - `gpt-5.6-sol` — current default model for Codex CLI tasks.
   - `gpt-5.6-terra` — balanced 5.6 variant; lighter usage, faster than Sol, same effort ladder.
   - `gpt-5.5` — supplementary model, the prior default.

   Reasoning effort is selected once and applied identically to all chosen models.

2. Select sandbox mode; default to `--sandbox read-only` unless edits or network access are necessary.
3. Craft prompt per Context Classification and Prompt Template — classify context, write to `<scratchpad>/codex_prompt_<suffix>.txt`.
4. Delegate execution to a Bash subagent (Task tool) — never run `codex-run.sh` directly in the main session. This keeps codex's verbose banner and full output out of the main context. Give the subagent:
   - the exact command: `${CLAUDE_PLUGIN_ROOT}/scripts/codex-run.sh [options] <scratchpad>/codex_prompt_<suffix>.txt` with `-m MODEL` / `-r EFFORT` / `-s SANDBOX` / `--full-auto` / `-C DIR`, or `-S <SESSION_ID>` to resume.
   - return contract: run the command and return ONLY (a) a concise outcome summary and (b) the session id. codex prints `session id: <uuid>` to stderr; the subagent extracts that line verbatim and returns it as `SESSION_ID: <uuid>`. The wrapper does no parsing — stderr is left unsuppressed precisely so the subagent can read the session id and any failure straight from the output.
   - **Single model**: one subagent call.
   - **Multiple models**: issue parallel subagent calls (one per model) in a single response — same prompt, sandbox, and effort, different `-m`. Each returns its own `SESSION_ID`.
5. Record each returned `SESSION_ID` against its purpose/model. This {purpose → SESSION_ID} map is the only resume handle.
6. Resume: write new instructions to a fresh `<scratchpad>/codex_prompt_<suffix>.txt`, then delegate to a Bash subagent running `${CLAUDE_PLUGIN_ROOT}/scripts/codex-run.sh -S <SESSION_ID> <scratchpad>/codex_prompt_<suffix>.txt`. Resume is always by explicit id, which stays deterministic under parallel sessions. The session keeps its original model/effort/sandbox/`-C` settings.
7. Summarize each outcome to the user; for parallel work, surface which `SESSION_ID` maps to which branch. Inform the user: "Resume anytime with 'codex resume'."

### Quick Reference
Each command below runs **inside a Bash subagent**, which returns the outcome summary plus the `session id: <uuid>` line as `SESSION_ID: <uuid>`.

Base patterns:
- Read-only analysis — `${CLAUDE_PLUGIN_ROOT}/scripts/codex-run.sh -m MODEL <scratchpad>/codex_prompt_<suffix>.txt`
- Apply edits — `${CLAUDE_PLUGIN_ROOT}/scripts/codex-run.sh -s workspace-write --full-auto <scratchpad>/codex_prompt_<suffix>.txt`
- Network access — `${CLAUDE_PLUGIN_ROOT}/scripts/codex-run.sh -s danger-full-access --full-auto <scratchpad>/codex_prompt_<suffix>.txt`
- Resume a session — `${CLAUDE_PLUGIN_ROOT}/scripts/codex-run.sh -S <SESSION_ID> <scratchpad>/codex_prompt_<suffix>.txt`; the explicit id is the resume path, deterministic under parallel sessions.

Modifiers, added to any base pattern above:
- Different working directory — `-C <DIR>`, applying to the non-resume patterns
- Model and effort — `-m gpt-5.6-terra`, `-r high`
- Capture the answer to a file — `-o <FILE>` writes codex's final message to FILE deterministically

## Following Up
After `codex` completes, use `AskUserQuestion` to confirm next steps. Restate model/reasoning/sandbox when proposing actions.

## Error Handling
- Stop and report failures whenever `codex --version` or a `codex exec` command exits non-zero; request direction before retrying.
- Before you use high-impact flags (`--full-auto`, `--sandbox danger-full-access`, `--skip-git-repo-check`) ask the user for permission using AskUserQuestion unless it was already given.
- When output includes warnings or partial results, summarize them and ask how to adjust using `AskUserQuestion`.

## Reference Guide

Read the reference when detailed GPT-5.4 prompting guidance is needed.

**File**: `references/gpt-5-4_prompting_guide.md`

Key sections (grep patterns for navigation):
- `Where GPT-5.4 is strongest` - Strengths: tone adherence, agentic robustness, evidence-rich synthesis, long-context analysis
- `Where explicit prompting still helps` - Weak spots: low-context tool routing, dependency-aware workflows, reasoning effort selection
- `Keep outputs compact` - Token efficiency via `<output_contract>` and `<verbosity_controls>` blocks
- `tool_persistence_rules` - Persistent tool use, dependency checks, parallel tool calling
- `completeness_contract` - Long-horizon task coverage and `<empty_result_recovery>` fallback
- `verification_loop` - Pre-commit verification, missing context gating, action safety
- `research_mode` - 3-pass research (plan → retrieve → synthesize) with citation rules
- `Prompting patterns for coding tasks` - Autonomy, persistence, intermediary updates, formatting, frontend tasks
- `Treat reasoning effort as a last-mile knob` - reasoning_effort selection: none/low/medium/high/xhigh guidance
- `phase` - Responses API phase parameter for long-running agents
- `Compaction` - Extended context management via `/responses/compact` endpoint

Read the image reference when the delegated task involves image generation, image editing, slides, diagrams, ads, UI mockups, in-image text, or image prompt tuning.

**File**: `references/image-gen-models-prompting-guide.ipynb`

Use the notebook directly instead of duplicating its per-use-case guidance here.

## Prompt Crafting Workflow

1. **Clarify first**: Use `AskUserQuestion` for ambiguous requests before crafting prompts
2. **Classify context**: Apply the 2×2 matrix (see Context Classification) — separate pointers from session context, block user-specific collection requests
3. **Structure the prompt**: Use the Prompt Template sections. Frame tasks as "complete end-to-end", define constraints explicitly
4. **Execute and iterate**: Use metaprompting (root-cause analysis + surgical refinement) rather than complete rewrites
