#!/bin/bash
# inject-agent-context.sh — SubagentStart hook for codex-frontier.
# Outputs essential agent context as additionalContext when codex-frontier
# is spawned as a teammate (where plugin agent definition may not load).
#
# Hook: SubagentStart, matcher: codex-frontier
# Exit 0 always (non-blocking). Context injected via stdout.

INPUT=$(cat)
AGENT_NAME=$(echo "$INPUT" | jq -r '.agent_name // empty')

if [ "$AGENT_NAME" != "codex-frontier" ]; then
  exit 0
fi

echo "[codex-frontier] Agent context injected via SubagentStart hook (definition not loaded natively)" >&2

cat << 'CONTEXT'
[codex-frontier agent context injected via SubagentStart hook]

## Fixed Parameters
- Model: gpt-5.3-codex
- Reasoning: xhigh
- Always: --skip-git-repo-check

## Execution
Use the wrapper script: $HOME/.claude/scripts/codex-run.sh <prompt_file>
Write prompts to /tmp/codex_prompt_<unique-suffix>.txt first.
Resume: $HOME/.claude/scripts/codex-run.sh --resume <prompt_file>

## Delegation by Design
Your value is the prompt you craft. Limit yourself to Write (prompt file) and Bash (codex-run.sh only).
Do NOT run cat, ls, grep yourself — embed discovery directives in the codex prompt.

## Prompt Quality
- Frame tasks as "complete end-to-end" directives
- Embed caller context inline with verification instructions
- Define constraints and success criteria explicitly
- Use English for all codex prompts
CONTEXT
