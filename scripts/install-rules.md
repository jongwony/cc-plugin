# rules

choi's portable Claude Code rules: the ones that hold on any machine and carry no private identifiers. `rules/` holds only those, so every file in it loads wherever it is installed. `cloud-rules/` holds the rules that only cloud sessions load. Rules that only hold on choi's machine, or that carry private identifiers, stay in the local rules directory and are not published.

`<config>` below is the Claude configuration directory: `$CLAUDE_CONFIG_DIR` when it is set, otherwise `~/.claude`. Claude Code loads every rule in `<config>/rules/` at session start.

| Where Claude runs | How these rules arrive |
|---|---|
| Claude Code on choi's machine | `<config>/rules/<file>.md` is a symlink into choi's working clone (`~/github/jongwony/cc-plugin/rules/`). The Mac follows that clone's checked-out branch (`main`) and changes when `git pull` runs there |
| Claude Code cloud session | the cloud environment's setup script, `scripts/cloud-setup.sh`, runs `scripts/install-rules.sh`, which writes the files in `rules/` and `cloud-rules/` into `<config>/rules/` |
| claude.ai chat | pasted by hand into the profile instructions (code-workflow rules left out) |

Cloud environment setup script:

```bash
curl -fsSL https://raw.githubusercontent.com/jongwony/cc-plugin/main/scripts/cloud-setup.sh | bash
```

A failed rules install stops the setup, so the session does not start. To pin the rules to a version, run `scripts/install-rules.sh` on its own with `CC_RULES_REF=<sha-or-tag>` before `bash`. Confirm the result in the session with `/context`.

Adding a rule file: put it in `rules/`, or in `cloud-rules/` for cloud sessions only, and list its path in `scripts/install-rules.manifest`, the one list both the Mac links and the cloud installer read. On the Mac, run the link loop below again.

Local symlinks, one per `rules/` entry in the manifest (after `git -C ~/github/jongwony/cc-plugin pull` has run on `main`), then commit the switch in the config directory:

```bash
repo=~/github/jongwony/cc-plugin
dst="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
sed -e 's/#.*//' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' "$repo/scripts/install-rules.manifest" | grep '^rules/' |
while IFS= read -r p; do
  ln -sf "$repo/$p" "$dst/rules/" && git -C "$dst" add "rules/${p##*/}"
done
git -C "$dst" commit -m "rules: link the portable rules to the cc-plugin clone"
```

Editing one of these rules: change it in cc-plugin through a branch and PR, not through the symlink.
