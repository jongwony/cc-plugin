# prdiff

A Claude Code mod that adds a pane for one pull request's **cumulative** diff:
everything the PR changes from the point where it left its own base branch,
drawn as one scrollable stream of files, like GitHub's "Files changed" tab.

The built-in `/diff` shows this session's edits, the uncommitted changes, or
the branch against the repository's default branch. It cannot pick a PR, and it
never uses a PR's real base, which matters for stacked PRs whose base is another
PR's branch. prdiff does both.

## What it shows

| Step | Where it comes from |
| --- | --- |
| The PR list | `gh pr list` for the repository `gh` resolves in the session's directory; `●` marks the PR `gh pr view` associates with the current checkout |
| The base | the tip of the PR's own `baseRefName` on the remote, read with `git ls-remote` and fetched by its id |
| The head | the tip of `refs/pull/<n>/head`, read and fetched the same way |
| The diff | `git diff <merge-base(base, head)> <head>`, with renames, binary files and mode-only changes listed |
| Uncommitted work | only when `gh` says the current checkout *is* that PR: the merge-base is diffed against the working tree, with untracked files added (mode `worktree`); otherwise mode `committed` |

The fetch brings in objects only: no ref, branch, tag or `FETCH_HEAD` is
written. The remote used is the one whose URL path
names the repository `gh` resolved, whatever the host — an ssh alias or GitHub
Enterprise included (`origin` first).

## Use

```
/prdiff        open the pane on the PR list
/prdiff 123    open the pane straight on PR #123
```

The pane takes the keyboard after `ctrl+x tab` or a click.

| Key | In the list | In a diff |
| --- | --- | --- |
| `1`–`9` | open that PR | |
| `r` | refresh the list | reload the PR |
| `j` / `k` | | next / previous file |
| `d` / `u` | | half a page down / up |
| `b` | | back to the list |
| `Home` / `End` | | top / end of the stream |
| `↑` / `↓` | | a row up / down |
| `PgUp` / `PgDn` | | a page up / down |
| wheel | scroll | scroll the stream |

The top of a diff lists every file; pressing one jumps to it. A file over 3,000
lines is cut and says how many lines were left out. When the patch passes 4 MiB,
the files whose patch arrived whole are kept and only the rest are read again
one by one; a single file over 4 MiB is listed without its lines. Fetch, merge-base and `gh` failures show in the pane.

## Requirements

- Claude Code with function hooks (mods).
- `git` 2.29 or newer on `PATH` (`git fetch --no-write-fetch-head` arrived
  in 2.29). Install it from <https://git-scm.com/downloads>, or with a package
  manager (`brew install git`, `apt install git`).
- The GitHub CLI `gh` 2.0 or newer on `PATH`, signed in (`gh auth login`).
  Install it from <https://cli.github.com> (`brew install gh`, or the
  packages listed there).

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
