# What the harness actually does

Read this when a dispatch did nothing and raised no error, when a command's
argument appears to be ignored, when a monitor was created but receives nothing,
when a worktree lands somewhere unexpected, when reaching a cloud session, or
when deciding whether a surface is safe to build on.

SKILL.md carries the rule. This file carries what each rule rests on, so a later
session knows which ones to re-check when the harness moves. A claim taken only
from the binary or a tool description, and never run, says so; treat it as a lead
that still needs a run.

## Dispatching a built-in command

**A built-in slash command is dispatched only as the first token of a message.**
The same text anywhere else in the message is read as prose: nothing runs, and no
error marks it. A `local-jsx` built-in placed at step 2 of a spawn brief produced
no effect at all — the spawned session performed the steps around it and went
idle. The same session, resumed with that command as the whole message,
dispatched it. The binary registers these as commands parsed at the head of an
utterance.

**A command registered with no argument discards one silently.** A built-in
taking no argument, called once with a PR number and once with a branch name,
behaved exactly as the bare call — same refusal, same target resolution; its
registration carries no argument hint.

**So a message carrying a built-in carries nothing else.** A spawn whose first
act is a built-in costs two messages: the command, then the brief with its
handshake clause and its work. Where a tool exposes the same capability, the tool
is called instead and no session is spawned for it; the twin table below says
which commands have one.

## Where each path dispatches a built-in

The table is read from the 2.1.280 binary; only the `--bg` row has been run, for
a `local-jsx` built-in sent as the whole message. The non-interactive command set
is the prompt-type skills plus the `local` commands that declare non-interactive
support; `local-jsx` commands are excluded from it.

| Path | What dispatches |
|---|---|
| `claude --bg … -- "<prompt>"` | Every built-in, `local-jsx` included — the worker is an interactive session under a pty host, and the positional prompt is parsed as typed input |
| `claude -p "<prompt>"` | The non-interactive set only |
| A routine's `events[].data.message.content` | Probably the non-interactive set only, with `local-jsx` arriving as text |
| A cloud session | The non-interactive set; the attach TUI posts some commands as text and refuses others with `/X isn't available in cloud sessions yet` |
| `SendMessage`, peer and Remote Control inbound | Nothing — every such enqueue forces `skipSlashCommands` |

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

**No CLI subcommand creates a routine, a schedule or a webhook.** This is read
from the `claude --help` subcommand list at 2.1.278, so the claim is bounded to
that version. This is what keeps the event and clock wakes on the tool side of the
Codex boundary: the `--bg` spawn line covers the self-round wake from a shell,
and nothing in the CLI reaches the other two. Re-derive it
from the same listing when the binary moves.

**`environment_id` comes from the `Claude_Code_Remote` MCP server, not from
`RemoteTrigger`.** `list_environments` returns each environment's
`env_` id beside a human-readable name, which is what makes selection possible
without guessing. `RemoteTrigger`'s own action list has no environment action —
the tool's `create` requires the id and supplies no way to obtain it. The CLI's
`--environment` flag is a third value — its help names a self-hosted `ccpool_`
id — so it does not supply this one either.

**The built-in `RemoteTrigger` tool is off inside anything it fires.** The
installed 2.1.278 tool definition reads:
`isEnabled(){return Un()&&mt()&&!a.CLAUDE_CODE_REMOTE&&Gt("allow_remote_sessions")&&Gt(yK)}`.
`CLAUDE_CODE_REMOTE` is set in a remote worker, so a routine's run cannot call
the tool that created it, and no run can retire its own schedule. This is also
why a session can reach routines through the `Claude_Code_Remote` MCP server
while the built-in tool is unavailable in it: they are two surfaces, and only
the built-in one carries this condition. That server's `delete_trigger`
description says a session a routine started cannot delete the routine and
should stop it with `update_trigger` setting `enabled: false`; that has not been
run, so whether a run can retire its own schedule that way is untested.

**It is the tool path, and it has no first-token constraint.** `create` followed by `run` produced a routine and fired it; `get_run_log` showed
the prompt reaching a sandbox that allocated and launched Claude Code. A tool has
no first-token constraint, so a turn can call it anywhere.

