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
| The base | the tip of the PR's own `baseRefName` on the remote, read with `git ls-remote` and fetched by its id |
| The head | the tip of `refs/pull/<n>/head`, read and fetched the same way |
| The files | `git diff --raw --numstat <merge-base(base, head)> <head>`, read once: renames, binary files, type and mode changes listed |
| One file's lines | `git diff <old blob> <new blob>`, the two blob ids from the file's raw record (the empty blob for an added or deleted file), read when the file is opened; binary files, submodules and mode-only changes have none to read |

The fetch brings in objects only: no ref, branch, tag or `FETCH_HEAD` is
written. The remote used is the one whose URL path
names the repository `gh` resolved, whatever the host — an ssh alias or GitHub
Enterprise included (`origin` first).

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
pressing a file in the list opens it. Each drawing holds at most about 90,000
characters, the engine's limit on one drawing less some room: the list takes
up to 20,000 of them and the open file the rest, its lines cut at the pane's
width. What does not fit is counted, not dropped silently ("N more files", "N
more lines of this file are not drawn"). A single file's patch over 4 MiB is
read as far as it arrived, and the pane says so. Fetch, merge-base and `gh`
failures show in the pane.

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
