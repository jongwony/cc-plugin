---
name: remote-spawn
description: >
  This skill should be used when the user asks to "spawn a remote-control session",
  "open this repo/folder in the Claude app", "remote control here", "띄워줘",
  "이 디렉터리에서 remote-control 켜줘", to spawn a worker session for a piece of work,
  or to list/message/retire those sessions. It launches a backgrounded `claude` session
  that is reachable from claude.ai/code and the mobile app AND addressable by
  `SendMessage` from other sessions — no script, no tmux, no Telegram bridge.
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
underscores and dashes, to 64 characters total. Reason from git's rules instead and you
will mispredict — `a+b`, `a,b` and `a@b` are all legal refnames and all rejected here.
So `<surface>` stays a plain hyphenated token, and the `::` the session name is built on is
not available to it.

Nor should the two share a value, independent of that constraint: several Stints can
share one worktree (a build pass and a review pass on the same surface), and one unit of
work can span several worktrees (a change landing in two repos) — neither direction
supports a fixed mapping from branch to session name. Sharing needs no special form:
`--worktree <surface>` is find-or-create, so a second Stint passing a name that already
exists joins that worktree and its branch rather than colliding.

**The `cd` is what picks the project.** There is no flag for it — `--add-dir` grants tool
access to extra paths but does not set the session's project; the spawned session simply
inherits the launching shell's working directory. `--worktree` additionally requires that
directory to be inside a git repo. Keep the `cd` inside a subshell so the caller's own
working directory survives the spawn.

**The `--` is not decoration.** Without it the brief is parsed as options: a brief that
starts with a dash, or that follows `--remote-control` (whose name argument is optional and
will happily swallow it), is consumed silently — `claude` prints `(idle — send a prompt to
start)`, no error, no transcript, and a worker sits there having been told nothing.

**The permission mode must match the supervisor's**, and `--permission-mode auto` is what
that resolves to from an auto-mode supervisor. Two constraints close on the same value.
A cross-session message from a sender in a different permission class is not delivered —
it opens a dialog the worker never answers, so the instruction silently never arrives, which
is why the worker takes the supervisor's class rather than the most permissive one available.
And from that class the permissive one is not available anyway: `--dangerously-skip-permissions`
in a spawn command is refused by auto mode's own permission classifier, so the spawn is denied
before any worker exists. Pass the supervisor's own class explicitly — it is the one part of
this command that cannot be copied from a sibling. The session registry does not carry it;
the supervisor's transcript does, as `{"type":"permission-mode","permissionMode":…}` records
written on every mode change.

## Naming a spawned session

When the spawning session is an orchestrator and this session is a **Stint** — a worker
whose scope exceeds one context lifecycle; smaller work goes to a subagent instead — name
it:

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

Because `<parent>` names whoever created the Stint, and a Stint never spawns another,
that creator is always an orchestrator session. The no-nesting cap below holds here by
construction rather than as an exception this rule has to carve out.

Neither segment may carry whitespace, which is why both substitutions are quoted in the
command above. That bars the character, not the phrase: a multi-word name stays
multi-word, hyphenated — `comment-review`, not `commentreview`. Compressing a title into
a single token to make it fit throws away the reading the token was chosen for. The
asymmetry is the part worth holding on to: `<surface>` is covered by the validator,
which rejects a bad token loudly before anything gets created, while the session name
passes through no validator at all. There a space is not an error but a truncation —
`--remote-control stint::my unit::build` registers `stint::my` and leaves the rest as a
stray positional, so the worker comes up under a name nobody can address it by. The same
freedom that is safe on one token fails silently on the other.

`claude` does ship `--remote-control-session-name-prefix`, and this convention does not
use it: it prefixes auto-generated names only, while every name here is pinned explicitly
with `-n`. `-n` and `--remote-control` then deliberately take the same value — they are
independent flags, one naming the session and one registering the app bridge, and holding
them equal is what makes the name printed at spawn the same string peers address.

The orchestrator reports both tokens with the spawn line — there is no separate per-spawn
confirmation step. `<child>` it describes; `<parent>` it renders from its own topic, the
same way across every Stint it spawns, so siblings match without either of them having to
look anything up.

