# global-hooks

choi's global Claude Code hooks, carried as one plugin. Every global hook lives
here from now on, so one install brings all of them to an environment — the Mac,
another Mac, or a Linux cloud session — and one switch turns them on or off
together. A hook kept in `~/.claude/settings.json` reaches only the machine it
is written on.

## Hooks

| Hook | Event | What it does |
| --- | --- | --- |
| `kill-blast-radius` | `PreToolUse` (`Bash`) | An auxiliary warning: asks before a process kill whose observed matches exceed 10 processes |

### kill-blast-radius

An auxiliary warning, not a guarantee. Before a Bash command runs, the hook reads
it with a small shell lexer — quotes, `$(...)` and backticks, redirections,
heredocs, newlines — and looks only at words the shell would run as commands:
`pkill`/`killall`, also behind `sudo`, `env`, `timeout`, `xargs`, `nohup` and
inside `bash|sh|zsh -c`, `eval` and `$(...)`; and `kill` fed by `pgrep`
(`pgrep … | xargs kill`, `pgrep … | while read p; do kill $p; done`,
`kill $(pgrep …)`). Text that is not run — an `echo` argument, a quoted string,
a heredoc that `cat` reads — is not measured.

For each kill it re-runs the selection as `pgrep -l`: the selection options
(`-P`, `-U`, `-u`, `-G`, `-g`, `-t`, `-F`, …) and the patterns in their order,
with a leading signal and `-I` dropped, so macOS argument quirks are observed as
they would select (`pkill -f "cat" -n`, where `-n` becomes a second pattern).
It counts the union of the PIDs it observed across the whole command. When that
union holds more than 10 processes, the hook returns `ask` with the count and a
sample of the matched processes.

What it does not cover — the normal permission flow applies:

- a command it cannot measure: a pattern or command from a variable, a kill fed
  by any other pipeline (`ps | grep | awk | xargs kill`, `pgrep … | head`), a
  remote `ssh` command, a syntax it cannot lex;
- processes that start or exit between its observation and the kill: the count
  is what it saw just before the command ran;
- Claude Code outside macOS. The observation is calibrated to macOS `pgrep`, and
  a Linux cloud session runs in a sandbox.

Requires `python3` on `PATH`; the hook uses the standard library only.

Tests (the mocked cases run anywhere; the cases against real processes run on macOS):

```bash
python3 global-hooks/tests/kill-blast-radius.test.py
```

## Install, turn on and off

The marketplace's install-all script (`scripts/install.sh`) installs this
plugin, and the cloud setup script runs that installer. To install it alone:

```bash
claude plugin marketplace add jongwony/cc-plugin
claude plugin install global-hooks@cc-plugin
```

Turn every hook in it off or on:

```bash
claude plugin disable global-hooks@cc-plugin
claude plugin enable global-hooks@cc-plugin
```

Then `/reload-plugins` in a running session.

## Adding a hook

Put the script under `hooks/`, register it in `hooks/hooks.json` with its path
under `${CLAUDE_PLUGIN_ROOT}`, add a row above, and bump `version` in
`.claude-plugin/plugin.json`.