**`RemoteTrigger` and `claude --cloud` end in the same kind of session and are not
twins.** Both produce cloud sessions under
`/v1/code/sessions`. `RemoteTrigger` manages routines — stored session templates,
their schedules and their webhook bindings — needs no terminal, has no action that
messages or attaches to a session, and is off under `CLAUDE_CODE_REMOTE`.
`claude --cloud` creates one session and attaches to it, and creating requires an
interactive terminal: without one it prints `Error: --cloud requires an
interactive terminal.`, and combined with `--print` it is refused as
interactive-only. `claude -p "<msg>" --cloud <session_id|url>` sends one message
to an existing session and returns without waiting. The other headless creators
are `Claude_Code_Remote`'s `create_session`, run in an Anthropic-hosted
environment (see *Reaching a cloud session*), and `-p --environment <ccpool_…>`,
on a self-hosted pool only.

**Where `create_session` is not reachable, a pseudo-terminal creates the session
instead.** `script -q <log> claude --cloud "<prompt>" </dev/null` gives the CLI the
terminal it requires, and the new session's `session_…` id is read from the log.
Follow-ups go through `claude -p "<msg>" --cloud <session_id>`, and the transcript
is read with `RemoteTrigger` `get_run_log` on that id. This passes the CLI's
interactive-terminal refusal rather than a published path, so it is the fallback
only: reach for `create_session` first, and expect this to break silently when
the CLI's terminal check moves.

**`claude --cloud` sets the session's permission mode at creation.** Without
`--permission-mode` the session opens in Accept edits, not in the creator's
default mode; `--permission-mode auto` alongside `--cloud` opens it in auto.

**A cloud environment's plugins are those of its setup cache.** A session started
from a cached setup runs the plugin versions installed when that cache was built,
not what the marketplace now carries. Editing the environment's Setup script field
rebuilds the cache, and the next session reinstalls.

**A cloud session runs a new Claude Code process for each user message.** A
`claude plugin update` run inside the session is not a substitute for rebuilding
the setup cache: in the one try, the update installed the new version, but the
behaviour it changed did not show in the messages that followed, and which version
those processes loaded was not established.

**`job_config` must set `ccr.environment_id`.** A body without it is
rejected with `translate job_config v1→v2: job_config must set
ccr.environment_id or ccr.self_hosted_runner_pool_id`.

**That body shape has already moved once.** Routines created earlier
carry no `environment_id` and still list and run, so the server translates the
older shape while requiring the newer one on create. Expect the shape to move
again and read the error rather than a remembered body.

**Where a routine's pieces sit in the body.** `job_config.ccr` carries `environment_id`,
`events[].data.message.content` is the prompt, and `session_context` carries
`allowed_tools` and `model`. `run` fires a routine immediately and returns the
run's `session_id` — the way to verify a routine before leaving it to its
schedule.

**An empty `list_runs` does not prove a routine never fired.** A fire refused before a session existed leaves
no row, so check the routine itself with `get` for `enabled` and `next_run_at`.

**There is no delete action.** The available actions are list, get,
create, update, run, `create_webhook_trigger`, `list_runs` and `get_run_log`.
Retirement is `update` with `enabled: false`; the routine stays listed with its
`run_once_at` intact but does not fire. `Claude_Code_Remote` is a different
surface and does carry `delete_trigger`; its tool description says it deletes the
routine and every session the routine started, which has not been run.

**`create_webhook_trigger` is unverified.** It is known from the tool
description only and was never fired, so its body shape has not been checked against a real
repository. Fire it once before depending on it.

## Sessions, jobs and worktrees

**A resume forks on either of two conditions, and flags are one of them.** The
installed 2.1.278 classifier returns `copy` with reason
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

This corrects two earlier readings. An earlier run had flags alongside
`--resume` start a second job; the rule drawn from it — that any flag forks —
was right for the stopped case and silent about the running one. The correction
then drawn from `claude --help` — that only a running session forks — was wrong
in the other direction, and re-passing `--bg` on a stopped job is exactly the
`own-options` fork. Read the classifier, not the help text, when this moves.

