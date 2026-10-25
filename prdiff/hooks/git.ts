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

export type Run = (argv: string[], timeoutMs?: number, env?: Record<string, string>) => Promise<RunResult>

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

// The pins every git command here runs with.
const GIT = [
  'git', '--no-optional-locks',
  '-c', 'core.quotePath=false', '-c', 'diff.relative=false', '-c', 'color.ui=false',
  '-c', 'diff.suppressBlankEmpty=false', '-c', 'diff.noprefix=false', '-c', 'diff.mnemonicPrefix=false',
  '-c', 'diff.srcPrefix=a/', '-c', 'diff.dstPrefix=b/',
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

/** `run` with a `gh` command already in flight answered by that same run. */
export function sharing(run: Run): Run {
  const flying = new Map<string, Promise<RunResult>>()
  return (argv, timeoutMs, env) => {
    if (argv[0] !== 'gh' || env !== undefined) return run(argv, timeoutMs, env)
    const key = JSON.stringify(argv)
    const had = flying.get(key)
    if (had) return had
    const p = run(argv, timeoutMs).finally(() => flying.delete(key))
    flying.set(key, p)
    return p
  }
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
  const r = await guarded(run)(['gh', 'pr', 'view', '--json', 'number'])
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

export async function listPrs(unguarded: Run): Promise<PrList> {
  const run = guarded(unguarded)
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

/** The host a remote URL names, lowercased, in https, ssh or scp form. */
export function hostOfUrl(url: string): string | undefined {
  const u = url.trim()
  const m = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]*@)?([^/:]+)/i.exec(u) ?? /^(?:[^@/:]*@)?([^/:]+):/.exec(u)
  return m?.[1]?.toLowerCase()
}

/** Each fetch remote of `git remote -v` with the `owner/repo` and host its URL names. */
export function remoteRepos(remoteV: string): Array<{ name: string; repo: string; host?: string }> {
  const out: Array<{ name: string; repo: string; host?: string }> = []
  for (const line of remoteV.split('\n')) {
    // Also a partial clone's `(fetch) [blob:none]`.
    const m = /^(\S+)\s+(\S+)\s+\(fetch\)(?:\s+\[[^\]]*\])?$/.exec(line.trim())
    const repo = m?.[2] ? repoOfUrl(m[2]) : undefined
    if (m?.[1] && m[2] && repo) out.push({ name: m[1], repo, host: hostOfUrl(m[2]) })
  }
  return out
}

/**
 * The remote whose fetch URL is the repository `gh` resolved; on `host` when
 * a remote URL names that host, else on any; origin first.
 */
export function remoteFor(remoteV: string, repo: string, host?: string): string | undefined {
  const want = repo.toLowerCase()
  const all = remoteRepos(remoteV).filter(r => r.repo === want)
  const onHost = host === undefined ? [] : all.filter(r => r.host === host.toLowerCase())
  const names = (onHost.length > 0 ? onHost : all).map(r => r.name)
  return names.includes('origin') ? 'origin' : names[0]
}

/**
 * The remote for `repo` when no URL names it as written: a remote whose
 * `owner/repo` `gh` resolves to `repo`, as it does across a rename or transfer.
 */
