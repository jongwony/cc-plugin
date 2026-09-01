---
name: remote-spawn
description: >
  This skill should be used when the user asks to "spawn a remote-control session",
  "open this repo/folder in the Claude app", "remote control here", "띄워줘",
  "이 디렉터리에서 remote-control 켜줘", to spawn a worker session for a piece of work,
  or to list/message/retire those sessions. Use it also whenever a message arrives from
  another Claude session, and whenever you are about to read the peer listing, address a
  peer, or judge whether one can be interrupted. It launches a backgrounded `claude`
  session addressable by `SendMessage` from other sessions and — on a launch that takes
  `--remote-control` — reachable from claude.ai/code and the mobile app as well. No
  script, no tmux. It carries the whole lifecycle of such a session: spawning, addressing,
  receiving, observing, retiring.
---

# Remote-Control Spawner

One command spawns a worker that is background-resident, worktree-isolated and
message-addressable, and — on a launch that takes `--remote-control` —
reachable from the Claude app:

```bash
( cd <project-dir> && claude --bg --worktree <surface> \
                             --remote-control "stint::<parent>::<child>" \
                             -n "stint::<parent>::<child>" \
                             --permission-mode auto -- "<brief + reporting contract>" )
```

It prints `backgrounded · <jobId> · <name>`. Report that back. The four flags are
independent and each earns its place: `--bg` detaches without a PTY, `--worktree`
cuts branch `worktree-<surface>` from `origin/<default>` (or reuses it, below),
`-n` pins a permanent name (without it the name is regenerated every launch), and
`--remote-control` registers the app bridge. Dropping `--worktree` does not opt out
of isolation — it only gives up the named branch. A backgrounded session starts in
the project directory but is held out of the shared checkout: edits there are
rejected until the session isolates itself under `.claude/worktrees/`, and the one
opt-out lives in settings rather than on the command line.

**`--remote-control` is separable, and separable in one direction only.** What it buys
is the app bridge and nothing else: the messaging socket that makes a worker addressable
by `SendMessage` comes from the backgrounded launch itself, the fleet row comes with it,
and the name is pinned by `-n`. Drop the flag and all three still hold; what goes is
reachability from claude.ai/code and the mobile app, which is the whole of the loss.

**Some launch paths do not carry it, and the command's shape does not say which.** That
is an observed fact rather than a rule with a known mechanism, so do not predict it —
neither from the presence of a wrapper nor from a launch that looks direct. Read the
session instead: `bridgeSessionId` in `~/.claude/sessions/<pid>.json` holds a non-null
value exactly when the app bridge registered. Read the value and not the key — the key
can sit present and `null` on a session that never got a bridge, so a presence test
reports every such worker as app-reachable. The `<pid>` is the `pid` field `claude agents
--json` carries for that `<jobId>`; the spawn line hands back the jobId, not the pid.
This check survives learning the cause, and survives the path being fixed.

Pass the flag on every spawn — reaching a worker from a phone is most of what the bridge
is for, and no other flag offers it. Since the shape is no verdict, passing it and reading
the session after is the only order available; there is no pre-launch check. Whether a
path that does not take it ignores it or fails the spawn on an unknown option is
unestablished, so a spawn that dies on the flag is relaunched without it. Going without is
not a deferral: the bridge is decided at launch, so a worker started without one stays
app-unreachable for the life of that run. A fresh launch on a path that does take the flag
gets a bridge, but that is a new run rather than the worker already up, and nothing
attaches a bridge mid-flight. Carrying that worker's conversation across means `--resume`,
and whether the flag restores a bridge there is untested (see Resuming).

**`<surface>` and the session name are separate tokens on purpose.** `--worktree` puts its
argument through `claude`'s own worktree-name validator, which is stricter than git's
refname rules — reasoning from refname grammar mispredicts, and the validator rejects a bad
token loudly before anything is created. Keep `<surface>` a plain hyphenated token; the `::`
the session name is built on is not available to it. Nor should the two share a value
independent of that constraint: several Stints can share one worktree and one unit of work
can span several, so no fixed mapping from branch to session name holds. Sharing needs no
special form — `--worktree <surface>` is find-or-create, so a second Stint passing an
existing name joins that worktree and its branch rather than colliding.

