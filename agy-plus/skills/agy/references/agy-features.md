# agy-Specific Features Reference

Load this reference when a delegated task needs capabilities beyond the core
`agy-run.sh` delegation loop, or when troubleshooting `agy` runtime/auth issues.

## Model & Agent Discovery

- `agy models` — lists all available model slugs (many slugs encode effort
  directly, e.g., `gemini-4-neon-medium`, `gemini-4-neon-high`,
  `gemini-4-carbon-high`, `gemini-3.8-flash-medium`,
  `gemini-pro-orchestrator-neon`).
- `agy agents` — lists available named agents that can be passed via
  `-a <AGENT>` / `--agent <AGENT>`.

## Multi-Directory Workspaces (`--add-dir`)

- Repeatable flag: `--add-dir /path/one --add-dir /path/two`.
- Use when `agy` needs to read or cross-reference repositories outside `-C DIR`.
- `agy-run.sh` resolves existing relative `--add-dir` paths to absolute paths
  before switching into `-C DIR`.

## Local Media

- `read_file` on a local video file hands it to the model as frames, one per
  second, plus its audio track; no shell or `ffmpeg` is involved.
- Audio and image files through `read_file` are unverified.
- Pass the file's absolute path in the prompt and `--add-dir "$(dirname <file>)"`
  when it lies outside `-C DIR`.

## Structured Output & Print Controls

- `--json-schema <SCHEMA_OR_PATH>`: enforces a JSON schema on the final result
  (accepts an inline JSON schema string or a path to a schema file).
- `--print-timeout <DURATION>`: bounds execution time in print mode (e.g.,
  `120s`, `5m`; default `0s` waits until completion).
- `--disable-slash-commands`: disables slash command and skill expansion in
  print mode — useful when the prompt text contains literal `/...` tokens that
  should not trigger `agy` slash commands.
- `-f stream-json`: emits NDJSON events as the turn progresses instead of a
  single final JSON object.

## Remote & Project Execution

- `--project <ID_OR_NAME>`: targets a specific project ID or name for the
  session.
- `--remote-agent`: runs conversations using remote agents (combine with
  `--project` to target a specific remote project).
- `--settings <JSON_OR_PATH>`: applies session-only overrides of
  `~/.gemini/antigravity-cli/settings.json` keys without modifying the file on
  disk.

## Sandbox & Authentication Troubleshooting

- **Host sandbox failure (`operation not permitted` on `~/.gemini/antigravity-cli/`)**:
  `agy` writes logs, crash reports, and reads `installation_id` and auth state
  under `~/.gemini/antigravity-cli/` (and `~/.gemini/config/config.json`), and
  requires outbound network access. When invoked from a sandboxed shell (such as
  Claude Code's Bash tool), the command must be allowed outside the restrictive
  sandbox or granted access to `~/.gemini/antigravity-cli/` and network.
- **Auto-denied tools (`denied_actions` in a `SUCCESS` payload)**: headless
  print mode cannot prompt, so a tool needing a permission is denied. Allow it
  for the run with an allow-rule under `permissions.allow` passed via
  `--settings` — `{"permissions":{"allow":["command(*)"]}}` allows every shell
  command (narrower `command(git)`, `command(git *)` did not match in agy
  1.5.18) — or pass `--dangerously-skip-permissions`. Either grant needs the
  user's permission first.
- **Auth expired / not signed in**: ask the user to run `agy` interactively in a
  terminal to complete Google Sign-In, or check `~/.gemini/antigravity-cli/settings.json`.
- **Gemini API key (no sign-in)**: where no browser sign-in is possible, both
  are required — `{"modelProvider": "gemini"}` merged into
  `~/.gemini/antigravity-cli/settings.json`, and `GEMINI_API_KEY` exported in the
  environment `agy` runs in. The key alone has no effect; `GOOGLE_API_KEY` and
  `.env` files are not read. At startup the CLI only checks that the key is
  non-empty, so a bad key surfaces on the first conversation; `/logout` has no
  effect. Observed working in agy 1.5.18 with `agy-run.sh` JSON output and `-S`
  resume. Source: https://antigravity.google/docs/install/
- **Inspecting environment**: `agy mcp`, `agy plugin`, `agy changelog`, and
  `agy --help` show installed MCP servers, plugins, version notes, and flags.
