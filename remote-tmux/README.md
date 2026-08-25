# remote-tmux

A `claude remote-control` toolkit for reaching sessions from the Claude app (claude.ai/code +
mobile). The running session *is* the aperture — no bridge process in between. It ships two
skills:

- **`remote-spawn`** — spawn one worker session, script-free (below).
- **`rc-pool`** — keep a self-restarting `--spawn worktree --capacity N` pool host alive per
  project (see the `rc-pool` section at the end).

## remote-spawn — spawn one session

No script. One command gives a session that is background-resident, worktree-isolated and
addressable by `SendMessage` from other sessions, and — on a launch that takes
`--remote-control` — reachable from the Claude app:

```bash
( cd ~/src/foo && claude --bg --worktree foo \
                         --remote-control "stint::foo::build" -n "stint::foo::build" \
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
  arrives. From an auto-mode supervisor the bypass flag is not an option regardless:
  `--dangerously-skip-permissions` inside a spawn command is refused by auto mode's own
  classifier, denying the spawn before a worker exists. Pass whatever class the supervisor is
  actually in — the registry does not record it, but the supervisor's transcript does.
- `status: "waiting"` in the registry means an unanswered dialog exists, **not** that the
  session is stuck; it still takes app input and peer messages. Judge by how long
  `statusUpdatedAt` has been frozen.

## rc-pool — keep a pool host alive

The `rc-pool` skill keeps a **self-restarting, project-singleton** keep-alive for a `claude
remote-control --spawn worktree --capacity N` pool host — one host per project, hosting a
pool of on-demand, worktree-isolated sessions in the app.

```bash
bash scripts/rc-pool.sh toggle <project-dir> [name] [capacity]   # up if down, down if up
bash scripts/rc-pool.sh up     <project-dir> [name] [capacity]   # default capacity 5
bash scripts/rc-pool.sh down   <name|dir>                        # graceful SIGTERM + drop
bash scripts/rc-pool.sh status <name|dir>
```

This one keeps its tmux pane, for two reasons a backgrounded session cannot cover: the host is
an interactive TUI that needs a live PTY, and nothing else restarts it when it crashes. It also
remains the only way to originate a session **without a CLI** — that is what makes it the
phone's entry point.

The `remote-control` subcommand hard-errors on an untrusted workspace, so trust the project once
(`claude` in the dir, accept the dialog) before `up`.

Work that a supervisor must direct — anything it has to send instructions to after launch — is
spawned by that supervisor via `remote-spawn`, not opened through the pool.
