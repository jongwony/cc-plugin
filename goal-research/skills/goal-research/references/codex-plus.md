# Codex Invocation through codex-plus

One realization of the Phase 2 handoff on codex. It is platform realization, not contract: the
contract stays in `SKILL.md`. The run goes through the codex-plus plugin — its `codex` skill's
wrapper, `codex-run.sh`, launches and resumes the session, and the session's own rollout file is
the tool record. Follow that skill's delegation rules for running the wrapper; the options below
are the wrapper's, checked against `codex-run.sh -h`.

## Launch

Pick the model and effort for the question's depth, write the brief to a file in a run directory
of this session's own, and launch with the working directory every later pass will use. Leave the
sandbox at the wrapper's default: it is the mode with network access.

```bash
codex-run.sh -m "$model" -r "$effort" -C "$work_dir" -o "$run_dir/p0.last.txt" \
  "$run_dir/brief.txt" > "$run_dir/p0.stdout.txt" 2> "$run_dir/p0.stderr.txt"
```

The wrapper propagates codex's exit status. The session id is the `session id: <uuid>` line codex
prints to stderr.

## Continue

The goal turn and every continuation resume that session by id:

```bash
codex-run.sh -S "$thread_id" -m "$model" -r "$effort" -C "$work_dir" \
  -o "$run_dir/p$pass.last.txt" "$run_dir/message.txt" \
  > "$run_dir/p$pass.stdout.txt" 2> "$run_dir/p$pass.stderr.txt"
```

Run each pass through the host's background facility and bound it with that facility's own time
limit — a deep question can take over an hour, and a host's default limit (30 minutes, for one)
can stop a pass mid-run. macOS ships no `timeout` command, so the bound comes from the facility,
not from wrapping the command.

## Read

A pass's report is its `-o` file. The run's tool record is the session's rollout file, which
every resumed pass appends to, found by session id:

```bash
rollout=$(find "${CODEX_HOME:-$HOME/.codex}/sessions" -name "rollout-*-$thread_id.jsonl")
jq -c 'select(.type == "event_msg" and .payload.type == "item_completed"
              and .payload.item.type == "McpToolCall") | .payload.item' "$rollout"
```

Each MCP call carries `server`, `tool`, `status`, `error`, and `result`; `result.isError` is the
error flag, and the Tavily response is the text in `result.content[]` (with `structuredContent`
beside it where the server returns one).

## Tavily

The run reaches Tavily through the MCP server codex is configured with, and whether Tavily is
available shows in the run's own Tavily calls. The configuration and the credentials it holds are
not part of the research or the check, so they stay unread. The wrapper takes no MCP overrides,
which keeps the server URL and its credentials out of the process arguments.
