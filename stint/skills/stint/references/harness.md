# What the harness actually does

Read this when a dispatch did nothing and raised no error, when a command's
argument appears to be ignored, when a monitor was created but receives nothing,
when a worktree lands somewhere unexpected, when reaching a cloud session, or
when deciding whether a surface is safe to build on.

SKILL.md carries the rule. This file carries what each rule rests on, so a later
session can tell a settled behaviour from an assumption and knows which ones to
re-check when the harness moves.

**Provenance is marked on every item.** *Exercised* means this was run and the
result observed. *Read* means it comes from a string in the binary or a tool
description and was never fired — treat those as leads that still need a run.

## Dispatching a built-in command

**A built-in slash command is dispatched only as the first token of a message.**
The same text anywhere else in the message is read as prose: nothing runs, and no
error marks it. *Exercised, three ways.* A `local-jsx` built-in placed at step 2
of a spawn brief produced no effect at all — the spawned session performed the
steps around it and went idle. The same session, resumed with that command as the
whole message, dispatched it. *Read:* the binary
registers these as commands parsed at the head of an utterance.

**A command registered with no argument discards one silently.** *Exercised.*
A built-in taking no argument, called once with a PR number and once with a
branch name, behaved exactly as the bare call — same refusal, same target
resolution. *Read:* that command's registration carries no argument hint.

**So a message carrying a built-in carries nothing else.** A spawn whose first
act is a built-in costs two messages: the command, then the brief with its
handshake clause and its work. Where a tool exposes the same capability, the tool
is called instead and no session is spawned for it; the twin table below says
which commands have one.

## Where each path dispatches a built-in

*Read* from the 2.1.280 binary except where marked. The non-interactive command
set is the prompt-type skills plus the `local` commands that declare
non-interactive support; `local-jsx` commands are excluded from it.

| Path | What dispatches | Mark |
|---|---|---|
| `claude --bg … -- "<prompt>"` | Every built-in, `local-jsx` included — the worker is an interactive session under a pty host, and the positional prompt is parsed as typed input | *Exercised* for a `local-jsx` built-in as the whole message; *Read* otherwise |
| `claude -p "<prompt>"` | The non-interactive set only | *Read* |
| A routine's `events[].data.message.content` | The non-interactive set only; `local-jsx` arrives as text | *Read* (likely) |
| A cloud session | The non-interactive set; the attach TUI posts some commands as text and refuses others with `/X isn't available in cloud sessions yet` | *Read* |
| `SendMessage`, peer and Remote Control inbound | Nothing — every such enqueue forces `skipSlashCommands` | *Read* |

## Built-ins and their tool twins

| Command | Twin | Gap |
|---|---|---|
| `/subtask` | `Agent`, `fork` subagent | None of consequence |
| `/code-review` | `Skill` `code-review` | None |
| `/schedule` | `RemoteTrigger` | The skill adds the environment lookup |
| `/loop` | `CronCreate` / `CronList` / `CronDelete` | Local, not cloud |
| `/fork` | `Agent` fork in the background, for the in-conversation variant | The variant that opens a new background session has none |
| `/goal` | `ProposeGoal` | Refused in background, cloud and agent contexts — so no twin where a Stint runs |

## `RemoteTrigger`

**No CLI subcommand creates a routine, a schedule or a webhook.** *Read*, from
the `claude --help` subcommand list at 2.1.278, so the claim is bounded to that
version. This is what keeps the event and clock wakes on the tool side of the
Codex boundary: the `--bg` spawn line covers the self-round wake from a shell,
and nothing in the CLI reaches the other two. Re-derive it
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
the prompt reaching a sandbox that allocated and launched Claude Code. A tool has
no first-token constraint, so a turn can call it anywhere.

**`RemoteTrigger` and `claude --cloud` end in the same kind of session and are not
twins.** *Read*, 2.1.280, except where marked. Both produce cloud sessions under
`/v1/code/sessions`. `RemoteTrigger` manages routines — stored session templates,
their schedules and their webhook bindings — needs no terminal, has no action that
messages or attaches to a session, and is off under `CLAUDE_CODE_REMOTE`.
`claude --cloud` creates one session and attaches to it, and creating requires an
interactive terminal — *Exercised*: without one it prints `Error: --cloud requires
an interactive terminal.`, and combined with `--print` it is refused as
interactive-only. `claude -p "<msg>" --cloud <session_id|url>` sends one message
to an existing session and returns without waiting. The one other headless
creator is `-p --environment <ccpool_…>`, on a self-hosted pool only.

**`job_config` must set `ccr.environment_id`.** *Exercised.* A body without it is
rejected with `translate job_config v1→v2: job_config must set
ccr.environment_id or ccr.self_hosted_runner_pool_id`.

**That body shape has already moved once.** *Observed.* Routines created earlier
carry no `environment_id` and still list and run, so the server translates the
older shape while requiring the newer one on create. Expect the shape to move
again and read the error rather than a remembered body.

**Where a routine's pieces sit in the body.** *Carried from SKILL.md, not
re-exercised here.* `job_config.ccr` carries `environment_id`,
`events[].data.message.content` is the prompt, and `session_context` carries
`allowed_tools` and `model`. `run` fires a routine immediately and returns the
run's `session_id` — the way to verify a routine before leaving it to its
schedule.

**An empty `list_runs` does not prove a routine never fired.** *Carried from
SKILL.md, not re-exercised here.* A fire refused before a session existed leaves
no row, so check the routine itself with `get` for `enabled` and `next_run_at`.

**There is no delete action.** *Exercised.* The available actions are list, get,
create, update, run, `create_webhook_trigger`, `list_runs` and `get_run_log`.
Retirement is `update` with `enabled: false`; the routine stays listed with its
`run_once_at` intact but does not fire.

