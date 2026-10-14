---
name: gemini-cli
description: |
  This skill should be used when the user asks to "run gemini", "ask gemini", "delegate to gemini",
  "use Gemini CLI", "gemini resume", or "continue with gemini". Runs a prompt through Gemini CLI
  headless on a Gemini API key, with the model the user names, session resume by id, and the
  token counts each run consumed.
---

# Gemini CLI (headless)

`scripts/gemini-run.sh`, next to this file, takes one prompt file and prints the answer, the token
counts the CLI reported, and the session id. `-h` carries the flags and the exit statuses.

## Prerequisites

- Node.js on PATH (from https://nodejs.org or the system's package manager), then Gemini CLI:
  `npm install -g @google/gemini-cli`.
- `GEMINI_API_KEY` set in the environment of the command that runs the script. When the
  environment does not have it, the user's own instructions say where it comes from.
- The command needs network access to the Gemini API and write access to the CLI's state
  directory (`~/.gemini`, or `$GEMINI_CLI_HOME/.gemini` when that is set), where sessions are
  stored; a sandboxed shell has to be granted both. Keep the same state directory across a
  session's runs.
- The script stops when a settings file selects an auth method other than the API key; read
  `references/auth.md` then, and on any other authentication failure.

## Running a task

1. **Script path.** Resolve `scripts/gemini-run.sh` against the directory holding this
   `SKILL.md` and run that absolute path.
2. **Model.** The model is whatever the user named; `-m` has no default. When none was named,
   list the models the key can reach and ask:
   `curl -s https://generativelanguage.googleapis.com/v1beta/models -H "x-goog-api-key: $GEMINI_API_KEY"`.
3. **Approval mode.** `plan` (the default) runs read-only tools; web search is available in it.
   Pass `-a auto_edit` or `-a yolo` only when the user asked for Gemini to change files.
4. **Directory.** Pass `-C <dir>` — the directory whose files the task is about, or a temporary
   directory the host permits for a question with no files. Sessions are stored per directory, so
   record the directory with the session and pass the same `-C` on resume.
5. **Prompt.** Write it to a file named for this invocation in a temporary directory the host
   permits. The script feeds the file to the CLI on stdin.
6. **Run** inside a subagent that has shell access, where the host offers one, so the CLI's
   output stays out of the main context; otherwise run it directly. The return contract: the
   answer (or the error), the `TOKENS` lines verbatim, and the `SESSION_ID:` line verbatim.
7. **Record** each `SESSION_ID` against its purpose, model and directory; it is the only resume
   handle, and only a successful run prints one.
8. **Resume** by writing a new prompt file and running the same command with `-S <SESSION_ID>`,
   the same `-m`, and the same `-C`.
9. **Report** the outcome, the session id, and the token counts. The counts are per model:
   `input` is the prompt minus what was served from cache, `cached` is the cached part,
   `candidates` and `thoughts` are output. Each run re-sends the CLI's own system prompt and tool
   definitions, and a resumed run re-sends the conversation so far, so input grows with the
   session. To turn counts into cost, read the model's current rates at
   https://ai.google.dev/gemini-api/docs/pricing.