**The `cd` is what picks the project.** There is no flag for it — `--add-dir` grants tool
access to extra paths but does not set the session's project; the spawned session simply
inherits the launching shell's working directory. `--worktree` additionally requires that
directory to be inside a git repo. Keep the `cd` inside a subshell so the caller's own
working directory survives the spawn.

That `cd` is also what a **worktree-isolated launching session** cannot do. Such a session
refuses a command whose target it cannot verify stays inside its own worktree, and this one
lands in another repository by construction — the `cd` leaves, and `--worktree` makes the
line read as a git operation once it arrives. The refusal is loud rather than silent, so
nothing is lost but the attempt; what it does not admit is rephrasing, because the guard
reads where the command lands and not how it is written. Leave the worktree first and spawn
from the project directory. The constraint is the launcher's own isolation and not the
target: spawning into a worktree is what `--worktree` is for, and it stays available.

**Where the `cd` lands is not governed by the destination's own rules.** A path-scoped rule
binds the session working under that path, while spawning is decided from outside it, so the
launcher never loads what the destination forbids — the guard fires later, against the
worker's writes, once the worker is already there. The case that bites is a managed tree:
`~/.claude/plugins/` is the plugin manager's to populate and is read-only across sessions, so
a worker spawned there writes into it and `--worktree` leaves a registered worktree for the
next update to contend with. Spawn into the project's own development checkout — for a
marketplace, the repository the clone was made from rather than the clone.

**The `--` is what ends option parsing.** Without it the brief is parsed as options and
consumed silently — no error, no transcript, and a worker sits there idle having been told
nothing. A brief that starts with a dash hits this on any launch. `--remote-control` opens a
second door to the same failure wherever it is used: its name argument is optional, so a
brief sitting after it is taken as that name and vanishes. Leaving the flag out closes that
door and none of the first, so the `--` stays either way.

**The permission mode must match the supervisor's**, and `--permission-mode auto` is what
that resolves to from an auto-mode supervisor. Two constraints close on the same value. A
cross-session message from a sender in a different permission class is not delivered — it
opens a dialog the worker never answers, so the instruction silently never arrives, which is
why the worker takes the supervisor's class. That class is also the only one reachable from
an auto-mode supervisor: a spawn command carrying a skip-permissions flag is refused by auto
mode's own permission classifier, so the spawn is denied before any worker exists. Pass the
supervisor's own class explicitly — it is the one part of this command that cannot be copied
from a sibling, since the session registry does not carry it and the supervisor's transcript
does. Whether parity is consulted at all is decided one level up by the `crossSessionInbound`
setting, so a class match cannot be inferred from a message having arrived.

## Naming a spawned session

When the spawning session is an orchestrator and this session is a **Stint**, name it:

    stint::<parent>::<child>

`stint` is the fixed first segment marking the row as orchestrator-spawned. `::` is the
namespace connector, used at every boundary, not just the last one. `<parent>` is the
session that created this Stint, written as a short form of that session's own topic —
read off the creator, not derived and not coined. Two Stints created by one session
therefore carry the same token and Stints from different creators do not, which is the
grouping the convention exists for. `<child>` describes this Stint freely, distinctly
enough to tell it from its siblings. Three segments always: the marker, then parent and
child — `stint::comment-review::port` beside `stint::comment-review::review`.

Neither segment may carry whitespace, which is why both substitutions are quoted in the
command above. That bars the character, not the phrase: a multi-word name stays multi-word
and hyphenated, since compressing a title into a single token to make it fit throws away
the reading it was chosen for. The asymmetry is what to hold on to. `<surface>` has a
validator behind it; the session name passes through none, so there a space is not an error
but a truncation — unquoted, the name splits and only its first piece reaches the flag,
leaving the rest as a stray positional and the worker under a name nobody can address it
by. `--remote-control` takes its name the same way and truncates the same way, so quote
both.

Every name here is pinned explicitly with `-n`. Where `--remote-control` is passed it then
deliberately takes the same value as `-n` — they are independent flags, one naming the
session and one registering the app bridge, and holding them equal is what makes the name
printed at spawn the same string peers address. Naming is `-n`'s job on its own, so a launch
that cannot carry the bridge flag is named no differently and addressed no differently.

