---
name: remote-spawn
description: >
  This skill should be used when the user asks to "spawn a remote-control session",
  "open this repo/folder in the Claude app", "remote control here", "띄워줘",
  "이 디렉터리에서 remote-control 켜줘", to spawn a worker session for a piece of work,
  or to list/message/retire those sessions. Use it also whenever a message arrives from
  another Claude session, and whenever you are about to read the peer listing, address a
  peer, or judge whether one can be interrupted. It launches a backgrounded `claude`
  session that is reachable from claude.ai/code and the mobile app AND addressable by
  `SendMessage` from other sessions — no script, no tmux, no Telegram bridge — and it
  carries the whole lifecycle of such a session: spawning, addressing, receiving,
  observing, retiring.
---

# Remote-Control Spawner

One command spawns a worker that is background-resident, worktree-isolated,
app-reachable, and message-addressable:

```bash
( cd <project-dir> && claude --bg --worktree <surface> \
                             --remote-control "stint::<parent>::<child>" \
                             -n "stint::<parent>::<child>" \
                             --permission-mode auto -- "<brief + reporting contract>" )
```

It prints `backgrounded · <jobId> · <name>`. Report that back. The four flags are
independent and each earns its place: `--bg` detaches without a PTY, `--worktree`
cuts branch `worktree-<surface>` from `origin/<default>` (or reuses it, below),
`--remote-control` registers the app bridge, `-n` pins a permanent name (without it the
name is regenerated every launch). Dropping `--worktree` does not opt out of isolation — it only gives up the named
branch. A backgrounded session starts in the project directory but is held out of the
shared checkout: edits there are rejected until the session isolates itself under
`.claude/worktrees/`. The one opt-out is `worktree.bgIsolation: "none"` in settings.

**`<surface>` and the session name are separate tokens on purpose.** `--worktree` puts its
argument through `claude`'s own worktree-name validator, which is stricter than git's
refname rules: each `/`-separated segment may hold only letters, digits, dots,
underscores and dashes, to 64 characters total. Git's refname grammar is wider, so
reasoning from it mispredicts — `a+b` is a legal refname and is rejected here. `<surface>`
stays a plain hyphenated token, and the `::` the session name is built on is not available
to it.

Nor should the two share a value, independent of that constraint: several Stints can
share one worktree, and one unit of work can span several worktrees — neither direction
supports a fixed mapping from branch to session name. Sharing needs no special form:
`--worktree <surface>` is find-or-create, so a second Stint passing a name that already
exists joins that worktree and its branch rather than colliding.

**The `cd` is what picks the project.** There is no flag for it — `--add-dir` grants tool
access to extra paths but does not set the session's project; the spawned session simply
inherits the launching shell's working directory. `--worktree` additionally requires that
directory to be inside a git repo. Keep the `cd` inside a subshell so the caller's own
working directory survives the spawn.

**The `--` is what ends option parsing.** Without it the brief is parsed as options: a brief that
starts with a dash, or that follows `--remote-control` (whose name argument is optional and
will happily swallow it), is consumed silently — `claude` prints `(idle — send a prompt to
start)`, no error, no transcript, and a worker sits there having been told nothing.

**The permission mode must match the supervisor's**, and `--permission-mode auto` is what
that resolves to from an auto-mode supervisor. Two constraints close on the same value.
A cross-session message from a sender in a different permission class is not delivered —
it opens a dialog the worker never answers, so the instruction silently never arrives, which
is why the worker takes the supervisor's class. That class is also the only one reachable
from an auto-mode supervisor: a spawn command carrying a skip-permissions flag is refused by
auto mode's own permission classifier, so the spawn is denied before any worker exists. Pass
the supervisor's own class explicitly — it is the one part of
this command that cannot be copied from a sibling. The session registry does not carry it;
the supervisor's transcript does, as `{"type":"permission-mode","permissionMode":…}` records
written on every mode change. Whether parity is consulted at all is decided one level up, by
the `crossSessionInbound` setting — so a class match cannot be inferred from a message having
arrived, and the setting is read rather than assumed when that inference would matter.

## Naming a spawned session

When the spawning session is an orchestrator and this session is a **Stint**, name it:

    stint::<parent>::<child>

`stint` is the fixed first segment marking the row as orchestrator-spawned. `::` is the
namespace connector, used at every boundary, not just the last one. `<parent>` is the
session that created this Stint, written as a short form of that session's own topic —
read off the creator, not derived and not coined. Two Stints created by one session
therefore carry the same token and Stints from different creators do not, which is the
grouping the convention exists for. `<child>` describes this Stint freely, distinctly
enough to tell it from its siblings under the same parent. Three segments always: the
marker, then parent and child. Two Stints from one creator:
`stint::comment-review::port` and `stint::comment-review::review`.