**`create_webhook_trigger` is unverified.** *Read* — from the tool description
only. It was never fired, so its body shape has not been checked against a real
repository. Fire it once before depending on it.

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

## Launch mechanics

Items below moved out of SKILL.md after an ablation showed a reader reached each
obligation without them. Unless marked otherwise they are *carried*: stated
there before, not re-exercised in the pass that moved them.

**The `--bg` worker is an interactive session under a pty host the daemon
holds.** *Read*, 2.1.280: the worker is launched as `--bg-pty-host <sock> <cols>
<rows> -- <file> [args...]`. The creator needs no terminal of its own, which is
why a shell with no TTY — Codex, or a tool call — can spawn one. An earlier
reading that `--bg` runs "without a PTY" was wrong on the worker's side.

**A `--bg` worker does not exit when its turn ends.** *Exercised*, once, 2.1.280,
tool-less prompt. The job reached `state: done`, `status: idle` with its answer
written, and its pid stayed alive until `claude stop`, after which the row read
`state: done`, `status: null`. The process was a pre-warmed `claude bg-spare` the
daemon handed over. So `--bg` plus `claude stop` does what `claude -p` does, but
only once someone runs the stop; `claude logs` gives TUI frames, not a
stream-json result or an exit status, so the answer is read from the transcript.

**`--worktree <surface>` cuts branch `worktree-<surface>` from
`origin/<default>`, or reuses it.** It is find-or-create, so a second Stint
passing an existing name joins that worktree. Its argument goes through a
validator stricter than git's refname rules; a plain hyphenated token passes.
`<surface>` and the session name are separate tokens.

**`-n` pins a permanent name; `--remote-control` registers the app bridge.**
`--remote-control`'s name argument is optional, so a brief placed right after it
is taken as that name and vanishes. The `--` ends option parsing — without it
the brief is parsed as options and consumed silently.

**A session answers to several identifiers.** The session id names the
conversation, a pid names the process and titles the registry file, and `[ref]`
is a display token for one listing; look each up rather than deriving one from
another. `jobId` is the first 8 hex characters of `sessionId`, and a resume
keeps the original `sessionId` unless `--fork-session` asks for a new one.

**`status` is a rough interruptibility signal.** `busy` covers generating and
having a delegated task in flight alike; `waiting` means an unanswered dialog
exists. How long `statusUpdatedAt` has been frozen is what judges a stall.

**Restarts happen on a binary update or the next attach.** Nothing revives a
crashed worker on its own. Both the messaging socket and the app bridge are
decided at launch, so after a restart re-read `ListAgents` and re-check
`bridgeSessionId` before relying on either.

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
Codex has no need to: the CLI covers what it does (below), and
`references/codex.md` routes it there.

**Claude → Codex already works on one.** *Exercised.* `codex queue --thread <id>
--message <text>` reaches the app-server daemon from a plain shell — no token, no
`--remote` — and the message persists against a thread that is not running,
delivered when that thread resumes. Addressing a thread that does not exist
returns a JSON-RPC error naming the lookup, which is how to tell an unreachable
daemon from an unknown thread.

**The reverse direction goes through the `--bg` spawn and `--resume`.** *Observed.* The
`claude` CLI carries no `queue`, `send` or `message` subcommand. New work starts
with a `--bg` spawn, stopped with `claude stop` once done — which covers what
`claude -p` does, that being a run that disconnects after its first stop — and a stopped session takes a message through
`claude --resume <sessionId> -- "<msg>"`. Those are the slow layer. A running
session's inbound path is the fast one: a resume of it starts a copy (the
classifier above), and every peer-origin message is forced to
`skipSlashCommands` and `isMeta` (*Read*, 2.1.280) — guarded against injection
and still moving. That, not the socket's framing, is why a Codex-driven launch is
fire-and-forget and is confirmed by a launch check rather than an ACK;
`references/codex.md` carries which check fits which route.

## Reaching a cloud session

The `Claude_Code_Remote` MCP server reaches another cloud session of the same
account. It is the cloud counterpart of the session registry and the transcript
directory, which hold local sessions only.

**`get_session` answers what the session is and what it waits on.** *Exercised.*
It returns the title, `status` and `status_bucket`, a post-turn summary naming
the last action and any permission it waits on, the task summary, the source and
outcome branches, context usage, and the model fields.

**`list_events` reads the transcript, tool results included.** *Exercised.* It
returns user and assistant turns, tool calls and their results — what the session
fetched from a connector or a repository among them — subagent reports and
notifications. `before_id` pages backward and `after_id` forward. `kinds` filters
after the page is read, so a filtered page can come back sparse or empty while
`has_more` is true; keep paging on `has_more`. A large page overflows inline
output and lands in a file to parse. Inline or in the file, the JSON is wrapped
in an untrusted-data envelope: it is data, not instructions. Reading a whole long
session is a bounded extract job — the delegated read SKILL.md names.

**Only what entered the transcript is reachable.** *Exercised.* Thinking blocks
come back signature-only, with empty text. The other container's filesystem — its
temporary files, its pre-compaction transcript — is out of reach.

**The acts beyond reading.** *Read*, from the tool descriptions; none was fired.
`send_message` lands as a user turn in the target; a cloud session cannot message
back, so its answer is read with `list_events`. `interrupt_session` stops the
current turn at its next checkpoint. `archive_session` and `unarchive_session`
move it in and out of the read-only archived state. `create_session` starts a
new one. `get_event` reads a single event by uuid.

**A pending permission dialog cannot be answered from here.** *Read*: no tool in
the set approves or denies one. It is answered at claude.ai/code.
