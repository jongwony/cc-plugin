# claude-sessions

Work that belongs in a Claude session other than the one you are in. This plugin decides
**which contract** the work is under and **what wakes it**, then writes the brief. It
implements no monitoring of its own — every wake mechanism it routes to already exists.

It replaces two plugins: `claude-plus` (consult and delegated execution through a CLI
wrapper) and `remote-tmux` (the `/remote-spawn` skill for independent Stints). They were
split on whether the caller waits, which turned out to be the wrong seam.

## The seam that actually divides the work

One question sorts everything:

> Can the calling session discharge its responsibility **without receiving the completed
> work**?

**Caller-integrated** — the answer is *no*.

- Satisfied when the result comes back, gets checked, and gets used here.
- This session must receive it.
- Its shapes: a consult, a delegated execution run.

**Independent** — the answer is *yes*.

- Satisfied when output and verification land at the brief's durable destination.
- Nobody in particular must receive it; the creator is not a required recipient.
- Its shapes: a Stint, a monitor.

Waiting is a consequence, not the definition. A Stint's creator does wait — for one launch
acknowledgement that confirms the worker's identity. That acknowledgement is not the work
coming back, so the work is still independent.

## Three ways a session wakes up

Independent work needs something to start it. Exactly one of these:

```
  an external event  ──▶  RemoteTrigger: a webhook trigger attached to a routine
  a time or interval ──▶  a routine's cron expression, or a single future moment
  its own rounds     ──▶  a Stint that drives itself to its completion condition
```

The ordering matters. Where an event source exists, use it; reach for the clock only when
nothing emits an event for the thing being watched. A recurrence is **one** routine with a
schedule — not a series of single-moment routines standing in for an interval, which is how
a hand-rolled poller accumulates.

Pull requests are the pre-built case: `/autofix-pr` finds the open pull request on the
current branch, spawns a cloud session on it, and subscribes that session to the pull
request. One caveat it prints and you must read — a pull request has a single webhook
recipient, so if something is already watching, the session it just spawned receives
nothing and should be retired rather than left resident.

## Every brief names an observable completion condition

The condition is an event someone else can check: a pull request closing, a job exiting, a
file appearing at a named path, a check turning green. A completion condition only a person
can judge is the one to refuse and rewrite, because work with no checkable end is work whose
record never closes.

## The Codex boundary

What divides the boundary is tool versus shell. The tools belong to Claude Code alone:
`ListAgents`, `SendMessage`, and `RemoteTrigger`. Everything reached by a CLI command — the
spawn line, `--remote-control`, `claude agents --json`, `logs`, `attach`, `stop`, `rm`,
`claude --cloud`, and reading the session registry — is shell, and Codex reaches all of it.

That puts the three wake mechanisms on two sides. A session that drives its own rounds needs
only a session to run, and `claude --cloud` creates or re-attaches one from any shell, so
Codex reaches the self-round wake. The event and clock wakes are created by `RemoteTrigger`,
and no CLI subcommand creates a routine, a schedule, or a webhook — so from Codex those route
through a Claude session holding the tool, rather than through a CLI equivalent that does not
exist.

So a Codex-driven launch is fire-and-forget: the handshake clause leaves the brief, because the
creator is not an addressable peer, and a check on the launch stands in its place. Which check
depends on the route — `claude agents --json` lists local sessions, so it confirms a background
spawn but never sees a cloud one, which is confirmed by opening the claude.ai/code link it
prints instead. App reachability survives either way, since `--remote-control` is a CLI flag
rather than a tool.

One line that does not move: a session's messaging socket at `/tmp/cc-socks/<pid>.sock` is
never opened directly. It accepts any connection from the same user and then says nothing,
waiting for a client that knows an unpublished framing — and the session registry advertises a
negotiated protocol version while publishing no negotiator for anything that is not Claude
Code. Building against it buys a coupling that goes stale without a failure signal.

## Pieces

```
claude-sessions/
├── .claude-plugin/plugin.json          Claude Code manifest
├── .codex-plugin/plugin.json           Codex manifest
├── README.md                           this file
├── scripts/
│   ├── claude-run.sh                   the wrapper every caller-integrated run goes through
│   └── claude-run-extract.py           pulls the answer and the verdict out of a run
└── skills/claude-sessions/
    ├── SKILL.md                        the operative surface
    └── references/
        ├── harness.md                  what the harness was observed to do, and on what evidence
        ├── resume.md                   continuing, forking, and failed resumes
        └── verdict.md                  the four conditions behind the wrapper's exit status
```

## Checking it works

```bash
# the wrapper is reachable and self-describes
./scripts/claude-run.sh -h

# the CLI surfaces the skill depends on
claude agents --json
command -v claude && command -v gh
```

A caller-integrated run passes when `claude-run.sh` exits zero; anything else means the run
fell short of an established success, and `run.json`'s `verdict_reasons` says how. A created
session or a written output file is not completion.