Stints chain — one hands off to the next — but never nest: a Stint must not spawn or
supervise another Stint, since that recursion is what multiplies supervision depth and
the cognitive load that comes with it. A Stint may dispatch and supervise subagents of
its own — a subagent adds no supervision depth, and dispatching isolated subagents is
exactly how a Stint realizes work that must run in mutually isolated contexts. The cap
holds at one level of Stint depth; the subagent layer beneath a Stint is a different
kind of thing and is not what this cap counts.

## Talking to it

```bash
claude agents --json          # fleet view: name, kind, state, status, id, pid, sessionId, cwd, startedAt
claude logs <jobId>           # recent output (TUI frames; prefer the transcript)
claude attach <jobId>         # open it in this terminal
```

From a session, `ListAgents` lists addressable peers and `SendMessage` reaches them.
**Resolve the address at send time**: send the exact `name [ref]` string `ListAgents`
just printed. The first message to a peer you have not addressed before comes back
asking you to re-send with its `[ref]` — a one-time confirmation, after which the bare
name resolves for the rest of that conversation. Sending the ref every time skips that
round trip and survives the other hazard: names collide heavily here, and a target that
restarts changes both its ref and its auto-derived name. So read it, do not cache it.

A worker keeps its socket after finishing a turn: it goes idle and resident, so
follow-up instructions still reach it — but not indefinitely. The supervisor
eventually reaps an idle worker's process, and a reaped worker keeps its row in
`claude agents --json` while dropping out of `ListAgents` altogether: still listed,
no longer addressable. So read addressability from `ListAgents` at send time, never
from the fleet row. Pinning the session in agent view (`Ctrl+T`) keeps its process
alive while it sits idle.

## Reporting contract — put it in the initial prompt

A spawned session never reads this file. Carry the contract in the brief itself:

> You are a worker supervised by `<supervisor-name>`. To report: call `ListAgents`
> first, read the exact `name [ref]` string for your supervisor, and use that string
> as `to` in `SendMessage` — your first send to a peer is answered with a re-send
> request unless it carries the ref, and names collide. Send (a) an ACK on start,
> (b) your state whenever you are blocked on a decision you cannot make alone, and
> (c) a completion report. Do not wait for a reply — durable output (PR, parked task)
> ships regardless of the channel. Do not spawn or supervise another worker of your
> own — hand that work back to your supervisor instead, since worker-to-worker nesting
> is what multiplies supervision depth. Dispatching and supervising subagents of your
> own is fine; that adds no such depth.

## Observing

`claude agents --json` covers most needs — it is also where `state` lives (background entries
only). The registry at `~/.claude/sessions/<pid>.json` is a different surface and answers a
different question: **`messagingSocketPath` is present exactly when the session is addressable
by `SendMessage`**, which nothing else reports. Alongside it: `entrypoint`, `bridgeSessionId`
(app reachability), `nameSource`, `jobId`, `statusUpdatedAt`, and `waitingFor` — the last
written only while the session is actually waiting, so its absence is the normal case.

`status: "waiting"` means **an unanswered dialog exists, not that the session is stuck** —
a worker in that state still accepts app input and still processes peer messages. Judge by
how long `statusUpdatedAt` has been frozen, not by the status value alone.

## Retiring

```bash
claude stop <jobId>    # ends the run, LEAVES the job and its worktree
claude rm  <jobId>     # retires it: removes worktree and job state
```

`stop` alone is not retirement — the job stays in `claude agents --json --all`. Use `rm`
to close out a work unit, the same lease discipline a worktree gets.

Retiring is not a loss to be weighed against keeping the row. Ending the process and
taking the row out of the fleet is the point: a list of finished-looking rows is the
cost that accumulates, and it is paid by whoever has to read the list. The
conversation survives `rm` — the transcript stays on disk and `claude --resume
<sessionId>` still reaches it. What does not survive is anything whose only copy sits
on the worktree, so audit that first. Sources disagree on how far `rm` reaches there:
`claude rm --help` says it deletes the session and its worktree outright, while the
published docs say a worktree with uncommitted changes is kept and unpushed commits
block deletion. Audit rather than rely on either.

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
- `claude daemon status` reports on the supervisor that hosts every background session;
  `claude daemon stop --any --keep-workers` stops the supervisor while leaving the workers
  running. Neither is wanted in normal use — they are the handles for when the fleet itself
  misbehaves.