async function renamedRemote(run: Run, remoteV: string, repo: string): Promise<string | undefined> {
  const want = repo.toLowerCase()
  const names: string[] = []
  for (const r of remoteRepos(remoteV)) {
    const v = await run(['gh', 'repo', 'view', r.repo, '--json', 'nameWithOwner'])
    if (v.exitCode !== 0) continue
    try {
      const got = (JSON.parse(v.stdout) as { nameWithOwner?: unknown }).nameWithOwner
      if (typeof got === 'string' && got.toLowerCase() === want) names.push(r.name)
    } catch {
      // Not this remote.
    }
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

/**
 * The environment a fetch runs under so neither git nor ssh asks on the
 * terminal: no credential prompt, and ssh in batch mode unless the user
 * names an ssh command of their own (GIT_SSH_COMMAND, GIT_SSH, core.sshCommand).
 */
export async function noPrompts(run: Run, git: string[], ownSshSet: boolean | Promise<boolean> = false): Promise<Record<string, string>> {
  const ownSsh = await ownSshSet
  const configured = !ownSsh && (await run([...git, 'config', '--get', 'core.sshCommand'])).exitCode === 0
  const env: Record<string, string> = { GIT_TERMINAL_PROMPT: '0' }
  if (!ownSsh && !configured) env.GIT_SSH_COMMAND = 'ssh -o BatchMode=yes'
  return env
}

export type Known = {
  /** The repository `gh` resolved, when the list already asked. */
  repo?: string
  /** GIT_SSH_COMMAND or GIT_SSH is set in the environment. */
  ownSsh?: boolean | Promise<boolean>
}

let loads = 0

export async function loadDiff(unguarded: Run, number: number, known: Known = {}): Promise<DiffData> {
  const run = guarded(unguarded)
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
  const remoteV = (await must(run, 'git remote', [...git, 'remote', '-v'])).stdout
  const remote = remoteFor(remoteV, repo, hostOfUrl(pr.url)) ?? (await renamedRemote(run, remoteV, repo))
  if (!remote) throw new StepError('remote', `no git remote points at ${repo}`)

  const mode = decideMode(current, number)
  loads += 1
  const scratch = `refs/prdiff/${number}/${loads}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
  const baseRef = `${scratch}/base`
  const headRef = `${scratch}/head`
  // Worktree mode fetches only the base; its head is local HEAD.
  const fetched = mode === 'worktree' ? [baseRef] : [baseRef, headRef]
  const specs = [`+refs/heads/${pr.baseRefName}:${baseRef}`, ...(mode === 'worktree' ? [] : [`+refs/pull/${number}/head:${headRef}`])]
  const env = await noPrompts(run, git, known.ownSsh)
  let baseOid: string
  let headOid: string
  const left: string[] = []
  try {
    const r = await run([...git, 'fetch', '--quiet', '--no-tags', '--no-write-fetch-head', '--refmap=', remote, ...specs], 120_000, env)
    if (r.exitCode !== 0) throw new StepError('git fetch', firstLine(r))
    const oid = async (ref: string) =>
      (await must(run, `git rev-parse ${ref}`, [...git, 'rev-parse', '--verify', '--quiet', `${ref}^{commit}`])).stdout.trim()
    ;[baseOid, headOid] = await Promise.all([oid(baseRef), mode === 'worktree' ? oid('HEAD') : oid(headRef)])
  } finally {
    const gone = await Promise.all(fetched.map(ref => run([...git, 'update-ref', '-d', ref])))
    gone.forEach((g, i) => {
      if (g.exitCode !== 0) left.push(fetched[i] ?? '')
    })
  }
  const based = await run([...git, 'merge-base', baseOid, headOid])
  if (based.exitCode === 1 && based.stdout.trim() === '' && based.stderr.trim() === '') {
    const shallow = (await run([...git, 'rev-parse', '--is-shallow-repository'])).stdout.trim() === 'true'
    throw new StepError(
      'git merge-base',
      `no common ancestor of ${pr.baseRefName} and the PR head${shallow ? ' in this shallow clone; fetch more history (git fetch --unshallow)' : ''}`,
    )
  }
  if (based.exitCode !== 0) throw new StepError('git merge-base', firstLine(based))
  const mergeBase = based.stdout.trim()

  const notes: string[] = []
  if (left.length > 0) notes.push(`scratch refs not deleted: ${left.join(' ')}`)
  if (mode === 'committed' && mergeBase === headOid) notes.push(`the PR head is already in ${pr.baseRefName}: merged?`)
  if (mode === 'worktree') {
    notes.push('includes uncommitted changes of this checkout')
    if (headOid !== pr.headRefOid) notes.push(`local HEAD ${headOid.slice(0, 7)} differs from the PR head ${pr.headRefOid.slice(0, 7)}`)
  }
  // Worktree mode: the merge-base against the working tree.
  const ends = mode === 'worktree' ? [mergeBase] : [mergeBase, headOid]
  const [numstatOut, whole] = await Promise.all([
    must(run, 'git diff --numstat', [...git, ...DIFF, '--numstat', '-z', ...ends], 120_000),
    run([...git, ...DIFF, '-p', ...ends], 120_000),
  ])
  const numstat = parseNumstat(numstatOut.stdout)
  if (whole.exitCode !== 0) throw new StepError('git diff', firstLine(whole))
  const files: FileDiff[] = !whole.isStdoutTruncated
    ? mergeDiff(numstat, whole.stdout)
    : (
        await mapLimit(numstat, CONCURRENCY, async n => {
          const paths = n.oldPath !== undefined ? [n.oldPath, n.path] : [n.path]
          const one = await run([...git, '--literal-pathspecs', ...DIFF, '-p', ...ends, '--', ...paths])
          const [f] = mergeDiff([n], one.exitCode === 0 && !one.isStdoutTruncated ? one.stdout : '')
          if (f && (one.exitCode !== 0 || one.isStdoutTruncated)) {
            f.hunks = []
            f.notes = [one.isStdoutTruncated ? 'patch over 4 MiB: not drawn' : `git diff failed: ${firstLine(one)}`]
          }
          return f
        })
      ).filter((f): f is FileDiff => f !== undefined)

  if (mode === 'worktree') {
    const ls = await run([...git, 'ls-files', '--others', '--exclude-standard', '-z'])
    if (ls.exitCode !== 0) throw new StepError('git ls-files', firstLine(ls))
    // A list cut at 4 MiB keeps only its whole names.
    const named = ls.stdout.split('\0')
    const others = (ls.isStdoutTruncated ? named.slice(0, -1) : named).filter(p => p !== '')
    const read = await mapLimit(others.slice(0, MAX_UNTRACKED), CONCURRENCY, async p => {
      // Exit 1 is a patch when it wrote one and no `error:`/`fatal:` line.
      const r = await run([...git, '-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false',
        'diff', '--no-index', '--no-color', '--no-ext-diff', '--no-textconv', '--', '/dev/null', p])
      const failed = /^(?:error|fatal): /m.test(r.stderr)
      const ok = !r.isStdoutTruncated && (r.exitCode === 0 || (r.exitCode === 1 && r.stdout !== '' && !failed))
      return untrackedFile(p, ok ? r.stdout : undefined, ok ? undefined : 'content not read')
    })
    files.push(...read)
    if (others.length > MAX_UNTRACKED) notes.push(`${others.length - MAX_UNTRACKED}${ls.isStdoutTruncated ? '+' : ''} more untracked files not listed`)
    else if (ls.isStdoutTruncated) notes.push('more untracked files not listed: their list is over 4 MiB')
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
