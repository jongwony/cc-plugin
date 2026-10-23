// Resolving a PR to a local cumulative diff: merge-base(base, head)...head,
// base being the PR's own baseRefName. Every host command goes through the
// injected `run`, so tests answer it without a repository.

import { mergeDiff, parseNumstat, untrackedFile, type FileDiff } from './parse.ts'

export type RunResult = {
  exitCode: number
  stdout: string
  stderr: string
  isStdoutTruncated: boolean
}

export type Run = (argv: string[], timeoutMs?: number) => Promise<RunResult>

export type PrSummary = {
  number: number
  title: string
  headRefName: string
  baseRefName: string
  author: string
  isDraft: boolean
}

export type PrList = {
  repo: string
  current?: number
  items: PrSummary[]
}

export type Mode = 'worktree' | 'committed'

export type DiffData = {
  number: number
  title: string
  url: string
  baseRefName: string
  headRefName: string
  mode: Mode
  mergeBase: string
  headOid: string
  files: FileDiff[]
  notes: string[]
}

/** Untracked files read into a worktree diff, at most. */
export const MAX_UNTRACKED = 200

/** Per-file patch reads (over-4-MiB fallback, untracked files) in flight at once. */
export const CONCURRENCY = 8

// Pinned so a user's diff settings cannot change the patch format parse.ts reads.
const GIT = [
  'git', '--no-optional-locks',
  '-c', 'core.quotePath=false', '-c', 'diff.relative=false', '-c', 'color.ui=false',
  '-c', 'diff.suppressBlankEmpty=false', '-c', 'diff.noprefix=false', '-c', 'diff.mnemonicPrefix=false',
]
const DIFF = ['diff', '--no-ext-diff', '--no-textconv', '--no-color', '--ignore-submodules=dirty', '--submodule=short', '-M']

export class StepError extends Error {
  constructor(step: string, detail: string) {
    super(`${step}: ${detail}`)
  }
}

function firstLine(r: RunResult): string {
  const text = (r.stderr.trim() || r.stdout.trim()).split('\n')[0] ?? ''
  return text === '' ? `exit ${r.exitCode}` : text
}

/** `fn` over `items` with at most `limit` in flight; results in input order. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next
      next += 1
      out[i] = await fn(items[i] as T)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

async function must(run: Run, step: string, argv: string[], timeoutMs?: number): Promise<RunResult> {
  const r = await run(argv, timeoutMs)
  if (r.exitCode !== 0) throw new StepError(step, firstLine(r))
  if (r.isStdoutTruncated) throw new StepError(step, 'output over 4 MiB was cut')
  return r
}

function json<T>(step: string, text: string): T {
  try {
    return JSON.parse(text) as T
  } catch {
    throw new StepError(step, 'unreadable JSON from gh')
  }
}

/** The PR `gh` associates with the current checkout, if any. */
export async function currentPr(run: Run): Promise<number | undefined> {
  const r = await run(['gh', 'pr', 'view', '--json', 'number'])
  if (r.exitCode !== 0) return undefined
  try {
    const n = (JSON.parse(r.stdout) as { number?: unknown }).number
    return typeof n === 'number' ? n : undefined
  } catch {
    return undefined
  }
}

async function repoOf(run: Run): Promise<string> {
  return json<{ nameWithOwner: string }>(
    'gh repo view',
    (await must(run, 'gh repo view', ['gh', 'repo', 'view', '--json', 'nameWithOwner'])).stdout,
  ).nameWithOwner
}

export async function listPrs(run: Run): Promise<PrList> {
  const [repo, listed, current] = await Promise.all([
    repoOf(run),
    must(run, 'gh pr list', [
      'gh', 'pr', 'list', '--limit', '100',
      '--json', 'number,title,headRefName,baseRefName,author,isDraft',
    ]),
    currentPr(run),
  ])
  const raw = json<Array<Omit<PrSummary, 'author'> & { author?: { login?: string } }>>('gh pr list', listed.stdout)
  const items = raw.map(p => ({
    number: p.number,
    title: p.title,
    headRefName: p.headRefName,
    baseRefName: p.baseRefName,
    author: p.author?.login ?? '',
    isDraft: p.isDraft === true,
  }))
  return { repo, current, items }
}

/**
 * Working-tree changes belong to the diff only when `gh` itself says the
 * current checkout is this PR; a matching branch name alone is not identity.
 */
