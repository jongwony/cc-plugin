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
                             --permission-mode auto -- "<brief + reporting contract>" )
```

It prints `backgrounded · <jobId> · <name>`. Report that back. The four flags are
independent and each earns its place: `--bg` detaches without a PTY, `--worktree`
cuts a branch `worktree-<unit>` from `origin/<default>`, `--remote-control` registers
the app bridge, `-n` pins a permanent name (without it the name is regenerated every
launch). Drop `--worktree` to run in the project directory itself.

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
follow-up instructions still reach it.

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
- No auto-restart by design — nothing revives a crashed worker (see the `rc-pool` skill for
  the keep-alive case).
- An already-running session cannot become addressable later; the socket is decided once at
  launch, so an old session must be restarted to join.
