# prdiff

A Claude Code mod that adds a pane for one pull request's **cumulative** diff:
everything the PR changes from the point where it left its own base branch,
as GitHub holds it, one file at a time.

The built-in `/diff` shows this session's edits, the uncommitted changes, or
the branch against the repository's default branch. It cannot pick a PR, and it
never uses a PR's real base, which matters for stacked PRs whose base is another
PR's branch. prdiff does both, and only that: it never reads the working tree,
so uncommitted work stays `/diff`'s.

## What it shows

| Step | Where it comes from |
| --- | --- |
| The PR | `gh pr view <n>` for the repository `gh` resolves in the session's directory |
| The base | the commit `gh` reports as the PR's base (`baseRefOid`), the one GitHub's own diff of the PR is taken from, fetched by its id. It holds after the base branch moves on, is deleted, or takes the PR in a merge commit |
| The head | the tip of `refs/pull/<n>/head`, asked for by name with `git fetch --dry-run --porcelain` (so the remote advertises only that ref, and no ref is written), then fetched by its id |
| The files | `git diff --raw --numstat <merge-base(base, head)> <head>`, read once: renames, binary files, type and mode changes listed |
| One file's lines | `git diff <merge-base>:<old path> <head>:<path>`, each side named by revision and path; an added file is `git diff <empty tree> <head> -- <path>` and a deleted one `git diff <merge-base> <empty tree> -- <path>`, the path taken literally (`--literal-pathspecs`) and the empty tree git's built-in one, so nothing is written. Read when the file is opened; binary files, submodules and mode-only changes have none to read. Naming the path keeps `.gitattributes` in force; both diffs read it from the PR head (`--attr-source`), as GitHub does, not from the checkout |

The fetch brings in objects only: no ref, branch, tag or `FETCH_HEAD` is
written, and it starts no automatic maintenance (`gc --auto`). The PR's
remote is the first one whose `refs/pull/<n>/head` is the head `gh` reports
for the PR. The remotes whose URL names the PR's repository are asked
first, all at once, and the first in their order with that head is taken (on
the PR's host, then elsewhere; `origin` first). Only when none of them has it
are the rest asked the same way, so a remote still on a renamed repository's
old URL is found too, and an unrelated remote is not contacted while a
matching one has the head. If none has it, the pane says what each one had.

## Use

```
/prdiff 123    open the pane on PR #123
```

The pane takes the keyboard after `ctrl+x tab` or a click.

| Key | |
| --- | --- |
| `j` / `k` | next / previous file |
| `r` | reload the PR |
| wheel, arrows, `PgUp` / `PgDn`, `Home` / `End` | scroll the pane |

`j` and `k` are drawn while the PR has files to move through, `r` once a PR
has been asked for.

The pane shows the PR, the open file and then the list of every file;
pressing a file in the list opens it, and the pane scrolls back to its top.
A load that has files opens its first one. Picking the file already open
(`j` on the last file and `k` on the first included) changes nothing unless
its read failed; then it is opened again and read again, like any other pick.

Each drawing holds at most 100,000 characters of text, the engine's limit on
one drawing. The engine counts the text of string children, Code sources,
Button labels and a Box's `key`; it does not count props such as a Code's
`path`, nor a Button's `key`. The pane draws no Box with a key, and every
string it draws is charged against that limit: each line is cut at the
pane's width, and while the open file is drawn, what the list costs, up to
20,000 characters, stays for it. What does not fit is counted, not dropped silently ("N more
files", "N more lines of this file are not drawn"). A single file's patch
over 4 MiB is read as far as it arrived, and the pane says so. Fetch,
merge-base and `gh` failures show in the pane as the load's; a file's read
error shows under that file.

## Requirements

- Claude Code with function hooks (mods).
- `git` 2.41 or newer on `PATH` (`fetch --porcelain`, which prints the tips a
  remote has, arrived in 2.41; `--attr-source`, which reads `.gitattributes`
  from the PR head, in 2.40). Install it from <https://git-scm.com/downloads>, or with a package
  manager (`brew install git`, `apt install git`).
- The GitHub CLI `gh` 2.63.0 or newer on `PATH`, signed in (`gh auth login`);
  `pr view --json baseRefOid` arrived in 2.63.0.
  Install it from <https://cli.github.com> (`brew install gh`, or the
  packages listed there).

## Domain

prdiff works under these preconditions. Outside them it does not try to
recover; it shows what happened.

| Precondition | What a violation looks like |
| --- | --- |
| git 2.41 or newer | Each remote fails with git's own "unknown option" line for `--porcelain`, shown in the load's error. |
| gh 2.63.0 or newer | The load fails with gh's own `Unknown JSON field: "baseRefOid"` and the fields that version has. |
| git authentication needs no prompt: a credential helper for https, an agent or a key without a passphrase for ssh | https fails with git's "terminal prompts disabled". A remote whose ssh waits on a prompt holds the load until its 120-second timeout, since remotes ranked below it are not taken before it answers; it then counts as failed with the timeout as its reason, and the next remote that has the head is used. |
| The clone holds the history between the PR's base and head (it is not shallow there) | "git merge-base: exit 1". |
| The PR's pull ref is current: `refs/pull/<n>/head` on the remote is the head `gh` reports | "gh reports PR #n at X; origin has Y at refs/pull/n/head". Right after a push GitHub can lag by a few seconds; press `r` again. |
| File paths are UTF-8 | A file whose path is not shows git's error for that path when it is opened. |
| The PR's file list is under 4 MiB | "git diff: file list over 4 MiB was cut". |
| No hot reload of the mod while the pane is in use | After a reload during a load the pane keeps showing "Loading #N…" until `r`. |

## Try it from this folder

```bash
claude --plugin-dir ./prdiff
```

## Install

```bash
claude plugin marketplace add jongwony/cc-plugin
claude plugin install prdiff@cc-plugin
```

## Develop

```bash
claude plugin validate ./prdiff
claude plugin test ./prdiff
```
