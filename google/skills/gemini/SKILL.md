---
name: gemini
description: |
  This skill should be used when the user asks to "run gemini", "use gemini CLI", "delegate to gemini", "gemini resume", or "continue with gemini". Executes tasks via Gemini CLI with model selection, approval modes, and session management.
---

# Gemini CLI Skill Guide

## Running a Task
1. **Model Selection**:
   - By default, use the latest Preview model (omit `-m` flag)
   - Only ask the user (via `AskUserQuestion`) which specific model to use if the task requires a particular model
2. Select the approval mode based on the task:
   - `default`: For read-only analysis (prompt for all tool approvals)
   - `auto_edit`: For editing tasks (auto-approve edit tools)
   - `yolo`: For full automation (auto-approve all tools)
3. Assemble the command with the appropriate options:
   - `-m, --model <MODEL>`
   - `--approval-mode <default|auto_edit|yolo>`
   - `-s, --sandbox` (if sandbox environment is needed)
   - `--allowed-tools <tool1,tool2>` (to allow specific tools without confirmation)
   - `--include-directories <dir1,dir2>` (to include additional directories)
4. For non-interactive prompts, use positional arguments or stdin:
   - `gemini "your prompt here"` (one-shot mode)
   - `echo "your prompt" | gemini` (stdin mode)
5. For interactive sessions, use `-i, --prompt-interactive`:
   - `gemini -i "initial prompt"` (starts interactive mode after executing prompt)
6. Run the command, capture stdout, and summarize the outcome for the user.
7. **After Gemini completes**, inform the user: "You can resume this Gemini session at any time by saying 'gemini resume' or asking me to continue with additional analysis or changes."

### Quick Reference
| Use case | Approval mode | Key flags |
| --- | --- | --- |
| Read-only review or analysis | `default` | `--approval-mode default` |
| Apply local edits | `auto_edit` | `--approval-mode auto_edit` |
| Full automation | `yolo` | `--approval-mode yolo` or `-y` |
| Resume most recent session | Inherited from original | `--resume latest` |
| Resume specific session | Inherited from original | `--resume <index>` |
| List available sessions | N/A | `--list-sessions` |
| Interactive mode | As needed | `-i "prompt"` |
| Sandbox environment | As needed | `-s` or `--sandbox` |

## Session Management
- **Resume latest session**: `gemini --resume latest "new prompt"`
- **Resume specific session**: `gemini --resume 5 "new prompt"` (use session index)
- **List sessions**: `gemini --list-sessions`
- **Delete session**: `gemini --delete-session <index>`
- Resumed sessions automatically inherit the model and approval mode from the original session.

## Following Up
- After every `gemini` command, immediately use `AskUserQuestion` to confirm next steps, collect clarifications, or decide whether to resume the session.
- When resuming, use `gemini --resume latest "new prompt"` to continue the previous conversation.
- Restate the chosen model and approval mode when proposing follow-up actions.

Check available models with `gemini --help` or user configuration.

## Error Handling
- Stop and report failures whenever a `gemini` command exits non-zero; request direction before retrying.
- Before using high-impact flags (`-y`/`--yolo`, `--approval-mode yolo`), ask the user for permission using `AskUserQuestion` unless already given.
- When output includes warnings or partial results, summarize them and ask how to adjust using `AskUserQuestion`.

## Extensions and MCP Servers
- By default, **Disable all extensions (including MCP)**: `gemini --extension ''` (empty string)
- List available extensions: `gemini --list-extensions`
- Use specific extensions: `gemini -e extension1,extension2 "prompt"`
- Manage MCP servers: `gemini mcp add/remove/list`
- Allow specific MCP servers: `--allowed-mcp-server-names server1,server2`

## Prompting Best Practices
For advanced prompting strategies to improve response quality and accuracy, refer to @references/prompting-guide.md

**Topics covered:**
- **Core Strategies:** Clear instructions, few-shot vs zero-shot prompts, adding context, using prefixes, breaking down prompts
- **Response Formatting:** System instructions, completion strategies
- **Model Parameters:** Temperature, topK, topP, stop sequences
- **Gemini Best Practices:** Structured prompting templates, enhancing reasoning, self-critique
- **Iteration Strategies:** Rephrasing, analogous tasks, reordering content
- **Common Pitfalls:** What to avoid and how to handle fallback responses

**When to consult:** When you need to craft complex prompts, improve response quality, or leverage Gemini's advanced reasoning capabilities.

### Prompt Crafting Workflow
Before executing a `gemini` command, ensure the prompt is well-structured:

1. **Clarify requirements first**: If the user's request is ambiguous or requires decisions (e.g., choice of approach, scope, constraints), use `AskUserQuestion` to gather necessary information before crafting the prompt.
2. **Structure the prompt**: Apply appropriate strategies from the prompting guide:
   - Add context if needed (e.g., relevant code, logs, documentation)
   - Use few-shot examples for format consistency
   - Define constraints explicitly
   - Use XML/Markdown structure with clear sections
3. **Execute and iterate**: Run the command, then use `AskUserQuestion` to confirm next steps or gather feedback for prompt refinement.
