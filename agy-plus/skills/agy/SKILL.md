---
name: agy-plus
description: |
  This skill should be used when the user asks to "run agy", "use agy CLI", "use antigravity CLI", "delegate to agy", "agy resume", or "continue with agy". Executes tasks via Google Antigravity CLI (`agy --print`) with flexible model/effort selection, parallel delegation, and explicit session resume.
---

# Agy Skill Guide

## Prompt Delivery
Read `references/run-brief.md` before writing the prompt file: the role every prompt declares, what a prompt judging a decision carries, and how model, effort, and parallel runs are chosen.

1. Generate a short unique suffix (e.g., `a3f9`, timestamp fragment, or task keyword) for this invocation.
2. Write the prompt to `<scratchpad>/agy_prompt_<suffix>.txt` using the Write tool — `<scratchpad>` is the session's scratchpad directory (e.g. `/private/tmp/…/scratchpad` announced in the system prompt; fall back to `/private/tmp` when none is announced).
3. Execute via wrapper script: `${CLAUDE_PLUGIN_ROOT}/scripts/agy-run.sh [options] <scratchpad>/agy_prompt_<suffix>.txt`.

## Running a Task

1. **Choose model, effort, and parallelism.**
   - Whatever the caller named upstream (a model, an effort, several models in parallel) IS the answer: pass it through without re-asking.
   - Otherwise, judge flexibly from the task's complexity and nature (see `references/run-brief.md` § Choosing model, effort, and parallelism):
     - **Model (`-m`)**: any slug from `agy models` (e.g., `gemini-4-neon-medium`, `gemini-4-neon-high`, `gemini-4-carbon-high`, `gemini-3.8-flash-medium`), or omit `-m` to use `agy`'s configured default.
     - **Effort (`-r`)**: optional — a level that family lists in `agy models` (`low`, `medium`, `high`, `xhigh`, `max`). Pair it with a family name without an effort suffix (e.g., `-m gemini-4-neon -r xhigh`) or with no `-m`.
       - An effort-suffixed slug already fixes the effort; a `-r` that differs from it fails the run (`conflicts with --effort`).
       - Orchestrator slugs (`gemini-pro-orchestrator*`) take no `-r`.
     - **Parallel multi-model runs**: when a decision benefits from independent perspectives or cross-checking, launch parallel subagent calls (one per model) in a single turn with the same prompt file and different `-m`.
2. **Choose execution mode.**
   - Default is `--mode auto` (set by `agy-run.sh`). Because `auto` can edit files and run tools, the prompt's declared role is what keeps a reviewing/read-only run from modifying the tree — state the role explicitly.
   - Where an account lacks `auto`, `agy` warns on stderr (`--mode auto is not available for this account; continuing in the default mode`) and its default mode still edits files; the declared role or `-M plan` stays the guard.
   - Pass `-M plan` when you want `agy` enforced in read-only planning mode, or `-M accept-edits` when only file edits should be auto-accepted.
   - Pass `-s` (`--sandbox`) when terminal restrictions should be enforced inside `agy`.
3. **Write the prompt** per `references/run-brief.md` to `<scratchpad>/agy_prompt_<suffix>.txt`.
4. **Delegate execution to a Bash subagent** — never run `agy-run.sh` directly in the main session. This keeps raw JSON, tool logs, and verbose output out of the main context. Give the subagent:
   - The exact command: `${CLAUDE_PLUGIN_ROOT}/scripts/agy-run.sh [options] <scratchpad>/agy_prompt_<suffix>.txt` with `-m MODEL` / `-r EFFORT` / `-M MODE` / `-C DIR` (or `-S <SESSION_ID>` to resume).
   - **Return contract**: run the command, read the raw JSON output directly (the wrapper passes stdout/stderr through without parsing), and return ONLY:
     1. the outcome (concise summary for execution tasks, or `response` verbatim/high-fidelity for judgment/review tasks),
     2. `SESSION_ID: <conversation_id>` extracted verbatim from the JSON `conversation_id` field,
     3. `usage`, `denied_actions`, and error / warning details if any occurred.
   - **Single model**: one subagent call.
   - **Multiple models**: issue parallel subagent calls (one per model) in a single response; each returns its own `SESSION_ID`.
