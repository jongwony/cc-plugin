# remote-tmux

A `claude remote-control` toolkit reachable from the Claude app (claude.ai/code + mobile).
No Telegram, no bridge — the running session *is* the aperture; voice input comes from the
app's own dictation. It ships two skills:

- **`remote-spawn`** — spawn one worker session, script-free (below).
- **`rc-pool`** — keep a self-restarting `--spawn worktree --capacity N` pool host alive per
  project (see the `rc-pool` section at the end).

## remote-spawn — spawn one session

No script. One command gives a session that is background-resident, worktree-isolated,
app-reachable, and addressable by `SendMessage` from other sessions:

```bash
( cd ~/src/foo && claude --bg --worktree foo \
                         --remote-control stint::foo::build -n stint::foo::build \
                         --permission-mode auto -- "<brief>" )

claude agents --json     # fleet view (no TTY needed)
claude logs   <jobId>    # recent output
claude attach <jobId>    # open in this terminal
claude stop   <jobId>    # end the run — leaves the job
claude rm     <jobId>    # retire it: removes worktree and job state
```

Each flag is load-bearing: `--bg` detaches without a PTY, `--worktree` cuts a branch from
`origin/<default>`, `--remote-control` registers the app bridge, `-n` pins a permanent name
(otherwise it is regenerated every launch, along with the peer ref other sessions address it
by — so neither is safe to cache). The worktree token and the session name are separate on
purpose — see the skill's naming section.

The two pieces of shell around them are load-bearing as well. The **`cd` is what selects the
project** — there is no flag for it, the session inherits the launching shell's directory, and
`--worktree` needs that directory inside a git repo; the subshell keeps the caller's own cwd.
The **`--` guards the brief** — without it a brief starting with a dash, or one sitting where
`--remote-control`'s optional name argument can take it, is swallowed with no error and the
worker comes up idle having been told nothing.

A worker keeps its socket after finishing a turn and stays idle-resident, so follow-up
instructions reach it. Resume with `( cd <its-cwd> && claude --bg --remote-control <name> -n
<name> --resume <sessionId> … -- "<next>" )` — keep `--remote-control`, or the resumed worker
loses its app bridge for good. Context carries over but a new sessionId is minted; `jobId` is
that id's first 8 hex characters.

## Why the script went away

Everything the old `rc-spawn.sh` wrapped is native: worktree creation, naming, background
lifetime, app reachability, listing, attach, logs, stop. Two capabilities the wrapper never
had come with it — `claude rm` actually retires the worktree lease, and a backgrounded
session is addressable by `SendMessage`, so a supervisor can direct it instead of only
launching it. A tmux pane could do neither.

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

This one keeps its tmux pane, for two reasons a backgrounded session cannot cover: the host
is an interactive TUI that needs a live PTY, and nothing else restarts it when it crashes.
(TCC is *not* one of those reasons — a `--bg` session forks from the invoking shell and
inherits its grant just as the tmux server does. The grant only goes missing under launchd,
which is what the original comparison was about.) It also remains the only way to originate
a session **without a CLI** — that is what makes it the phone's entry point.

The host re-execs this script from disk each cycle (on-disk edits take effect on restart).
The `remote-control` subcommand hard-errors on an untrusted workspace, so trust the project
once (`claude` in the dir, accept the dialog) before `up`.

Its children are `sdk-cli` sessions with no messaging socket: they can send but cannot
receive a task or a reply. Work that a supervisor must direct is spawned by that supervisor
via `remote-spawn`, not opened through the pool.
