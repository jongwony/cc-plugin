# What the harness actually does

Read this when a dispatch did nothing and raised no error, when a command's
argument appears to be ignored, when a monitor was created but receives nothing,
when a worktree lands somewhere unexpected, or when deciding whether a surface is
safe to build on.

SKILL.md carries the rule. This file carries what each rule rests on, so a later
session can tell a settled behaviour from an assumption and knows which ones to
re-check when the harness moves.

**Provenance is marked on every item.** *Exercised* means this was run and the
result observed. *Read* means it comes from a string in the binary or a tool
description and was never fired — treat those as leads that still need a run.

## Dispatching a built-in command

**A built-in slash command is dispatched only as the first token of a message.**
The same text anywhere else in the message is read as prose: nothing runs, and no
error marks it. *Exercised, three ways.* `/autofix-pr` placed at step 2 of a
spawn brief produced no effect at all — the spawned session performed the steps
around it and went idle. The same session, resumed with `/autofix-pr` as the
whole message, dispatched and spawned a cloud session. *Read:* the binary
registers these as commands parsed at the head of an utterance.

**A command registered with no argument discards one silently.** *Exercised.*
`/autofix-pr 198` and `/autofix-pr feat/claude-sessions` both behaved exactly as
the bare call — same refusal, same target resolution. *Read:* that command's
registration carries no argument hint.

**So a message carrying a built-in carries nothing else.** A spawn whose first
act is a built-in costs two messages: the command, then the brief with its
handshake clause and its work. This is the reason SKILL.md prefers the tool path,
not a two-message procedure to adopt — `RemoteTrigger` has no such constraint and
can be called anywhere in a turn.

## `/autofix-pr`

**It targets the current checkout's branch and nothing else.** *Exercised.* It
refuses on the default branch, naming the checkout it inspected, and refuses when
no open PR matches the branch. Neither a PR number nor a branch name passed as an
argument changes what it resolves.

**It spawns a cloud session on the PR's branch and subscribes that session to the
PR.** *Exercised.* It prints the session link. It is idempotent per PR: a second
call while a session is already running for that PR returns the existing link
rather than spawning again.

**Delivery is webhook-driven, not polling.** *Read:* `subscribePR`,
`getPRWebhookTargets` and `fetchInboxMessage` sit together in the remote-bridge.
Nothing observed contradicts this, but the event path itself was not exercised.

