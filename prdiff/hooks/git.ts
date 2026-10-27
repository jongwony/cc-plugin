// Resolving a PR to a local cumulative diff: merge-base(base, head)...head,
// base being the PR's own baseRefName. Every host command goes through the
// injected `run`.

import { fileFor, hasLines, parseDiff, summaryOf, type Entry, type FileDiff } from './parse.ts'

export type RunResult = {
  exitCode: number
  stdout: string
  stderr: string
  isStdoutTruncated: boolean
}

export type Run = (argv: string[], timeoutMs?: number, env?: Record<string, string>) => Promise<RunResult>

/** One entry's patch as read, and whether it was cut at 4 MiB. */
export type FileRead = { file: FileDiff; isCut: boolean }

export type DiffData = {
  number: number
  title: string
  baseRefName: string
  headRefName: string
  mergeBase: string
  headOid: string
  entries: Entry[]
  /** Reads one entry's patch. */
  readFile: (e: Entry) => Promise<FileRead>
}

const GIT = ['git', '--no-optional-locks']
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
const DIFF = ['diff', '--no-ext-diff', '--no-textconv', '--no-color', '--ignore-submodules=dirty', '--submodule=short', '-M']

export class StepError extends Error {
  constructor(step: string, detail: string) {
    super(`${step}: ${detail}`)
  }
}

/** A failed run's reason: its lines that are no warning or hint, through the first `fatal:`/`error:` line, joined. */
function reason(r: RunResult): string {
  const lines = (r.stderr.trim() || r.stdout.trim()).split('\n').map(l => l.trim()).filter(l => l !== '' && !/^(?:warning|hint):/i.test(l))
  const end = lines.findIndex(l => /^(?:fatal|error): /.test(l))
  const text = (end < 0 ? lines : lines.slice(0, end + 1)).join(' ')
  return text === '' ? `exit ${r.exitCode}` : text
}

/** `run` with a rejection (a timeout, a command that cannot start) answered as a failed run whose stderr is the reason. */
export function guarded(run: Run): Run {
  return async (argv, timeoutMs, env) => {
    try {
      return await run(argv, timeoutMs, env)
    } catch (err) {
      return { exitCode: -1, stdout: '', stderr: err instanceof Error ? err.message : String(err), isStdoutTruncated: false }
    }
  }
}

/** `argv` run, or a StepError naming `step` when it fails; a caller that needs all of stdout checks isStdoutTruncated. */
async function must(run: Run, step: string, argv: string[], timeoutMs?: number): Promise<RunResult> {
  const r = await run(argv, timeoutMs)
  if (r.exitCode !== 0) throw new StepError(step, reason(r))
  return r
}

/**
 * `owner/repo`, lowercased, from a remote URL in https, ssh or scp form: the
 * path's last two segments, whatever the host (an ssh alias, GHE, port 443).
 */
export function repoOfUrl(url: string): string | undefined {
  const u = url.trim()
  const path = /^[a-z][a-z0-9+.-]*:\/\//i.test(u)
    ? u.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '')
    : /^[^/]*:/.test(u)
      ? u.slice(u.indexOf(':') + 1)
      : undefined
  if (path === undefined) return undefined
  const segs = path.replace(/\/+$/, '').replace(/\.git$/i, '').split('/').filter(s => s !== '')
  const [owner, repo] = segs.slice(-2)
  return segs.length >= 2 && owner && repo ? `${owner}/${repo}`.toLowerCase() : undefined
}

/** The host a remote URL names, lowercased, in https, ssh or scp form. */
export function hostOfUrl(url: string): string | undefined {
  const u = url.trim()
  const m = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]*@)?([^/:]+)/i.exec(u) ?? /^(?:[^@/:]*@)?([^/:]+):/.exec(u)
  return m?.[1]?.toLowerCase()
}

/** Each fetch remote of `git remote -v`, with the `owner/repo` and host its URL names when it names one. */
export function remoteRepos(remoteV: string): Array<{ name: string; repo?: string; host?: string }> {
  const out: Array<{ name: string; repo?: string; host?: string }> = []
  for (const line of remoteV.split('\n')) {
    // `<name>\t<url> (fetch)`, a partial clone's with ` [blob:none]` after it; a name or a URL may hold spaces.
    const m = /^([^\t]+)\t(.+) \(fetch\)(?: \[[^\]]*\])?$/.exec(line)
    if (m?.[1] && m[2]) out.push({ name: m[1], repo: repoOfUrl(m[2]), host: hostOfUrl(m[2]) })
  }
  return out
}

/**
 * Every fetch remote, in the groups and order they are tried for the PR:
 * first those whose URL names `repo` (on `host`, then elsewhere), then the
 * rest; origin first within each. An empty group is left out.
 */
export function candidates(remoteV: string, repo: string, host?: string): string[][] {
  const want = repo.toLowerCase()
  const rank = (r: { name: string; repo?: string; host?: string }) =>
    (r.repo === want ? (host !== undefined && r.host === host.toLowerCase() ? 0 : 1) : 2) * 2 + (r.name === 'origin' ? 0 : 1)
  const ranked = remoteRepos(remoteV)
    .map((r, i) => ({ name: r.name, key: rank(r), i }))
    .sort((a, b) => a.key - b.key || a.i - b.i)
  return [ranked.filter(r => r.key < 4), ranked.filter(r => r.key >= 4)].map(g => g.map(r => r.name)).filter(g => g.length > 0)
}

