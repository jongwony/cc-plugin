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
( cd <project-dir> && claude --bg --worktree <unit> --remote-control <unit> -n <unit> \
                             --dangerously-skip-permissions -- "<brief + reporting contract>" )
```

It prints `backgrounded · <jobId> · <name>`. Report that back. The four flags are
independent and each earns its place: `--bg` detaches without a PTY, `--worktree`
cuts a branch `worktree-<unit>` from `origin/<default>`, `--remote-control` registers
the app bridge, `-n` pins a permanent name (without it the name is regenerated every
launch). Dropping `--worktree` does not opt out of isolation — it only gives up the named
branch. A backgrounded session starts in the project directory but is held out of the
shared checkout: edits there are rejected until the session isolates itself under
`.claude/worktrees/`. The one opt-out is `worktree.bgIsolation: "none"` in settings.

**The `cd` is what picks the project.** There is no flag for it — `--add-dir` grants tool
access to extra paths but does not set the session's project; the spawned session simply
inherits the launching shell's working directory. `--worktree` additionally requires that
directory to be inside a git repo. Keep the `cd` inside a subshell so the caller's own
working directory survives the spawn.

**The `--` is not decoration.** Without it the brief is parsed as options: a brief that
starts with a dash, or that follows `--remote-control` (whose name argument is optional and
will happily swallow it), is consumed silently — `claude` prints `(idle — send a prompt to
start)`, no error, no transcript, and a worker sits there having been told nothing.

**The permission mode must match the supervisor's.** A cross-session message from a
sender in a different permission class is not delivered — it opens a dialog the worker
never answers, so the instruction silently never arrives. Spawn workers in the same
class as whoever will be messaging them.

## Talking to it

```bash
claude agents --json          # fleet view: kind, state, status, id, sessionId, cwd
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
> ships regardless of the channel.

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
                         --dangerously-skip-permissions -- "<next instruction>" )
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
