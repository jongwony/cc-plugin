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
claude --bg --worktree <unit> --remote-control <unit> -n <unit> \
       --dangerously-skip-permissions "<brief + reporting contract>"
```

It prints `backgrounded · <jobId> · <name>`. Report that back. The four flags are
independent and each earns its place: `--bg` detaches without a PTY, `--worktree`
cuts a branch `worktree-<unit>` from `origin/<default>`, `--remote-control` registers
the app bridge, `-n` pins a permanent name (without it the name is regenerated every
launch). Drop `--worktree` to run in the current directory.

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
**Resolve the address at send time**: a bare name is rejected, so send the exact
`name [ref]` string `ListAgents` just printed. Never cache it — when the target
restarts, both its ref and its auto-derived name change.

A worker keeps its socket after finishing a turn: it goes idle and resident, so
follow-up instructions still reach it.

## Reporting contract — put it in the initial prompt

A spawned session never reads this file. Carry the contract in the brief itself:

> You are a worker supervised by `<supervisor-name>`. To report: call `ListAgents`
> first, read the exact `name [ref]` string for your supervisor, and use that string
> as `to` in `SendMessage` — a bare name is rejected. Send (a) an ACK on start,
> (b) your state whenever you are blocked on a decision you cannot make alone, and
> (c) a completion report. Do not wait for a reply — durable output (PR, parked task)
> ships regardless of the channel.

## Observing

`claude agents --json` covers most needs. The registry at `~/.claude/sessions/<pid>.json`
carries more — `waitingFor`, `state`, `detail`, `tempo`, `entrypoint`, `statusUpdatedAt`.

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
claude --bg --resume <sessionId> -n <name> --dangerously-skip-permissions "<next instruction>"
```

Prior context carries over intact, but a **new sessionId is minted** — resume the newest
one next time. `jobId` is the first 8 hex characters of `sessionId`, so the two views join
without a separate key.

Notes to pass on when relevant:
- No auto-restart by design — nothing revives a crashed worker (see the `rc-pool` skill for
  the keep-alive case).
- An already-running session cannot become addressable later; the socket is decided once at
  launch, so an old session must be restarted to join.