Neither segment may carry whitespace, which is why both substitutions are quoted in the
command above. That bars the character, not the phrase: a multi-word name stays
multi-word and hyphenated, since compressing a title into a single token to make it fit
throws away the reading it was chosen for. The asymmetry is what to hold on to:
`<surface>` is covered by the validator, which rejects a bad token loudly before anything
gets created, while the session name passes through no validator at all. There a space is
not an error but a truncation — `--remote-control stint::my unit::build` registers
`stint::my` and leaves the rest as a stray positional, so the worker comes up under a name
nobody can address it by. The same freedom that is safe on one token fails silently on the
other.

Every name here is pinned explicitly with `-n`, and `-n` and `--remote-control`
deliberately take the same value — they are independent flags, one naming the session and
one registering the app bridge, and holding them equal is what makes the name printed at
spawn the same string peers address.

The orchestrator reports both tokens with the spawn line — there is no separate per-spawn
confirmation step. `<child>` it describes; `<parent>` it renders from its own topic, the
same way across every Stint it spawns, so siblings match without either of them having to
look anything up.

Stints chain — one hands off to the next. Each level of Stint under a Stint adds
supervision depth, which puts another hop between a gate and whoever can answer it.
A subagent adds no such depth: it returns to its dispatcher and supervises nothing,
which is how a Stint realizes work that must run in mutually isolated contexts.

## Talking to it

```bash
claude agents --json          # fleet view: name, kind, state, status, id, pid, sessionId, cwd, startedAt
claude logs <jobId>           # recent output (TUI frames; prefer the transcript)
claude attach <jobId>         # open it in this terminal
```

From a session, `ListAgents` lists addressable peers and `SendMessage` reaches them.
Not every peer in that list is a Stint: a session you did not spawn — an interactive one
opened in another terminal — sits in the same listing and is addressed exactly the same
way. This section, **Before you send** and **Observing** apply to both; only the lifecycle
around a spawned worker — the command above, the reporting contract, retiring — is
Stint-specific.

**Resolve the address at send time**: send the exact `name [ref]` string `ListAgents`
just printed. The first message to a peer you have not addressed before comes back
asking you to re-send with its `[ref]` — a one-time confirmation, after which the bare
name resolves for the rest of that conversation. Sending the ref every time skips that
round trip, and it also resolves where a bare name would not: the explicit-ref branch runs
ahead of the bare-name uniqueness check, which fails closed on a collision.

Neither half of the address holds still. Names collide heavily here, and a collision sends
one of the two sessions to a hyphenated variant without a notice always following — the
startup path renames silently. A target that restarts changes both its ref and its
auto-derived name. So read the address fresh at each send; the registry is what carries the
current one.

A row for another session **on this machine** is already the result of a live socket
connect attempt, so it needs no separate liveness check. Rows for cloud or Remote Control
sessions reach the list by another route and carry no such guarantee.

One session answers to several identifiers, each issued by a different layer: the session
id names the conversation and titles its transcript, a process id names the running
program and titles both the registry file and its socket, and the ` [ref]` in a listing
row is a display token for that listing. They are separate values, so each is looked up
rather than derived from another. Given a session id, the registry entry is where it and
the listed name appear together — read the name there, then address by that name.


A worker keeps its socket after finishing a turn: it goes idle and resident, so
follow-up instructions still reach it — but not indefinitely. The supervisor
eventually reaps an idle worker's process, and a reaped worker keeps its row in
`claude agents --json` while dropping out of `ListAgents` altogether: still listed,
no longer addressable. So read addressability from `ListAgents` at send time, never
from the fleet row. Pinning the session in agent view (`Ctrl+T`) keeps its process
alive while it sits idle.

## Before you send

Know what the target is working on before interrupting it. A peer mid-task pays for a
message that does not concern it, and an overlap worth writing about is invisible from the
name alone — a backgrounded session's row carries its own task title, while an interactive
one is named after its cwd and says nothing about what it is doing. The topic lives in the
session registry (`~/.claude/sessions/*.json`, for session id and cwd) and in the
transcript (`~/.claude/projects/*/<sessionId>.jsonl`), where the human turns carry it: a
peer's inbound envelope and an interrupted request both land in that same `user` stream
while being written by someone other than that session's human.

Delegate that read at the haiku tier rather than doing it inline. It is a bounded
extract-and-judge pass, and delegating returns only what the send decision needs while
keeping another session's conversation out of this one's context.

## Reporting contract — put it in the initial prompt

A spawned session never reads this file. Carry the contract in the brief itself:

> You are a worker supervised by `<supervisor-name>`. To report: call `ListAgents`
> first, read the exact `name [ref]` string for your supervisor, and use that string
> as `to` in `SendMessage` — your first send to a peer is answered with a re-send
> request unless it carries the ref, and names collide. Send (a) an ACK on start,
> (b) your state whenever you are blocked on a decision you cannot make alone, and
> (c) a completion report. Do not wait for a reply — durable output (PR, parked task)
> ships regardless of the channel.

