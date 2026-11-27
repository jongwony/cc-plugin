# agy-plus

Runs tasks through the Google Antigravity CLI (`agy --print`) from Claude Code or another parent agent. The skill writes a prompt file, chooses model/effort (or lets `agy` use its default), and runs `scripts/agy-run.sh` in a subagent. Each run passes raw JSON output through so the subagent reads both the response and `conversation_id`, and a later run can resume that exact conversation by its id.

Use: ask to "run agy", "delegate to agy", "use antigravity CLI", or "agy resume".

Requirements: the `agy` CLI (`curl -fsSL https://antigravity.google/cli/install.sh | bash`), signed in, or set to a Gemini API key (see `skills/agy/references/agy-features.md`). `agy models` lists available models and effort-tiered slugs; `agy agents` lists available agents.

## Structure

- `scripts/agy-run.sh` — parameterized CLI wrapper for `agy --print` (`--mode auto`, `--output-format json` by default, raw stdout/stderr passthrough).
- `skills/agy/SKILL.md` — core delegation loop (prompt delivery, flexible model/effort & parallel runs, session resume, error boundaries).
- `skills/agy/references/run-brief.md` — what every prompt carries (role declaration, pointers over copies, decision framing, model/effort guidance).
- `skills/agy/references/agy-features.md` — `agy`-specific capabilities (`--agent`, `--add-dir`, `--json-schema`, `--disable-slash-commands`, `--print-timeout`, `--remote-agent`, `--settings`, auth/sandbox notes), loaded progressively when needed.
