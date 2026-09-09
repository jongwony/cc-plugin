# remote-tmux

A `claude remote-control` toolkit for reaching sessions from the Claude app (claude.ai/code +
mobile). The running session *is* the aperture — no bridge process in between. It ships one
skill, **`remote-spawn`**: spawn one worker session, script-free, and carry its lifecycle
(below).

## remote-spawn — spawn one session

No script. One command gives a session that is background-resident, worktree-isolated and
addressable by `SendMessage` from other sessions, and — on a launch that takes
`--remote-control` — reachable from the Claude app:

```bash
( cd ~/src/foo && claude --bg --worktree foo \
                         --remote-control "stint::foo-build" -n "stint::foo-build" \
                         --permission-mode auto -- "<brief>" )

claude agents --json     # fleet view (no TTY needed)
claude logs   <jobId>    # recent output
claude attach <jobId>    # open in this terminal
claude stop   <jobId>    # end the run — leaves the job
claude rm     <jobId>    # retire it: removes worktree and job state
```

Each flag is load-bearing: `--bg` detaches without a PTY, `--worktree` cuts a branch from
`origin/<default>`, `-n` pins a permanent name (otherwise it is regenerated every launch,
along with the peer ref other sessions address it by — so neither is safe to cache), and
`--remote-control` registers the app bridge. The worktree token and the session name are
separate on purpose — see the skill's naming section.

A **Stint** is independently managed bounded work carried in a spawned session's own
context, named `stint::<topic>`. Work whose result the current session receives and
integrates belongs to native subagents, using the context modes available in that harness.

The spawn completes at the **handshake**: the Stint ACKs its creator once, and the creator
checks the ACK's sender socket against the registry entry for the returned jobId. This
confirms launch identity. The Stint completes its work at the durable destination named
in its brief, with its output and verification; it owes no completion report to the creator.
The brief also identifies the sources of its decision authority and where to park decisions
it cannot make, or a source-authorized default. Independent work retains those limits.
Retiring the resident session is a separate lifecycle operation.

`--remote-control` is separable: what it buys is the app bridge alone. The messaging socket
comes from the backgrounded launch itself and the name from `-n`, so `SendMessage`, the fleet
row and the pinned name all survive without it — what goes is reachability from claude.ai/code
and the mobile app. Some launch paths have not carried it, and the shape of the command is no
verdict on whether a given one does, so read the session instead: `bridgeSessionId` in
`~/.claude/sessions/<pid>.json` is non-null exactly when the bridge registered. Test the value
and not the key — it can sit present and `null` on a session that never got one. The `<pid>` is
the `pid` field `claude agents --json` carries for that `<jobId>`. Going without is not
deferrable: the bridge is decided at launch, so a worker started without one stays
app-unreachable for the life of that run, and nothing attaches one mid-flight.

The two pieces of shell around the flags are load-bearing as well. The **`cd` is what selects
the project** — there is no flag for it, the session inherits the launching shell's directory,
and `--worktree` needs that directory inside a git repo; the subshell keeps the caller's own
cwd. The **`--` guards the brief** — without it a brief starting with a dash is swallowed with
no error and the worker comes up idle having been told nothing, and wherever `--remote-control`
is passed its optional name argument is a second way for a brief to disappear the same way.

A worker keeps its socket after finishing a turn and stays idle-resident, so follow-up
instructions reach it. Resuming is itself a launch — the flags are chosen again rather than
inherited, and a new sessionId is minted. The skill's Resuming section carries the command and
what the trade costs.

Two caveats worth knowing:
- **Permission classes must match**, which is why the command above passes `--permission-mode
  auto` rather than a bypass flag. A cross-session message from a different permission class is
  not delivered — it opens a dialog the worker never answers, so the instruction silently never
  arrives. From an auto-mode creator the bypass flag is not an option regardless:
  `--dangerously-skip-permissions` inside a spawn command is refused by auto mode's own
  classifier, denying the spawn before a worker exists. Pass whatever class the creator is
  actually in — the registry does not record it, but the creator's transcript does.
- `status: "waiting"` in the registry means an unanswered dialog exists, **not** that the
  session is stuck; it still takes app input and peer messages. Judge by how long
  `statusUpdatedAt` has been frozen.
