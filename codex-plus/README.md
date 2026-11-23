# codex-plus

Runs tasks through the OpenAI Codex CLI (`codex exec`) from Claude Code. The skill writes a prompt file, picks the model, reasoning effort and service tier, and runs `scripts/codex-run.sh` in a subagent. Each run returns a session id, and a later run can resume that session by its id.

Use: ask Claude to "run codex", "delegate to codex" or "codex resume".

Requirements: the `codex` CLI, signed in. `codex debug models` lists the models, the effort levels and the service tiers that each model takes.

## Breaking change in 3.0.0: `-f` is removed

`codex-run.sh` no longer takes `-f` or `--fast`. Both now stop with `Unknown option: -f` (or `--fast`) and exit 1.

Use `-t fast` to request the fast tier. `-t` (`--service-tier`) takes any tier that the model lists in `additional_speed_tiers` in `codex debug models`, for example `-t ultrafast` on `gpt-6.2-sol`. `-t default` requests the standard tier. Without `-t`, the `service_tier` in your codex config applies.

A tier is a request. When the model does not list the tier, codex drops it and prints a `warning:` line on stderr.
