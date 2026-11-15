# global-hooks

choi's global Claude Code hooks, carried as one plugin. Every global hook lives
here from now on, so one install brings all of them to an environment — the Mac,
another Mac, or a Linux cloud session — and one switch turns them on or off
together. A hook kept in `~/.claude/settings.json` reaches only the machine it
is written on.

## Hooks

| Hook | Event | What it does |
| --- | --- | --- |
| `kill-blast-radius` | `PreToolUse` (`Bash`) | Asks before a process kill that would signal more than 10 processes |

### kill-blast-radius

Before a Bash command runs, the hook finds every `pkill`/`killall` in it —
after `for`/`do`, `timeout`, `xargs`, `env`, inside `bash|sh|zsh -c` — and every
`kill` fed by `pgrep` (`pgrep … | xargs kill`, `kill $(pgrep …)`). It measures
each one's match set with `pgrep` and the same arguments, so macOS argument
quirks are measured as they would run (`pkill -f "cat" -n`, where `-n` becomes a
second pattern). When a match set holds more than 10 processes, the hook returns
`ask` with the count and a sample of the matched processes.

It makes no decision, and the normal permission flow applies, when:

- the command cannot be measured — a pattern from a variable, a remote `ssh`
  command, a PID list built by `awk`;
- Claude Code runs outside macOS. The measurement is calibrated to macOS
  `pgrep`, and a Linux cloud session runs in a sandbox.

Requires `python3` on `PATH`; the hook uses the standard library only.

Tests (macOS runs every case; elsewhere only the non-macOS path):

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
