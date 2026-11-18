# coordinator-rules

Puts choi's rules (`rules/` and `cloud-rules/`, as `scripts/install-rules.manifest` lists them) into a Claude Code session that has none installed, through a SessionStart hook.

## Why

Claude Code loads every file in `<config>/rules/` at session start. The Mac links those files, and a cloud environment that runs `scripts/cloud-setup.sh` writes them (see `scripts/install-rules.md`). A project coordinator runs outside any cloud environment, so no setup script reaches it, and a cloud thread whose environment has no setup script starts without the rules too. Both still get the plugins synced from the claude.ai account. This plugin is how the rules reach them.

## How

- `rules`, `cloud-rules` and `install-rules.manifest` in this directory are symlinks to the repository's own, so the manifest stays the one list and nothing is copied.
- `scripts/session-rules.mjs` runs at every context epoch (startup, resume, clear, compact), so the rules come back after compaction.
- Where any manifest file name already exists in `<config>/rules/`, the hook emits nothing: the Mac and cloud-setup environments are unaffected.
- The host caps each injected string at 10,000 characters, and one hook command hands back one string, so `hooks/hooks.json` registers the script once per part: `1/4` is part 1 of 4. The rules fill three parts today; the fourth is headroom and emits nothing until they grow. The last entry names any file that did not fit.
- If the synced copy lost the symlinks, the first entry says in one line that no rules were loaded.

Requires Node.js on `PATH`.

## Install

In Claude Code:

```
/plugin install coordinator-rules --marketplace jongwony/cc-plugin
```

For a coordinator, upload the plugin to the claude.ai account instead, so it syncs to every session, including project coordinators. A coordinator that is already running should pick it up once its container syncs plugins again and a SessionStart fires (resume or compact); when that sync happens has not been verified.

To check a session, look for the plugin under `<config>/plugins/synced/` and confirm that `rules/preferences.md` there is a real file, not a missing link.