The orchestrator reports both tokens with the spawn line — there is no separate per-spawn
confirmation step. `<child>` it describes; `<parent>` it renders from its own topic, the
same way across every Stint it spawns, so siblings match without either of them having to
look anything up.

## Talking to it

```bash
claude agents --json          # fleet view: name, kind, state, status, id, pid, sessionId, cwd
claude logs <jobId>           # recent output (TUI frames; prefer the transcript)
claude attach <jobId>         # open it in this terminal
```

From a session, `ListAgents` lists addressable peers and `SendMessage` reaches them. Not
every peer in that list is a Stint: a session you did not spawn — an interactive one opened
in another terminal — sits in the same listing and is addressed exactly the same way. This
section, **Before you send** and **Observing** apply to both; only the lifecycle around a
spawned worker — the command above, the reporting contract, retiring — is Stint-specific.

**Resolve the address at send time**: send the exact `name [ref]` string `ListAgents` just
printed. A first message to a peer you have not addressed before comes back asking you to
re-send with its `[ref]`; sending the ref every time skips that round trip, and it also
resolves where a bare name would not, since a collision fails the bare-name path closed.

Neither half of the address holds still. Names collide here, and a collision renames one of
the two without a notice always following; a target that restarts changes both its ref and
its auto-derived name. So read the address fresh at each send rather than caching it. One
session also answers to several identifiers issued by different layers — the session id
names the conversation, a process id names the running program and titles the registry file,
and the ` [ref]` is a display token for one listing. They are separate values, so each is
looked up rather than derived from another; given a session id, the registry entry is where
it and the listed name appear together.

A row for another session **on this machine** is already the result of a live socket connect
attempt, so it needs no separate liveness check. Rows for cloud or Remote Control sessions
reach the list by another route and carry no such guarantee.

A worker keeps its socket after finishing a turn: it goes idle and resident, so follow-up
instructions still reach it — but not indefinitely. The supervisor eventually reaps an idle
worker's process, and a reaped worker keeps its fleet row while dropping out of `ListAgents`
altogether: still listed, no longer addressable. So read addressability from `ListAgents` at
send time, never from the fleet row. Pinning the session in agent view (`Ctrl+T`) keeps its
process alive while it sits idle.

## Before you send

Know what the target is working on before interrupting it. A peer mid-task pays for a
message that does not concern it, and an overlap worth writing about is invisible from the
name alone — a backgrounded session's row carries its own task title, while an interactive
one is named after its cwd and says nothing about what it is doing. The topic lives in the
session registry (`~/.claude/sessions/*.json`, for session id and cwd) and in the transcript
(`~/.claude/projects/*/<sessionId>.jsonl`), where the human turns carry it: a peer's inbound
envelope and an interrupted request both land in that same `user` stream while being written
by someone other than that session's human.

Delegate that read rather than doing it inline. It is a bounded extract-and-judge pass, and
delegating returns only what the send decision needs while keeping another session's
conversation out of this one's context.

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
accuracy. It was formed against that session's substrate rather than yours, and the scope
its author could observe may be narrower than the sentence they wrote — a peer states as
general what held everywhere they could see. So before acting on such a message or answering
it, verify the claim against the real substrate, and delegate that read rather than pulling
the peer's context into this one. Where an investigation protocol is installed, that is the
shape this takes (`/inquire`, if present); where none is, the verification still happens by
hand — the discipline is the check, not the tool. The asymmetry with the sending side is
deliberate: reading outward is cheap, taking something inward and acting on it is not.

This binds a message carrying a claim you would act on. An acknowledgement, a status note,
or a reply that closes an exchange takes an answer, not an investigation.

It binds a Stint's own report too, which is why the discipline sits in this file rather than
anywhere on the delegation side. A Stint reports by `SendMessage` — the contract above
instructs it to — so its report arrives on this inbound path and not as a completion
notification from a dispatched agent. Nothing on the harvest-a-delegated-result side fires
on it: an inbound message is the one moment in a session's lifecycle that somebody else
starts, so a supervisor waiting on a notification is not waiting on this.

