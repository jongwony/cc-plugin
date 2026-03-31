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
2. Write the prompt to `/tmp/codex_prompt_<suffix>.txt` using the Write tool
3. Execute via wrapper script: `${CLAUDE_PLUGIN_ROOT}/scripts/codex-run.sh [options] /tmp/codex_prompt_<suffix>.txt`

This per-invocation naming prevents file collisions across parallel sessions and team agents.

## Context Classification

Before writing the prompt file, classify available context on two orthogonal axes:

| | Session (already available) | Exploration (needs collection) |
|---|---|---|
| **AI-verifiable** | Extract paths, patterns, commands as **Pointers** — codex self-verifies | Provide search hints, entry points — codex self-explores |
| **User-specific** | Summarize intent, constraints, preferences from current session — **reference-only** | **Blocked** — no collection requests or questions |

**Rules**:
- **Pointers**: Provide file paths, grep patterns, test commands. Do not inline file contents — codex has its own tools to read and verify.
- **Session Context**: Extract only what is already known from the current conversation. Organize as intent, constraints, and preferences.
- **No collection requests**: Never embed questions or requests for additional user-specific information in the prompt. If codex needs more context, the user will resume with it. Blocked applies only to content written into `/tmp` prompt, not to pre-prompt orchestration (e.g., `AskUserQuestion` for model selection).

### Prompt Template

Structure `/tmp/codex_prompt_<suffix>.txt` with these sections:

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

Omit empty sections. `## Pointers` enables codex to self-verify; `## Session Context` provides reference-only background without requiring follow-up.

## Running a Task
1. Ask the user (via `AskUserQuestion`) which model(s) and reasoning effort in a **single prompt with two questions**. Model selection is **multi-select** — multiple models can be chosen for parallel execution.

| Model | Characteristics |
|-------|-----------------|
| `gpt-5.4` | Current default model for Codex CLI tasks |
| `gpt-5.3-codex` | Prior codex-specific coding model |

   Reasoning effort is selected once and applied identically to all chosen models.

2. Select sandbox mode; default to `--sandbox read-only` unless edits or network access are necessary.
3. Craft prompt per Context Classification and Prompt Template — classify context, write to `/tmp/codex_prompt_<suffix>.txt`.
4. Execute via `${CLAUDE_PLUGIN_ROOT}/scripts/codex-run.sh` with appropriate options:
   - `-m MODEL` / `-r EFFORT` / `-s SANDBOX` / `--full-auto` / `-C DIR`
   - **Single model**: run one Bash call as usual.
   - **Multiple models**: issue parallel Bash tool calls (one per model) in a single response. Each call uses the same prompt, sandbox, and reasoning effort but a different `-m` value.
5. Resume: Write new instructions to a fresh `/tmp/codex_prompt_<suffix>.txt`, then `${CLAUDE_PLUGIN_ROOT}/scripts/codex-run.sh --resume /tmp/codex_prompt_<suffix>.txt`. Resume applies to the last single session only. Codex tracks sessions internally — no external session ID needed.
6. Run command(s), summarize each outcome, inform user: "Resume anytime with 'codex resume'."

### Quick Reference
| Use case | Command pattern |
| --- | --- |
| Read-only analysis | `${CLAUDE_PLUGIN_ROOT}/scripts/codex-run.sh -m MODEL /tmp/codex_prompt_<suffix>.txt` |
| Apply edits | `${CLAUDE_PLUGIN_ROOT}/scripts/codex-run.sh -s workspace-write --full-auto /tmp/codex_prompt_<suffix>.txt` |
| Network access | `${CLAUDE_PLUGIN_ROOT}/scripts/codex-run.sh -s danger-full-access --full-auto /tmp/codex_prompt_<suffix>.txt` |
| Resume session | `${CLAUDE_PLUGIN_ROOT}/scripts/codex-run.sh --resume /tmp/codex_prompt_<suffix>.txt` (options like -m, -r, -s are ignored; uses last session settings) |
| Different dir | Add `-C <DIR>` to non-resume patterns above |
| Custom model | Add `-m gpt-5.3-codex -r high` to any pattern above |

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

## Prompt Crafting Workflow

1. **Clarify first**: Use `AskUserQuestion` for ambiguous requests before crafting prompts
2. **Classify context**: Apply the 2×2 matrix (see Context Classification) — separate pointers from session context, block user-specific collection requests
3. **Structure the prompt**: Use the Prompt Template sections. Frame tasks as "complete end-to-end", define constraints explicitly
4. **Execute and iterate**: Use metaprompting (root-cause analysis + surgical refinement) rather than complete rewrites