**The watch is exclusive per pull request, not per repository.** *Exercised, by
contrast.* One repository's PR returned `Autofix is on, but webhook events won't
reach the cloud session: a Claude agent is already watching this PR`; a different
repository's PR, from the same account and machine minutes later, returned no
such line. A second watcher runs and receives nothing, so the spawned session is
resident and useless. Read that line rather than treating a printed session link
as proof the watch took.

**Unsettled.** Whether a plain PR conversation comment reaches a watching
session, and whether the repository owner's own comment is filtered as a
self-authored event. The attempt to establish this ran against a PR that already
had another watcher holding its webhook, which is exactly the condition under
which no comment reaches the new session — so it settled nothing either way.
Answer it on a PR whose `/autofix-pr` call printed no already-watching line.

## `RemoteTrigger`

**No CLI subcommand creates a routine, a schedule or a webhook.** *Read*, from
the `claude --help` subcommand list at 2.1.278, so the claim is bounded to that
version. This is what keeps the event and clock wakes on the tool side of the
Codex boundary: `claude --cloud` creates or re-attaches a session, which covers
the self-round wake, and nothing in the CLI reaches the other two. Re-derive it
from the same listing when the binary moves.

**`environment_id` comes from the `Claude_Code_Remote` MCP server, not from
`RemoteTrigger`.** *Exercised.* `list_environments` returns each environment's
`env_` id beside a human-readable name, which is what makes selection possible
without guessing. `RemoteTrigger`'s own action list has no environment action —
the tool's `create` requires the id and supplies no way to obtain it. The CLI's
`--environment` flag is a third value — its help names a self-hosted `ccpool_`
id — so it does not supply this one either.

**The built-in `RemoteTrigger` tool is off inside anything it fires.** *Read*,
from the installed 2.1.278 tool definition:
`isEnabled(){return Un()&&mt()&&!a.CLAUDE_CODE_REMOTE&&Gt("allow_remote_sessions")&&Gt(yK)}`.
`CLAUDE_CODE_REMOTE` is set in a remote worker, so a routine's run cannot call
the tool that created it, and no run can retire its own schedule. This is also
why a session can reach routines through the `Claude_Code_Remote` MCP server
while the built-in tool is unavailable in it: they are two surfaces, and only
the built-in one carries this condition.

**It is the tool path, and it has no first-token constraint.** *Exercised.*
`create` followed by `run` produced a routine and fired it; `get_run_log` showed
the prompt reaching a sandbox that allocated and launched Claude Code. This is
the whole reason the tool path is preferred: a brief can call it in the middle of
a turn, where a slash command would have to lead its own message.

**`job_config` must set `ccr.environment_id`.** *Exercised.* A body without it is
rejected with `translate job_config v1→v2: job_config must set
ccr.environment_id or ccr.self_hosted_runner_pool_id`.

**That body shape has already moved once.** *Observed.* Routines created earlier
carry no `environment_id` and still list and run, so the server translates the
older shape while requiring the newer one on create. Expect the shape to move
again and read the error rather than a remembered body.

**There is no delete action.** *Exercised.* The available actions are list, get,
create, update, run, `create_webhook_trigger`, `list_runs` and `get_run_log`.
Retirement is `update` with `enabled: false`; the routine stays listed with its
`run_once_at` intact but does not fire.

**`create_webhook_trigger` is unverified.** *Read* — from the tool description
only. It was never fired, so its body shape has not been checked against a real
repository, and neither has whether it coexists with `/autofix-pr`'s
per-PR subscription. Fire it once before depending on it.

## Sessions, jobs and worktrees

**A resume forks on either of two conditions, and flags are one of them.**
*Read*, from the installed 2.1.278 classifier. It returns `copy` with reason
`running` when any live process holds the session — so a running session forks
however the command is written — and, for a *stopped* background job, `copy`
with reason `own-options` when the command carries anything beyond the
instruction. Its own message says why: `background session X keeps its own saved
options, so the flags you passed started a copy as Y. Without flags, the same
command continues X.` The option filter drops `--resume` and its value and keeps
everything else, so with a `--` separator any surviving flag forks, and without
one, more than a single trailing token does.

**The `own-options` branch reaches background jobs only.** It sits behind a test
for saved background-job state, so a session started any other way — a headless
`claude -p` run, for one — has none, and its resume continues whatever flags
accompany it. Only the running-session check reaches both. SKILL.md's
pass-nothing rule is written for the background case, which is what a Stint is.

This corrects two earlier readings. An *Observed* run had flags alongside
`--resume` start a second job; the rule drawn from it — that any flag forks —
was right for the stopped case and silent about the running one. The correction
then drawn from `claude --help` — that only a running session forks — was wrong
in the other direction, and re-passing `--bg` on a stopped job is exactly the
`own-options` fork. Read the classifier, not the help text, when this moves.

**`claude rm` takes the worktree only from the job that created it.** *Exercised,
by contrast.* Two jobs shared one worktree — one created it, the other was
spawned into it. Retiring the second reported the removal alone; retiring the
first named the worktree path and removed it. The retirement report is where that
distinction shows, so read the line rather than predicting which case applies.

**Worktree isolation cuts from the enclosing repository of the session's working
directory, which is not always the directory that looks like the project.**
*Exercised, as a failure.* A session working in a path that looked like a project
root had that path resolve to a much higher toplevel — a home directory that was
itself a repository. Isolation taken from there cut a worktree in the home
repository, and every route from it to the intended project was refused by the
worktree guard: `git -C`, a `cd`, and a computed shell program alike.

Two things that run showed, beyond the failure itself: a directory containing
repositories is not necessarily outside one, and the refusals tracked where each
command landed rather than how it was written. SKILL.md carries what to do about
both.

## The peer socket, and what to stand on instead

**A session publishes its own messaging surface.** *Observed.* The registry entry
at `~/.claude/sessions/<pid>.json` carries `messagingSocketPath`, `peerProtocol`
and `peerFeatures`, and the key file beside it holds a `peerToken` at mode 600.

**Connection is not the barrier; framing is.** *Exercised.* Any process of the
same uid can connect to a live session's socket. The server then sends nothing —
no banner, no challenge — and holds the connection open waiting for the client to
speak a protocol that is not published. A dead session's socket refuses the
connection outright, which is the liveness signal and the only thing a connect
attempt usefully establishes.

**The surface announces its own movement.** *Observed.* It advertises a
negotiated `peerProtocol` and a feature list while publishing no negotiator for a
non-Claude process — which is what a client written against it would couple to.
SKILL.md carries the prohibition that follows.

**Claude → Codex already works on one.** *Exercised.* `codex queue --thread <id>
--message <text>` reaches the app-server daemon from a plain shell — no token, no
`--remote` — and the message persists against a thread that is not running,
delivered when that thread resumes. Addressing a thread that does not exist
returns a JSON-RPC error naming the lookup, which is how to tell an unreachable
daemon from an unknown thread.

**The reverse direction has no published inbound command at all.** *Observed.*
The `claude` CLI carries no `queue`, `send` or `message` subcommand; the only
inbound path is the in-session `SendMessage` tool. That asymmetry is why a
Codex-driven launch is fire-and-forget and verifies itself with `claude agents
--json` rather than an ACK.
