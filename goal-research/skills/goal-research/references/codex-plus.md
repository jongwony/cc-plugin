# Codex Invocation through codex-plus

One realization of the handoff on codex. It is platform realization, not contract: the contract
stays in `SKILL.md`. The run goes through the codex-plus plugin — its `codex` skill's wrapper,
`codex-run.sh`, launches and resumes the session, and the session's own rollout file is the tool
record. Follow that skill's delegation rules for running the wrapper; the options below are the
wrapper's, checked against `codex-run.sh -h`.

## Launch

Write the brief to a file in a run directory of this session's own, one per thread, and launch with
the working directory every later pass will use.

```bash
codex-run.sh -m "$model" -r "$effort" -C "$work_dir" -o "$run_dir/p0.last.txt" \
  "$run_dir/brief.txt" > "$run_dir/p0.stdout.txt" 2> "$run_dir/p0.stderr.txt"
```

The wrapper propagates codex's exit status. The session id is the `session id: <uuid>` line in
`p0.stderr.txt`.

## Continue

The goal turn and every continuation each send their own message file in the thread's run
directory. The goal turn follows the
codex-plus `codex` skill's Goal Requests, with the goal condition as its intention and inquire named
without its `$`.

```bash
codex-run.sh -S "$thread_id" -m "$model" -r "$effort" -C "$work_dir" \
  -o "$run_dir/p$pass.last.txt" "$run_dir/message-$pass.txt" \
  > "$run_dir/p$pass.stdout.txt" 2> "$run_dir/p$pass.stderr.txt"
```

Run each pass in the background (`run_in_background`), which has no time limit of its own; a pass that has stopped progressing is
this session's to stop. Stopping a pass in flight ends the `codex` process whose arguments carry that
thread's run directory; the pass's session id stays in its stderr file.

## Read

A pass's return is its `-o` file. The thread's tool record is its rollout file, which every resumed
pass appends to, found by session id:

```bash
rollout=$(find "${CODEX_HOME:-$HOME/.codex}/sessions" -name "rollout-*-$thread_id.jsonl")
```

A run the thread spawned writes its own rollout under the same `sessions` directory; its first line
names the parent at `session_meta.payload.source.subagent.thread_spawn.parent_thread_id`. The
verifier reads these rollouts with the thread's (`SKILL.md` Phase 3).

## Tavily

The run reaches Tavily through the MCP server codex is configured with, and whether Tavily is
available shows in the run's own Tavily calls. The configuration and the credentials it holds are
not part of the research or the check, so they stay unread. The wrapper takes no MCP overrides,
which keeps the server URL and its credentials out of the process arguments.