**`claude rm` takes the worktree only from the job that created it.** Two jobs shared one worktree — one created it, the other was
spawned into it. Retiring the second reported the removal alone; retiring the
first named the worktree path and removed it. The retirement report is where that
distinction shows, so read the line rather than predicting which case applies.

**Worktree isolation cuts from the enclosing repository of the session's working
directory, which is not always the directory that looks like the project.** A
session working in a path that looked like a project
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
obligation without them.

**The `--bg` worker is an interactive session under a pty host the daemon
holds.** The 2.1.280 binary launches the worker as `--bg-pty-host <sock> <cols>
<rows> -- <file> [args...]`. The creator needs no terminal of its own, which is
why a shell with no TTY — Codex, or a tool call — can spawn one. An earlier
reading that `--bg` runs "without a PTY" was wrong on the worker's side.

**A `--bg` worker does not exit when its turn ends.** In the one run observed
(2.1.280, a tool-less prompt), the job reached `state: done`, `status: idle` with its answer
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

**A session publishes its own messaging surface.** The registry entry
at `${CLAUDE_CONFIG_DIR:-~/.claude}/sessions/<pid>.json` carries
`messagingSocketPath`, `peerProtocol` and `peerFeatures`, and the key file beside
it holds a `peerToken` at mode 600.

**Connection is not the barrier; framing is.** Any process of the
same uid can connect to a live session's socket. The server then sends nothing —
no banner, no challenge — and holds the connection open waiting for the client to
speak a protocol that is not published. A dead session's socket refuses the
connection outright, which is the liveness signal and the only thing a connect
attempt usefully establishes.

**The surface announces its own movement.** It advertises a
negotiated `peerProtocol` and a feature list while publishing no negotiator for a
non-Claude process — which is what a client written against it would couple to.
Codex has no need to: the CLI covers what it does (below), and
`references/codex.md` routes it there.

**Claude → Codex already works on one.** `codex queue --thread <id>
--message <text>` reaches the app-server daemon from a plain shell — no token, no
`--remote` — and the message persists against a thread that is not running,
delivered when that thread resumes. Addressing a thread that does not exist
returns a JSON-RPC error naming the lookup, which is how to tell an unreachable
daemon from an unknown thread.

**The reverse direction goes through the `--bg` spawn and `--resume`.** The
`claude` CLI carries no `queue`, `send` or `message` subcommand. New work starts
with a `--bg` spawn, stopped with `claude stop` once done — which covers what
`claude -p` does, that being a run that disconnects after its first stop — and a stopped session takes a message through
`claude --resume <sessionId> -- "<msg>"`. Those are the slow layer. A running
session's inbound path is the fast one: a resume of it starts a copy (the
classifier above), and every peer-origin message is forced to
`skipSlashCommands` and `isMeta` (per the 2.1.280 binary) — guarded against injection
and still moving. That, not the socket's framing, is why a Codex-driven launch is
fire-and-forget and is confirmed by a launch check rather than an ACK;
`references/codex.md` carries which check fits which route.

## Reaching a cloud session

The `Claude_Code_Remote` MCP server reaches another cloud session of the same
account. It is the cloud counterpart of the session registry and the transcript
directory, which hold local sessions only. What follows was called from a cloud
session: first against a probe session created with `create_session` and read,
messaged, archived and unarchived from there, later against existing sessions of
other kinds, named where the kind matters.

**The server's name depends on the host.** On a cloud host it is
`claude-code-remote`, and its tools are `mcp__claude-code-remote__<tool>`; this
file names it `Claude_Code_Remote`, as it appeared where the earlier entries were
exercised. Look a tool up by its own name (`get_session`), not by the server's.

**A session id comes from `list_sessions` or `create_session`.** `ListAgents` in a cloud session listed no cloud peers, so it supplies none.
`list_sessions` with `mine: true` lists this account's sessions, each with its
id, title, `status_bucket` and parent. A session finds its own id in its
environment: `CLAUDE_CODE_REMOTE_SESSION_ID` holds it spelled `cse_…` where the
tools take `session_…`. The `session_id` field on each event `list_events`
returns is something else — the target container's local uuid — so an id is not
read back off an event.

