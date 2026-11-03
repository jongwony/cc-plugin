# Codex Invocation through codex-plus

One realization of the handoff on codex. It is platform realization, not contract: the contract
stays in `SKILL.md`. The run goes through the codex-plus plugin — its `codex` skill's wrapper,
`codex-run.sh`, launches and resumes the session, and the session's own rollout file is the tool
record. Follow that skill's delegation rules for running the wrapper; the options below are the
wrapper's, checked against `codex-run.sh -h`.

## Launch

Write the brief to a file in a run directory of this session's own, and launch with the working
directory every later pass will use.

```bash
codex-run.sh -m "$model" -r "$effort" -C "$work_dir" -o "$run_dir/p0.last.txt" \
  "$run_dir/brief.txt" > "$run_dir/p0.stdout.txt" 2> "$run_dir/p0.stderr.txt"
```

The wrapper propagates codex's exit status. The session id is the `session id: <uuid>` line in
`p0.stderr.txt`.

## Continue

The goal turn, sent once per thread, and every continuation resume that session by id; a
correction starts a new thread instead (`SKILL.md` Phase 1). The goal turn's message is
`$define-goal` with the goal condition as its intention — the route the codex-plus `codex` skill
gives under Goal Requests.

```bash
codex-run.sh -S "$thread_id" -m "$model" -r "$effort" -C "$work_dir" \
  -o "$run_dir/p$pass.last.txt" "$run_dir/message.txt" \
  > "$run_dir/p$pass.stdout.txt" 2> "$run_dir/p$pass.stderr.txt"
```

Run each pass through the host's background facility, which has no time limit of its own; a pass
that has stopped progressing is this session's to stop.

## Read

A pass's return is its `-o` file. The tool record the verifier reads is the session's rollout
file, which every resumed pass appends to, found by session id:

```bash
rollout=$(find "${CODEX_HOME:-$HOME/.codex}/sessions" -name "rollout-*-$thread_id.jsonl")
jq -c 'select(.type == "event_msg" and .payload.type == "item_completed"
              and .payload.item.type == "McpToolCall") | .payload.item' "$rollout"
```

Each MCP call carries `server`, `tool`, `status`, `error`, and `result`; `result.isError` is the
error flag, and the Tavily response is the text in `result.content[]` (with `structuredContent`
beside it where the server returns one). A run the session spawns writes a rollout of its own
under the same `sessions` directory; its first line's
`payload.source.subagent.thread_spawn.parent_thread_id` names the spawning thread, and runs those
spawned link the same way.

## Tavily

The run reaches Tavily through the MCP server codex is configured with, and whether Tavily is
available shows in the run's own Tavily calls. The configuration and the credentials it holds are
not part of the research or the check, so they stay unread. The wrapper takes no MCP overrides,
which keeps the server URL and its credentials out of the process arguments.