5. **Record each returned `SESSION_ID`** against its purpose, model, and `-C` directory. This `{purpose → SESSION_ID}` map is the only resume handle.
6. **Resume**: write new instructions to a fresh `<scratchpad>/agy_prompt_<suffix>.txt`, then delegate to a Bash subagent running:
   `${CLAUDE_PLUGIN_ROOT}/scripts/agy-run.sh -S <SESSION_ID> [-C <SAME_DIR>] <scratchpad>/agy_prompt_<suffix>.txt`
   - Resume is always by explicit `SESSION_ID` (`--conversation`), never `--continue`, so parallel sessions never race.
   - **Model on resume**: pass the `-m` recorded for that `SESSION_ID` in step 5 again — `agy` does not keep a session's model, and a resume without `-m` runs on `agy`'s configured default. Where the first run omitted `-m`, omit it again. Pass a different `-m` only if the caller asks to switch models mid-session.
   - **Working directory on resume**: pass `-C <SAME_DIR>` again so relative file pointers in the conversation still resolve against the same tree.
7. **Summarize each outcome** to the user; for parallel work, surface which `SESSION_ID` maps to which model/branch. Inform the user: "Resume anytime with 'agy resume'."

### Quick Reference
Each command below runs **inside a Bash subagent**, which reads the raw JSON output and returns the outcome plus `SESSION_ID: <conversation_id>`.

Base patterns:
- Default (`auto` mode, JSON output) — `${CLAUDE_PLUGIN_ROOT}/scripts/agy-run.sh -C <DIR> <scratchpad>/agy_prompt_<suffix>.txt`
- Explicit model & effort — `${CLAUDE_PLUGIN_ROOT}/scripts/agy-run.sh -m <FAMILY> -r <EFFORT> -C <DIR> <scratchpad>/agy_prompt_<suffix>.txt` (e.g., `-m gemini-4-neon -r xhigh`)
- Read-only plan mode — `${CLAUDE_PLUGIN_ROOT}/scripts/agy-run.sh -M plan -C <DIR> <scratchpad>/agy_prompt_<suffix>.txt`
- Resume a session — `${CLAUDE_PLUGIN_ROOT}/scripts/agy-run.sh -S <SESSION_ID> [-m <SAME_MODEL>] -C <SAME_DIR> <scratchpad>/agy_prompt_<suffix>.txt`

Modifiers (added to any base pattern):
- Terminal sandbox inside `agy` — `-s`
- Override output format — `-f text` or `-f stream-json` (warning: `text` omits `conversation_id`, so do not use it if you need to resume)
- `agy`-specific flags (`-a/--agent`, `--add-dir`, `--json-schema`, `--disable-slash-commands`, `--print-timeout`, `--project`, `--remote-agent`, `--settings`) — see `references/agy-features.md`

## Error Handling
- Stop and report failures whenever `agy-run.sh` exits non-zero or the JSON payload reports `"status":"ERROR"`; request direction before retrying.
- A `"status":"SUCCESS"` payload carrying `denied_actions`, or an empty `response`, is incomplete: headless print mode auto-denies a tool that needs a permission. Report it as incomplete with the denied actions; the remedy is in `references/agy-features.md` § Sandbox & Authentication Troubleshooting.
- Before passing `--dangerously-skip-permissions`, ask the user for permission unless it was already granted.
- Note on host sandboxes: `agy` needs read/write access to `~/.gemini/antigravity-cli/` (logs, `installation_id`, session state) and network access. If a sandboxed Bash tool fails with `operation not permitted` on `~/.gemini/antigravity-cli/`, see `references/agy-features.md` § Sandbox & Authentication.

## Progressive Disclosure — `agy`-Specific Features
Keep the main workflow lean. Read `references/agy-features.md` only when the task actually needs `agy`-specific capabilities:
- Custom agents (`--agent`, `agy agents`) or multi-directory workspaces (`--add-dir`)
- Structured output (`--json-schema`), print timeouts (`--print-timeout`), disabling slash commands (`--disable-slash-commands`)
- Remote agents (`--remote-agent`, `--project`) or session-only overrides (`--settings`)
- Model catalog lookup (`agy models`), MCP/plugin inspection, or sandbox/auth troubleshooting