export async function loadDiff(unguarded: Run, number: number): Promise<DiffData> {
  const run = guarded(unguarded)
  const [prOut, topOut] = await Promise.all([
    must(run, 'gh pr view', [
      'gh', 'pr', 'view', String(number), '--json', 'number,title,url,headRefName,headRefOid,baseRefName,baseRefOid',
    ]),
    must(run, 'git rev-parse', [...GIT, 'rev-parse', '--show-toplevel']),
  ])
  const pr = JSON.parse(prOut.stdout) as {
    number: number
    title: string
    url: string
    headRefName: string
    headRefOid: string
    baseRefName: string
    baseRefOid: string
  }
  // The PR's own URL names its repository and host: https://<host>/<owner>/<repo>/pull/<n>.
  const repo = /^[a-z]+:\/\/[^/]+\/([^/]+\/[^/]+)\/pull\/\d+$/i.exec(pr.url)?.[1] ?? ''
  const git = [...GIT, '-C', topOut.stdout.replace(/\n$/, '')]
  const remoteV = (await must(run, 'git remote', [...git, 'remote', '-v'])).stdout
  const tried = candidates(remoteV, repo, hostOfUrl(pr.url))
  if (tried.length === 0) throw new StepError('remote', 'this repository has no fetch remote')

  // Git commands from the listing on never prompt: a missing credential fails with git's own message.
  const quiet: Run = (argv, timeoutMs) => run(argv, timeoutMs, { GIT_TERMINAL_PROMPT: '0' })
  // The PR's remote is the first whose `refs/pull/<n>/head` is the head gh reports.
  const headName = `refs/pull/${number}/head`
  // Each remote is asked for that one ref by name, so only it is advertised; a dry run writes no ref.
  const probe = async (remote: string) => {
    const listed = await quiet([...git, 'fetch', '--dry-run', '--porcelain', '--verbose', '--no-write-fetch-head', '--no-tags', '--no-recurse-submodules', '--no-auto-maintenance',
      '--', remote, `+${headName}:refs/prdiff/head`], 120_000)
    // A porcelain line is a one-character flag, a space, then `<old> <new> <local ref>`; --verbose prints an unchanged ref too.
    const fields = listed.stdout.split('\n').map(l => l.slice(2).split(' ')).find(f => f[2] === 'refs/prdiff/head')
    const head = listed.exitCode === 0 ? fields?.[1] : undefined
    const said = head === undefined ? `failed: ${reason(listed)}` : `has ${head.slice(0, 7)} at ${headName}`
    return { remote, head, said: `${remote} ${said}` }
  }
  const seen: string[] = []
  let found: Awaited<ReturnType<typeof probe>> | undefined
  // A group is asked only when no earlier group matched; its remotes at once, each answer awaited in rank order.
  for (const group of tried) {
    for (const asked of group.map(probe)) {
      const p = await asked
      seen.push(p.said)
      if (p.head === pr.headRefOid) {
        found = p
        break
      }
    }
    if (found) break
  }
  if (!found) throw new StepError('remote', `gh reports PR #${number} at ${pr.headRefOid.slice(0, 7)}; ${seen.join(', ')}`)
  const { remote } = found
  // The base is gh's: the commit GitHub diffs the PR against, kept after the base branch moves on or is deleted.
  const baseOid = pr.baseRefOid
  const headOid = pr.headRefOid
  // Both are fetched by id; no ref is written.
  await must(quiet, 'git fetch', [...git, 'fetch', '--quiet', '--no-write-fetch-head', '--no-tags', '--no-recurse-submodules', '--no-auto-maintenance', '--', remote, baseOid, headOid], 120_000)
  const based = await must(quiet, 'git merge-base', [...git, 'merge-base', baseOid, headOid])
  const mergeBase = based.stdout.trim()

  const ends = [mergeBase, headOid]
  // `.gitattributes` comes from the PR head, not the checkout.
  const atHead = [...git, `--attr-source=${headOid}`]
  const inventory = await must(quiet, 'git diff', [...atHead, ...DIFF, '--raw', '--no-abbrev', '--numstat', '-z', ...ends], 120_000)
  const { entries, isWhole } = parseDiff(inventory.stdout)
  if (!isWhole || inventory.isStdoutTruncated) throw new StepError('git diff', 'file list over 4 MiB was cut')
  const readFile = async (e: Entry) => {
    if (!hasLines(e)) return { file: summaryOf(e), isCut: false }
    // A file on both sides is read as its `<rev>:<path>` pair; an added or deleted one as its one tree
    // against git's built-in empty tree at its literal path. The path's attributes, from the PR head, apply.
    const sides =
      e.status === 'A' ? ['--literal-pathspecs', ...DIFF, EMPTY_TREE, headOid, '--', e.path]
      : e.status === 'D' ? ['--literal-pathspecs', ...DIFF, mergeBase, EMPTY_TREE, '--', e.path]
      : [...DIFF, `${mergeBase}:${e.oldPath ?? e.path}`, `${headOid}:${e.path}`]
    const r = await must(quiet, 'git diff', [...atHead, ...sides], 120_000)
    return { file: fileFor(e, r.stdout, r.isStdoutTruncated), isCut: r.isStdoutTruncated }
  }

  return {
    number: pr.number,
    title: pr.title,
    baseRefName: pr.baseRefName,
    headRefName: pr.headRefName,
    mergeBase,
    headOid,
    entries,
    readFile,
  }
}