export function decideMode(current: number | undefined, number: number): Mode {
  return current === number ? 'worktree' : 'committed'
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

/** The remote whose fetch URL is the repository `gh` resolved; origin first. */
export function remoteFor(remoteV: string, repo: string): string | undefined {
  const want = repo.toLowerCase()
  const names: string[] = []
  for (const line of remoteV.split('\n')) {
    const m = /^(\S+)\s+(\S+)\s+\(fetch\)$/.exec(line.trim())
    if (m && m[1] && m[2] && repoOfUrl(m[2]) === want) names.push(m[1])
  }
  return names.includes('origin') ? 'origin' : names[0]
}

/**
 * A base branch name usable in a refspec: one git itself accepts as a branch
 * name and prints back unchanged (`@{-1}` and the like expand, so they fail),
 * never one that reads as an option.
 */
export async function isSafeRef(run: Run, name: string): Promise<boolean> {
  if (name === '' || name.startsWith('-') || name.includes('@{') || name.includes(':')) return false
  const r = await run([...GIT, 'check-ref-format', '--branch', name])
  return r.exitCode === 0 && r.stdout.trim() === name
}

export type Known = {
  /** The repository `gh` resolved, when the list already asked. */
  repo?: string
}

let loads = 0

export async function loadDiff(run: Run, number: number, known: Known = {}): Promise<DiffData> {
  const [prOut, topOut, repo, current] = await Promise.all([
    must(run, 'gh pr view', [
      'gh', 'pr', 'view', String(number), '--json', 'number,title,url,headRefName,headRefOid,baseRefName',
    ]),
    must(run, 'git rev-parse', [...GIT, 'rev-parse', '--show-toplevel']),
    known.repo !== undefined ? Promise.resolve(known.repo) : repoOf(run),
    currentPr(run),
  ])
  const pr = json<{
    number: number
    title: string
    url: string
    headRefName: string
    headRefOid: string
    baseRefName: string
  }>('gh pr view', prOut.stdout)
  if (!(await isSafeRef(run, pr.baseRefName))) {
    throw new StepError('base', `unusable base branch name ${JSON.stringify(pr.baseRefName)}`)
  }

  const git = [...GIT, '-C', topOut.stdout.trim()]
  const remote = remoteFor((await must(run, 'git remote', [...git, 'remote', '-v'])).stdout, repo)
  if (!remote) throw new StepError('remote', `no git remote points at ${repo}`)

  const mode = decideMode(current, number)
  // Each load fetches into refs of its own and deletes them once their commit
  // ids are read, so concurrent loads of one PR never delete each other's.
  loads += 1
  const scratch = `refs/prdiff/${number}/${loads}`
  const baseRef = `${scratch}/base`
  const headRef = `${scratch}/head`
  let baseOid: string
  let headOid: string
  try {
    await must(
      run,
      'git fetch',
      [...git, 'fetch', '--quiet', '--no-tags', '--no-write-fetch-head', remote,
        `+refs/heads/${pr.baseRefName}:${baseRef}`, `+refs/pull/${number}/head:${headRef}`],
      120_000,
    )
    const oid = async (ref: string) =>
      (await must(run, `git rev-parse ${ref}`, [...git, 'rev-parse', '--verify', '--quiet', `${ref}^{commit}`])).stdout.trim()
    ;[baseOid, headOid] = await Promise.all([oid(baseRef), mode === 'worktree' ? oid('HEAD') : oid(headRef)])
  } finally {
    await Promise.all([baseRef, headRef].map(ref => run([...git, 'update-ref', '-d', ref])))
  }
  const mergeBase = (await must(run, 'git merge-base', [...git, 'merge-base', baseOid, headOid])).stdout.trim()

  const notes: string[] = []
  if (mode === 'worktree') {
    notes.push('includes uncommitted changes of this checkout')
    if (headOid !== pr.headRefOid) notes.push(`local HEAD ${headOid.slice(0, 7)} differs from the PR head ${pr.headRefOid.slice(0, 7)}`)
  }
  // Worktree mode diffs the merge-base against the working tree (no second
  // endpoint), so the inventory and the hunks both include uncommitted edits.
  const ends = mode === 'worktree' ? [mergeBase] : [mergeBase, headOid]
  const [numstatOut, whole] = await Promise.all([
    must(run, 'git diff --numstat', [...git, ...DIFF, '--numstat', '-z', ...ends]),
    run([...git, ...DIFF, '-p', ...ends]),
  ])
  const numstat = parseNumstat(numstatOut.stdout)
  if (whole.exitCode !== 0) throw new StepError('git diff', firstLine(whole))
  const files: FileDiff[] = !whole.isStdoutTruncated
    ? mergeDiff(numstat, whole.stdout)
    : (
        await mapLimit(numstat, CONCURRENCY, async n => {
          const paths = n.oldPath !== undefined ? [n.oldPath, n.path] : [n.path]
          const one = await run([...git, ...DIFF, '-p', ...ends, '--', ...paths])
          const [f] = mergeDiff([n], one.exitCode === 0 && !one.isStdoutTruncated ? one.stdout : '')
          if (f && (one.exitCode !== 0 || one.isStdoutTruncated)) {
            f.hunks = []
            f.notes = [one.isStdoutTruncated ? 'patch over 4 MiB: not drawn' : `git diff failed: ${firstLine(one)}`]
          }
          return f
        })
      ).filter((f): f is FileDiff => f !== undefined)

  if (mode === 'worktree') {
    const others = (await must(run, 'git ls-files', [...git, 'ls-files', '--others', '--exclude-standard', '-z'])).stdout
      .split('\0')
      .filter(p => p !== '')
    const read = await mapLimit(others.slice(0, MAX_UNTRACKED), CONCURRENCY, async p => {
      // --no-index exits 1 when the files differ, which is the expected case.
      const r = await run([...git, 'diff', '--no-index', '--no-color', '--no-ext-diff', '--', '/dev/null', p])
      const ok = (r.exitCode === 0 || r.exitCode === 1) && !r.isStdoutTruncated
      return untrackedFile(p, ok ? r.stdout : undefined, ok ? undefined : 'content not read')
    })
    files.push(...read)
    if (others.length > MAX_UNTRACKED) notes.push(`${others.length - MAX_UNTRACKED} more untracked files not listed`)
  }

  return {
    number: pr.number,
    title: pr.title,
    url: pr.url,
    baseRefName: pr.baseRefName,
    headRefName: pr.headRefName,
    mode,
    mergeBase,
    headOid,
    files,
    notes,
  }
}
