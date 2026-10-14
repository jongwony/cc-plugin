---
name: gemini-cli
description: |
  This skill should be used when the user asks to "run gemini", "ask gemini", "delegate to gemini",
  "use Gemini CLI", "gemini resume", or "continue with gemini". Runs a prompt through Gemini CLI
  headless on a Gemini API key, with the model the user names, session resume by id, and the
  token counts each run consumed.
---

# Gemini CLI (headless)

`scripts/gemini-run.sh` takes one prompt file and prints the answer, the session id, and the
token counts the CLI reported. `-h` carries the flags.

## Prerequisites

- Gemini CLI on PATH (`npm install -g @google/gemini-cli`) and Node.js, which the CLI already needs.
- `GEMINI_API_KEY` set in the environment of the command that runs the script. When the
  environment does not have it, the user's own instructions say where it comes from.
- On an authentication failure, read `references/auth.md`.

## Running a task

1. **Model.** The model is whatever the user named; `-m` has no default. When none was named,
   list the models the key can reach and ask:
   `curl -s https://generativelanguage.googleapis.com/v1beta/models -H "x-goog-api-key: $GEMINI_API_KEY"`.
2. **Approval mode.** `plan` (the default) runs read-only tools; web search is available in it.
   Pass `-a auto_edit` or `-a yolo` only when the user asked for Gemini to change files.
3. **Directory.** Pass `-C <dir>` — the directory whose files the task is about, or the session's
   scratchpad for a question with no files. Sessions are stored per directory, so a resume passes
   the same `-C`.
4. **Prompt.** Write it to `<scratchpad>/gemini_prompt_<suffix>.txt`, where `<scratchpad>` is the
   session's scratchpad directory and `<suffix>` is unique to this invocation.
5. **Run inside a Bash subagent** (Task tool), so the CLI's output stays out of the main context.
   Give it the command
   `${CLAUDE_PLUGIN_ROOT}/skills/gemini-cli/scripts/gemini-run.sh -m MODEL -C DIR [-a MODE] [-t SECONDS] <prompt_file>`
   and this return contract: the answer (or the error), the `SESSION_ID:` line verbatim, and the
   `TOKENS` lines verbatim.
6. **Record** each `SESSION_ID` against its purpose and model; it is the only resume handle.
7. **Resume** by writing a new prompt file and running the same command with `-S <SESSION_ID>`,
   the same `-m`, and the same `-C`.
8. **Report** the outcome, the session id, and the token counts. The counts are per model:
   `input` is the prompt minus what was served from cache, `cached` is the cached part,
   `candidates` and `thoughts` are output. Each run re-sends the CLI's own system prompt and tool
   definitions, and a resumed run re-sends the conversation so far, so input grows with the
   session. To turn counts into cost, read the model's current rates at
   https://ai.google.dev/gemini-api/docs/pricing.

## Exit status

Non-zero when the CLI reports an error (the error goes to stderr) and `124` when `-t` fired. A
`SESSION_ID:` line is printed either way.
