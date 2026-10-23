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

const GIT = ['git', '--no-optional-locks', '-c', 'core.quotePath=false', '-c', 'diff.relative=false', '-c', 'color.ui=false']
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

export async function listPrs(run: Run): Promise<PrList> {
  const repo = json<{ nameWithOwner: string }>(
    'gh repo view',
    (await must(run, 'gh repo view', ['gh', 'repo', 'view', '--json', 'nameWithOwner'])).stdout,
  ).nameWithOwner
  const raw = json<Array<Omit<PrSummary, 'author'> & { author?: { login?: string } }>>(
    'gh pr list',
    (
      await must(run, 'gh pr list', [
        'gh', 'pr', 'list', '--limit', '100',
        '--json', 'number,title,headRefName,baseRefName,author,isDraft',
      ])
    ).stdout,
  )
  const items = raw.map(p => ({
    number: p.number,
    title: p.title,
    headRefName: p.headRefName,
    baseRefName: p.baseRefName,
    author: p.author?.login ?? '',
    isDraft: p.isDraft === true,
  }))
  return { repo, current: await currentPr(run), items }
}

/**
 * Working-tree changes belong to the diff only when `gh` itself says the
 * current checkout is this PR; a matching branch name alone is not identity
 * (forks reuse names, a branch can be renamed, HEAD can be detached).
 */
export function decideMode(current: number | undefined, number: number): Mode {
  return current === number ? 'worktree' : 'committed'
}

/** `owner/repo` from a GitHub remote URL in https, ssh or scp form. */
export function repoOfUrl(url: string): string | undefined {
  const m = /github\.com[:/]+([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i.exec(url.trim())
  return m ? `${m[1]}/${m[2]}`.toLowerCase() : undefined
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

export function isSafeRef(name: string): boolean {
  return /^[A-Za-z0-9._/-]+$/.test(name) && !name.includes('..') && !name.startsWith('-') && !name.endsWith('.lock')
}

export async function loadDiff(run: Run, number: number): Promise<DiffData> {
  const pr = json<{
    number: number
    title: string
    url: string
    headRefName: string
    headRefOid: string
    baseRefName: string
  }>(
    'gh pr view',
    (
      await must(run, 'gh pr view', [
        'gh', 'pr', 'view', String(number), '--json', 'number,title,url,headRefName,headRefOid,baseRefName',
      ])
    ).stdout,
  )
  if (!isSafeRef(pr.baseRefName)) throw new StepError('base', `unusable base branch name ${JSON.stringify(pr.baseRefName)}`)

  const top = (await must(run, 'git rev-parse', [...GIT, 'rev-parse', '--show-toplevel'])).stdout.trim()
  const git = [...GIT, '-C', top]
  const repo = json<{ nameWithOwner: string }>(
    'gh repo view',
    (await must(run, 'gh repo view', ['gh', 'repo', 'view', '--json', 'nameWithOwner'])).stdout,
  ).nameWithOwner
  const remote = remoteFor((await must(run, 'git remote', [...git, 'remote', '-v'])).stdout, repo)
  if (!remote) throw new StepError('remote', `no git remote points at ${repo}`)

  const mode = decideMode(await currentPr(run), number)
  const baseRef = `refs/prdiff/${number}/base`
  const headRef = `refs/prdiff/${number}/head`
  await must(
    run,
    'git fetch',
    [...git, 'fetch', '--quiet', '--no-tags', '--no-write-fetch-head', remote,
      `+refs/heads/${pr.baseRefName}:${baseRef}`, `+refs/pull/${number}/head:${headRef}`],
    120_000,
  )
  const oid = async (ref: string) =>
    (await must(run, `git rev-parse ${ref}`, [...git, 'rev-parse', '--verify', '--quiet', `${ref}^{commit}`])).stdout.trim()
  const baseOid = await oid(baseRef)
  const fetchedHead = await oid(headRef)
  const headOid = mode === 'worktree' ? await oid('HEAD') : fetchedHead
  const mergeBase = (await must(run, 'git merge-base', [...git, 'merge-base', baseOid, headOid])).stdout.trim()

  const notes: string[] = []
  if (mode === 'worktree') {
    notes.push('includes uncommitted changes of this checkout')
    if (headOid !== pr.headRefOid) notes.push(`local HEAD ${headOid.slice(0, 7)} differs from the PR head ${pr.headRefOid.slice(0, 7)}`)
  }
  // Worktree mode diffs the merge-base against the working tree (no second
  // endpoint), so the inventory and the hunks both include uncommitted edits.
  const ends = mode === 'worktree' ? [mergeBase] : [mergeBase, headOid]
  const numstat = parseNumstat((await must(run, 'git diff --numstat', [...git, ...DIFF, '--numstat', '-z', ...ends])).stdout)
  let files: FileDiff[]
  const whole = await run([...git, ...DIFF, '-p', ...ends])
  if (whole.exitCode !== 0) throw new StepError('git diff', firstLine(whole))
  if (!whole.isStdoutTruncated) files = mergeDiff(numstat, whole.stdout)
  else {
    files = []
    for (const n of numstat) {
      const paths = n.oldPath !== undefined ? [n.oldPath, n.path] : [n.path]
      const one = await run([...git, ...DIFF, '-p', ...ends, '--', ...paths])
      const [f] = mergeDiff([n], one.exitCode === 0 && !one.isStdoutTruncated ? one.stdout : '')
      if (f && (one.exitCode !== 0 || one.isStdoutTruncated)) {
        f.hunks = []
        f.notes = [one.isStdoutTruncated ? 'patch over 4 MiB: not drawn' : `git diff failed: ${firstLine(one)}`]
      }
      if (f) files.push(f)
    }
  }

  if (mode === 'worktree') {
    const others = (await must(run, 'git ls-files', [...git, 'ls-files', '--others', '--exclude-standard', '-z'])).stdout
      .split('\0')
      .filter(p => p !== '')
    for (const p of others.slice(0, MAX_UNTRACKED)) {
      // --no-index exits 1 when the files differ, which is the expected case.
      const r = await run([...git, 'diff', '--no-index', '--no-color', '--no-ext-diff', '--', '/dev/null', p])
      const ok = (r.exitCode === 0 || r.exitCode === 1) && !r.isStdoutTruncated
      files.push(untrackedFile(p, ok ? r.stdout : undefined, ok ? undefined : 'content not read'))
    }
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
