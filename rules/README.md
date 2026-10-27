# rules

choi's portable Claude Code rules: the ones that hold on any machine and carry no private identifiers, plus `cloud.md`, which only cloud sessions load. Rules that only hold on choi's machine, or that carry private identifiers, stay in the local `~/.claude/rules/` and are not published.

| Where Claude runs | How these rules arrive |
|---|---|
| Claude Code on choi's machine | `~/.claude/rules/<file>.md` is a symlink into choi's working clone (`~/github/jongwony/cc-plugin/rules/`). The Mac follows that clone's checked-out branch (`main`) and changes when `git pull` runs there. `cloud.md` is not linked |
| Claude Code cloud session | the cloud environment's setup script runs `scripts/install-rules.sh`, which writes these files, `cloud.md` included, into `~/.claude/CLAUDE.md` |
| claude.ai chat | pasted by hand into the profile instructions (code-workflow rules left out) |

Cloud environment setup script:

```bash
curl -fsSL https://raw.githubusercontent.com/jongwony/cc-plugin/main/scripts/install-rules.sh | bash
```

Adding a rule file: list it in `rules/manifest`. Pin a version with `CC_RULES_REF=<sha-or-tag>` before `bash`. Confirm the result in the session with `/context`.

Local symlinks, one per `rules/manifest` entry except `cloud.md` (once, after this directory is on `main` and `git -C ~/github/jongwony/cc-plugin pull` has run), then commit the switch in `~/.claude`:

```bash
src=~/github/jongwony/cc-plugin/rules
sed -e 's/#.*//' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' "$src/manifest" | grep -v '^$' |
while IFS= read -r n; do
  case $n in cloud.md) continue ;; esac
  ln -sf "$src/$n" ~/.claude/rules/ && git -C ~/.claude add "rules/$n"
done
git -C ~/.claude commit -m "rules: link the portable rules to the cc-plugin clone"
```

Editing one of these rules: change it in cc-plugin through a branch and PR, not through the symlink.