## Receiving

A message from another session is a claim, and its arrival establishes nothing about its
accuracy. The claim was formed against that session's substrate rather than yours, and the
scope its author could observe may be narrower than the sentence they wrote — a peer states
as general what held everywhere they could see. Before acting on such a message or
answering it, run `/inquire` at the sonnet tier against the real substrate. The asymmetry
with the sending side is deliberate: reading outward is cheap, taking something inward and
acting on it is not.

This binds a message carrying a claim you would act on. An acknowledgement, a status note,
or a reply that closes an exchange takes an answer, not an investigation.

It binds a Stint's own report too, which is why the discipline sits in this file rather
than anywhere on the delegation side. A Stint reports by `SendMessage` — the contract above
instructs it to — so its report arrives on this inbound path and not as a completion
notification from a dispatched agent. Nothing on the harvest-a-delegated-result side fires
on it: an inbound message is the one moment in a session's lifecycle that somebody else
starts, so a supervisor waiting on a notification is not waiting on this.

Both tiers named here — haiku for the outward read, sonnet for the inward one — are
per-situation choices for these two reads, not standing routes for anything else.

## Observing

`claude agents --json` covers most needs — it is also where `state` lives (background entries
only). The registry at `~/.claude/sessions/<pid>.json` is a different surface and answers a
different question: **`messagingSocketPath` is present exactly when the session is addressable
by `SendMessage`**, which nothing else reports. Alongside it, `bridgeSessionId` is where app
reachability is read, and `statusUpdatedAt` is what the staleness judgment below rests on.

**`status` is a rough interruptibility signal, not an account of the work.** It collapses
distinctions the caller may care about — `busy` covers generating and having a delegated task
in flight alike, and some delegated work is not counted at all — and `waiting` means an
unanswered dialog exists, which a worker still accepts app input and processes peer messages
through. Judge a suspected stall by how long `statusUpdatedAt` has been frozen.

## Retiring

```bash
claude stop <jobId>    # ends the run, LEAVES the job and its worktree
claude rm  <jobId>     # retires it: removes worktree and job state
```

`stop` alone is not retirement — the job stays in `claude agents --json --all`. Use `rm`
to close out a work unit, the same lease discipline a worktree gets.

Retiring is the point. A finished session holds a row, a process slot and possibly a
worktree, and a list of finished-looking rows is a cost paid by whoever has to read it.

What survives retirement is the conversation: the transcript stays on disk and `claude
--resume <sessionId>` still reaches it. What does not survive is anything whose only copy
sits on the worktree — that is what the audit before retiring is for, and it asks about
unpushed commits and uncommitted files rather than about where you happen to be standing.
Recoverability is what makes the removal cheap; the worktree audit is what makes it safe,
and neither substitutes for the other.

Sources disagree on how far `rm` reaches into the worktree: `claude rm --help` says it
deletes the session and its worktree outright, while the published docs say a worktree with
uncommitted changes is kept and unpushed commits block deletion. Audit rather than rely on
either.

Standing inside a finished session's worktree is not itself a reason to defer; the
hazard is narrower. A job that *created* its own worktree takes that directory with it, so
retiring it from inside pulls the ground out from underfoot — while a job spawned into a
worktree that already existed does not own it, and retiring that one should touch only job
state. That ownership split is a reading to verify against the run rather than established
behaviour, and the retirement's own report is where it shows: the owning case names the
worktree path and the other does not. Read that line rather than predicting it.

## Resuming

```bash
( cd <its-cwd> && claude --bg --remote-control <name> -n <name> --resume <sessionId> \
                         --permission-mode auto -- "<next instruction>" )
```

Carry `--remote-control` through the resume too. It composes, and dropping it costs the
resumed worker its app bridge permanently — the socket and the bridge are both decided at
launch, so a session that comes back without them cannot be given them later.

Resume restores the conversation, not the working directory, so the same `cd` applies;
`claude agents --json` reports each session's `cwd`, which is where to read it from.

Prior context carries over intact, but a **new sessionId is minted** — resume the newest
one next time. `jobId` is the first 8 hex characters of `sessionId`, so the two views join
without a separate key.

Notes to pass on when relevant:
- Nothing revives a *crashed* worker on its own, but restarts do happen: `claude respawn
  <jobId>` (or `--all`) restarts a session onto the current binary, and the supervisor
  restarts sessions from their transcript on a binary update or on the next attach. What
  comes back is a fresh process, and both the messaging socket and the app bridge are
  decided at launch — whether a restarted worker returns addressable and app-reachable is
  untested, so re-read `ListAgents` before relying on it. For a keep-alive host, see the
  `rc-pool` skill.
- An already-running session cannot become addressable later; the socket is decided once at
  launch, so an old session must be restarted to join.
- `claude daemon status` and `claude daemon stop --any --keep-workers` reach the supervisor
  that hosts every background session — the handles for when the fleet itself misbehaves.
