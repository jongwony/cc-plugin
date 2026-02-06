---
name: codex
description: |
  This skill should be used when the user asks to "run codex", "use codex CLI", "delegate to codex", "codex resume", or "continue with codex". Executes tasks via OpenAI Codex CLI with model selection, reasoning effort configuration, and session management.
---

# Codex Skill Guide

## Language
All prompts passed to `codex` MUST be in English.

## Prompt Delivery
1. Write the prompt to a temporary file using the Write tool
2. Pipe the file content to codex: `cat /tmp/codex_prompt.txt | codex exec ...`

## Running a Task
1. Ask the user (via `AskUserQuestion`) which model and reasoning effort in a **single prompt with two questions**.

| Model | Characteristics |
|-------|-----------------|
| `gpt-5.3-codex` | Current default agentic coding model |
| `gpt-5.2-codex` | Prior-generation agentic coding model |
| `gpt-5.1-codex-max` | Codex-optimized flagship for deep and fast reasoning |
| `gpt-5.2` | General-purpose frontier model (knowledge, reasoning, coding) |
2. Select sandbox mode; default to `--sandbox read-only` unless edits or network access are necessary.
3. Assemble command with options (always include `--skip-git-repo-check`):
   - `-m, --model <MODEL>` / `--config model_reasoning_effort="<medium|high|xhigh>"`
   - `--sandbox <read-only|workspace-write|danger-full-access>` / `--full-auto` / `-C <DIR>`
4. Resume: `cat /tmp/codex_prompt.txt | codex exec --skip-git-repo-check resume --last 2>/dev/null`. If user requests different model/reasoning, insert flags between `exec` and `resume`.
5. Append `2>/dev/null` to suppress thinking tokens (stderr). Show stderr only for debugging.
6. Run command, summarize outcome, inform user: "Resume anytime with 'codex resume'."

### Quick Reference
| Use case | Command pattern |
| --- | --- |
| Read-only analysis | `codex exec --skip-git-repo-check -m MODEL --config ... --sandbox read-only 2>/dev/null` |
| Apply edits | `... --sandbox workspace-write --full-auto 2>/dev/null` |
| Network access | `... --sandbox danger-full-access --full-auto 2>/dev/null` |
| Resume session | `cat FILE \| codex exec --skip-git-repo-check resume --last 2>/dev/null` |
| Different dir | Add `-C <DIR>` to any command |

## Following Up
After `codex` completes, use `AskUserQuestion` to confirm next steps. Restate model/reasoning/sandbox when proposing actions.

## Error Handling
- Stop and report failures whenever `codex --version` or a `codex exec` command exits non-zero; request direction before retrying.
- Before you use high-impact flags (`--full-auto`, `--sandbox danger-full-access`, `--skip-git-repo-check`) ask the user for permission using AskUserQuestion unless it was already given.
- When output includes warnings or partial results, summarize them and ask how to adjust using `AskUserQuestion`.

## Reference Guides (Jupyter Notebooks)

Three OpenAI prompting guides are available as Jupyter notebooks. Read the appropriate notebook when detailed guidance is needed.

### When to Read References

| User Question Type | Read This File |
|-------------------|----------------|
| GPT-5.2 prompting, verbosity control, scope discipline, migration | `references/gpt-5-2_prompting_guide.ipynb` |
| GPT-5.1 agentic steerability, metaprompting, solution_persistence | `references/gpt-5-1_prompting_guide.ipynb` |
| Codex-Max starter prompt, tools (apply_patch, shell), compaction | `references/gpt-5-1-codex-max_prompting_guide.ipynb` |

> If no model-specific guide exists, use the nearest lower version's guide as fallback (e.g., for gpt-5.3-codex, use the GPT-5.2 guide).

### GPT-5.2 Guide
**File**: `references/gpt-5-2_prompting_guide.ipynb`

Key sections (grep patterns for navigation):
- `Key behavioral differences` - Changes from GPT-5.1: deliberate scaffolding, lower verbosity, stronger instruction adherence
- `Controlling verbosity` - Length constraints via `<output_verbosity_spec>` block
- `Preventing Scope drift` - Prevent feature creep via `<design_and_scope_constraints>` block
- `Long-context` - Handle 10k+ tokens via `<long_context_handling>` block
- `uncertainty_and_ambiguity` - Hallucination prevention, clarification question patterns
- `Compaction` - Extended context management via `/responses/compact` endpoint
- `Prompt Migration Guide` - reasoning_effort mapping table (read reference for details)

### GPT-5.1 General Guide
**File**: `references/gpt-5-1_prompting_guide.ipynb`

Key sections (grep patterns for navigation):
- `Agentic steerability` - Personality, tone, verbosity control
- `solution_persistence` - End-to-end completion prompting
- `Using the "none" reasoning mode` - Low-latency non-reasoning usage
- `How to metaprompt effectively` - Iterative prompt debugging

### GPT-5.1-Codex-Max Guide
**File**: `references/gpt-5-1-codex-max_prompting_guide.ipynb`

Key sections (grep patterns for navigation):
- `Recommended Starter Prompt` - Full production system prompt
- `Compaction` - Multi-hour context management
- `Apply_patch` - File editing tool implementation
- `Shell_command` - Terminal tool implementation
- `Parallel Tool Calling` - Batch tool execution patterns

## Prompt Crafting Workflow

1. **Clarify first**: Use `AskUserQuestion` for ambiguous requests before crafting prompts
2. **Structure the prompt**: Frame tasks as "complete end-to-end", include context, define constraints explicitly
3. **Execute and iterate**: Use metaprompting (root-cause analysis + surgical refinement) rather than complete rewrites
