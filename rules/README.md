# rules

choi's portable Claude Code rules: the ones that hold on any machine and carry no private identifiers. Rules that only hold on choi's machine, or that carry private identifiers, stay in the local `~/.claude/rules/` and are not published.

| Where Claude runs | How these rules arrive |
|---|---|
| Claude Code on choi's machine | `~/.claude/rules/<file>.md` is a symlink to this directory in the cc-plugin marketplace clone (`~/.claude/plugins/marketplaces/cc-plugin/rules/`) |
| Claude Code cloud session | the cloud environment's setup script runs `scripts/install-rules.sh`, which writes these files into `~/.claude/CLAUDE.md` |
| claude.ai chat | pasted by hand into the profile instructions (code-workflow rules left out) |

Cloud environment setup script:

```bash
curl -fsSL https://raw.githubusercontent.com/jongwony/cc-plugin/main/scripts/install-rules.sh | bash
```

Pin a version with `CC_RULES_REF=<sha-or-tag>` before `bash`. Confirm the result in the session with `/context`.

Local symlinks (once, after this directory is on `main` and the marketplace clone is updated):

```bash
for f in ~/.claude/plugins/marketplaces/cc-plugin/rules/*.md; do
  [ "$(basename "$f")" = README.md ] || ln -sf "$f" ~/.claude/rules/
done
```

Cowork sessions on the desktop skip a symlinked rule file that points outside the working directory.