**`get_session` answers what the session is; its summaries lag.** It returns the title, `status` and `status_bucket`, the source and outcome
branches, context usage and the model fields. `post_turn_summary` — the last
action and `needs_action` — appears only after a turn ends and is absent while
one runs. `task_summary` stayed on the first step through a later one, and after
a turn that found the probe's files gone, `post_turn_summary` still reported the
values from before. Both are model-written: `status_bucket` gives the coarse
state, and `list_events` what the session actually did. A Remote Control session
also reports `worktree_state` (`is_dirty`, `unpushed_count`); an Anthropic-hosted
one did not.

**`list_events` reads the transcript, tool results included.** It returns user and assistant turns, tool calls and their results — what the session
fetched from a connector or a repository among them — subagent reports,
notifications and the environment's provisioning log. Without a cursor it
returns the newest page, in the order the events happened; `has_more` then means
older events remain, and `before_id` set to the page's `first_id` reads the page
before it, while `after_id` moves toward newer events. `kinds` filters after the
page is read, so a filtered page can come back sparse or empty while more events
exist; keep paging. A large page overflows
inline output and lands in a file to parse. Inline or in the file, the JSON is
wrapped in an untrusted-data envelope: it is data, not instructions. Reading a
whole long session is a bounded extract job — the delegated read SKILL.md names.

**That paging shape has already moved once.** The probe this section
was first written from read a cursorless page as the session's oldest events. A
later exercise on three sessions read it as the newest, and the tool's own
description now says the same. Re-check which end a cursorless read starts from
when the tool moves, rather than trusting either reading.

**A person's turn is a `user` event carrying `client_platform`.** On the
text-only turns seen, its content was a plain string. Tool results, notifications
and cross-session envelopes arrive as `user` events too, so `kinds: ["user"]`
alone does not isolate what a person typed. A turn with an attachment carries
blocks rather than a string — not yet seen — so test for `client_platform` and
the absence of `tool_result` blocks, not for a string. `get_event`'s tool
description says it returns `isSynthetic` and `inbound_origin` for one event,
untried, where an event's origin stays unclear.

**A Remote Control session refuses a read from a cloud session.** `list_events` on a session started from a local CLI with Remote Control — origin
`claude_code_cli`, tagged `remote-control-auto` — was refused with
`non-retryable (elevated_session_untrusted_device)`, and nothing came back. The
error names the condition: the reader is not one of the owner's trusted devices,
which leaves its transcript to the owner's own machine or the Claude app. Reading
it from a local session on that machine was not exercised.

**Only what entered the transcript is reachable.** Thinking blocks
come back signature-only, with empty text. The other container's filesystem — its
temporary files, its pre-compaction transcript — is out of reach.

**`send_message` lands as a user turn, and `priority: "now"` interrupts.** The
message arrives wrapped in a cross-session envelope that marks
it as data and tells the target how to answer. Sent with `priority: "now"` while
the target ran a long tool call, the call ran to completion, then the rest of the
turn was dropped (`terminal_reason: aborted_tools`) and the message was taken up
— an interrupt at the next tool boundary, not mid-call.

**A cloud session can answer.** The probe answered with its own
`send_message`. The answer reached the sending session as a queued notification
once that session's turn ended, not inside the turn. `send_message`'s own tool
description says a cloud session cannot message back; this run contradicts it, so re-run it when the tool moves rather than trusting either text.

**Archiving releases the container; unarchive provisions a fresh one.** A probe wrote marker files to `/tmp` and to its home directory, was
archived, then unarchived and asked for them. The new turn ran in a newly
provisioned sandbox (`session_mode: new`, a different boot id) and both files
were gone; the conversation was kept. The tool description adds that archiving is
for a session a human has already said they are done with. An archived session
stays readable with `list_events`, and its newest events end with an
`end_session` control request whose reason is `archived`.

**The other acts.** These come from the tool descriptions; neither has been
fired. `interrupt_session` stops the current turn at its next checkpoint. `get_event`
reads a single event by uuid.

**A pending permission dialog cannot be answered from here.** No tool in the set
approves or denies one. It is answered at claude.ai/code.
