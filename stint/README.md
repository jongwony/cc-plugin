# stint

A **Stint** is independently managed bounded work, carried by a session other than the one
you are in. This plugin decides **whether work belongs in such a session at all** and **what
wakes it**, then writes the brief. It implements no monitoring of its own — every wake
mechanism it routes to already exists.

It replaces `remote-tmux` (the `/remote-spawn` skill) and absorbs what survived of
`claude-plus`, whose CLI wrapper is gone: a run whose result the caller must collect is a
prompt you write and run yourself, not a mode of this plugin.

## The one question

> Can the calling session discharge its responsibility **without receiving the completed
> work**?

**Yes → a Stint or a monitor**, which is what this plugin is for. Output and verification land
at the brief's durable destination; nobody in particular must receive them, and the creator is
not a required recipient.

**No → it stays where it is.** A result this session must collect and check is a native
subagent when it belongs in the same context, and otherwise a prompt run against a CLI.
`skills/stint/references/prompting.md` carries what such a prompt owes and what establishes
that it succeeded. A consult is one of these.

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

`/autofix-pr` is not one of the three wakes. It is a command a person types directly, or
wires to pull-request creation, and this plugin does not dispatch it. It touches this plugin
through one fact: it holds a pull request's single webhook recipient, so before adding an
event watch on a pull request, check that nothing already watches it — whether a webhook
routine coexists with that watch has not been tested.

## Every brief names an observable completion condition

The condition is an event someone else can check: a pull request closing, a job exiting, a
file appearing at a named path, a check turning green. A completion condition only a person
can judge is the one to refuse and rewrite, because work with no checkable end is work whose
record never closes.

The same holds at the other end. A routine fired on a schedule outlives the work it carries,
and it cannot retire itself — `RemoteTrigger` is disabled inside every session a routine
fires. So whoever creates a recurrence names the person who will end it and hands them the
trigger id.

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
stint/
├── .claude-plugin/plugin.json          Claude Code manifest
├── .codex-plugin/plugin.json           Codex manifest
├── README.md                           this file
└── skills/stint/
    ├── SKILL.md                        the operative surface
    └── references/
        ├── codex.md                    what changes when Codex is on either end
        ├── harness.md                  what the harness was observed to do, and on what evidence
        └── prompting.md                a prompt whose result the caller collects
```

## Checking it works

```bash
# the CLI surfaces the skill depends on
claude agents --json
command -v claude
```

A spawn is confirmed when the row `claude agents --json` holds under the returned jobId is
live and carries the expected name, and the worker's ACK arrives from that row's socket. A
created session is not a confirmed one, and an ACK is not the work coming back.