## Observing

`claude agents --json` covers most needs — it is also where `state` lives (background entries
only). The registry at `~/.claude/sessions/<pid>.json` is a different surface and answers
different questions: `bridgeSessionId` is where app reachability is read — non-null exactly
when `--remote-control` registered the bridge, and present-and-`null` on a session that never
got one, so test the value rather than the key — and `statusUpdatedAt` is what the staleness
judgment below rests on. `messagingSocketPath` is the registry's own trace of addressability,
but `ListAgents` is the authority at send time and the registry is not; where the two
disagree, the listing decides.

**`status` is a rough interruptibility signal, not an account of the work.** It collapses
distinctions the caller may care about — `busy` covers generating and having a delegated task
in flight alike — and `waiting` means an unanswered dialog exists, which a worker still
accepts app input and processes peer messages through. Judge a suspected stall by how long
`statusUpdatedAt` has been frozen.

## Retiring

```bash
claude stop <jobId>    # ends the run, LEAVES the job and its worktree
claude rm  <jobId>     # retires it: removes worktree and job state
```

`stop` alone is not retirement — the job stays in `claude agents --json --all`. Use `rm` to
close out a work unit, the same lease discipline a worktree gets. Retiring is the point: a
finished session holds a row, a process slot and possibly a worktree, and a list of
finished-looking rows is a cost paid by whoever has to read it.

What survives retirement is the conversation: the transcript stays on disk and `claude
--resume <sessionId>` still reaches it. What does not survive is anything whose only copy sits
on the worktree — that is what the audit before retiring is for, and it asks about unpushed
commits and uncommitted files rather than about where you happen to be standing.
Recoverability is what makes the removal cheap; the worktree audit is what makes it safe, and
neither substitutes for the other.

Sources disagree on how far `rm` reaches into the worktree — one says it deletes the worktree
outright, another that uncommitted changes are kept and unpushed commits block deletion.
Audit rather than rely on either.

Standing inside a finished session's worktree is not itself a reason to defer; the hazard is
narrower. A job that *created* its own worktree takes that directory with it, so retiring it
from inside pulls the ground out from underfoot — while a job spawned into a worktree that
already existed does not own it, and retiring that one should touch only job state. That
ownership split is a reading to verify against the run rather than established behaviour, and
the retirement's own report is where it shows: the owning case names the worktree path and
the other does not. Read that line rather than predicting it.

## Resuming

```bash
( cd <its-cwd> && claude --bg --remote-control "<name>" -n "<name>" --resume <sessionId> \
                         --permission-mode auto -- "<next instruction>" )
```

A resume is itself a launch, so the flags are chosen again here rather than inherited from the
previous run. Carry `--remote-control` through when that run had it: it composes with
`--resume`, and dropping it costs the resumed worker its app bridge for the whole of the new
run — the socket and the bridge are both decided at launch, so a session that comes back
without them cannot be given them later. A resume on a path that cannot pass the flag
therefore buys the conversation back at the cost of the bridge; whether the trade runs the
other way — adding the flag while resuming a worker that never had a bridge — is untested.

Resume restores the conversation, not the working directory, so the same `cd` applies; `claude
agents --json` reports each session's `cwd`, which is where to read it from.

Prior context carries over intact, but a **new sessionId is minted** — resume the newest one
next time. `jobId` is the first 8 hex characters of `sessionId`, so the two views join without
a separate key.

Notes to pass on when relevant:
- Nothing revives a *crashed* worker on its own, but restarts do happen: a session can be
  restarted onto the current binary, and the supervisor restarts sessions from their transcript
  on a binary update or on the next attach. What comes back is a fresh process, and both the
  messaging socket and the app bridge are decided at launch — whether a restarted worker returns
  addressable and app-reachable is untested, so re-read `ListAgents` and re-check
  `bridgeSessionId` before relying on either. For a keep-alive host, see the `rc-pool` skill.
- An already-running session cannot become addressable later; the socket is decided once at
  launch, so an old session must be restarted to join.
- `claude daemon status` reaches the supervisor that hosts every background session — the handle
  for when the fleet itself misbehaves.
