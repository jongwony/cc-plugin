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

export type DiffData = {
  number: number
  title: string
  url: string
  baseRefName: string
  headRefName: string
  mergeBase: string
  headOid: string
  entries: Entry[]
  notes: string[]
  /** Reads one entry's patch. */
  readFile: (e: Entry) => Promise<{ file: FileDiff; isCut: boolean }>
}

const GIT = ['git', '--no-optional-locks']
const DIFF = ['diff', '--no-ext-diff', '--no-textconv', '--no-color', '--ignore-submodules=dirty', '--submodule=short', '-M']

export class StepError extends Error {
  constructor(step: string, detail: string) {
    super(`${step}: ${detail}`)
  }
}

/** A failed run's reason: its first `fatal:`/`error:` line, else its first line that is no warning or hint. */
function firstLine(r: RunResult): string {
  const lines = (r.stderr.trim() || r.stdout.trim()).split('\n').map(l => l.trim()).filter(l => l !== '')
  const text = lines.find(l => /^(?:fatal|error): /.test(l)) ?? lines.find(l => !/^(?:warning|hint):/i.test(l)) ?? lines[0]
  return text === undefined ? `exit ${r.exitCode}` : text
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
  if (r.exitCode !== 0) throw new StepError(step, firstLine(r))
  return r
}

function json<T>(step: string, text: string): T {
  try {
    return JSON.parse(text) as T
  } catch {
    throw new StepError(step, 'unreadable JSON from gh')
  }
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
 * Every fetch remote, in the order they are tried for the PR: those whose
 * URL names `repo` on `host`, then those naming `repo` elsewhere, then the
 * rest; origin first within each.
 */
export function candidates(remoteV: string, repo: string, host?: string): string[] {
  const want = repo.toLowerCase()
  const rank = (r: { name: string; repo?: string; host?: string }) =>
    (r.repo === want ? (host !== undefined && r.host === host.toLowerCase() ? 0 : 1) : 2) * 2 + (r.name === 'origin' ? 0 : 1)
  return remoteRepos(remoteV)
    .map((r, i) => ({ name: r.name, key: rank(r), i }))
    .sort((a, b) => a.key - b.key || a.i - b.i)
    .map(r => r.name)
}

/**
 * The environment a fetch runs under so neither git nor ssh asks on the
 * terminal: no credential prompt, and ssh in batch mode unless the user
 * names an ssh command of their own (GIT_SSH_COMMAND, GIT_SSH, core.sshCommand).
 */
export async function noPrompts(run: Run, git: string[], ownSsh = false): Promise<Record<string, string>> {
  const configured = !ownSsh && (await run([...git, 'config', '--get', 'core.sshCommand'])).exitCode === 0
  const env: Record<string, string> = { GIT_TERMINAL_PROMPT: '0' }
  if (!ownSsh && !configured) env.GIT_SSH_COMMAND = 'ssh -o BatchMode=yes'
  return env
}

export type Known = {
  /** GIT_SSH_COMMAND or GIT_SSH is set in the environment. */
  ownSsh?: boolean
}

export async function loadDiff(unguarded: Run, number: number, known: Known = {}): Promise<DiffData> {
  const run = guarded(unguarded)
  const [prOut, topOut] = await Promise.all([
    must(run, 'gh pr view', [
      'gh', 'pr', 'view', String(number), '--json', 'number,title,url,headRefName,headRefOid,baseRefName',
    ]),
    must(run, 'git rev-parse', [...GIT, 'rev-parse', '--show-toplevel']),
  ])
  const pr = json<{
    number: number
    title: string
    url: string
    headRefName: string
    headRefOid: string
    baseRefName: string
  }>('gh pr view', prOut.stdout)
  // The PR's own URL names its repository and host: https://<host>/<owner>/<repo>/pull/<n>.
  const repo = /^[a-z]+:\/\/[^/]+\/([^/]+\/[^/]+)\/pull\/\d+$/i.exec(pr.url)?.[1]
  if (!repo) throw new StepError('gh pr view', `unreadable PR URL ${JSON.stringify(pr.url)}`)
  const git = [...GIT, '-C', topOut.stdout.trim()]
  const remoteV = (await must(run, 'git remote', [...git, 'remote', '-v'])).stdout
  const tried = candidates(remoteV, repo, hostOfUrl(pr.url))
  if (tried.length === 0) throw new StepError('remote', 'this repository has no fetch remote')

  const env = await noPrompts(run, git, known.ownSsh)
  // Git commands from the listing on run under `env`.
  const quiet: Run = (argv, timeoutMs) => run(argv, timeoutMs, env)
  // The PR's remote is the first whose `refs/pull/<n>/head` is the head gh reports.
  const baseName = `refs/heads/${pr.baseRefName}`
  const headName = `refs/pull/${number}/head`
  const seen: string[] = []
  let found: { remote: string; baseOid?: string } | undefined
  for (const remote of tried) {
    const listed = await quiet([...git, 'ls-remote', '--', remote, baseName, headName], 120_000)
    const tip = (name: string) => listed.stdout.split('\n').find(l => l.endsWith(`\t${name}`))?.split('\t')[0]
    const head = listed.exitCode === 0 ? tip(headName) : undefined
    seen.push(`${remote} ${listed.exitCode !== 0 ? `failed: ${firstLine(listed)}` : head === undefined ? 'has none' : `has ${head.slice(0, 7)}`}`)
    if (head === pr.headRefOid) {
      found = { remote, baseOid: tip(baseName) }
      break
    }
  }
  if (!found) throw new StepError('remote', `gh reports PR #${number} at ${pr.headRefOid.slice(0, 7)}; ${headName} on ${seen.join(', ')}`)
  const { remote, baseOid } = found
  if (!baseOid) throw new StepError('git ls-remote', `${remote} has no branch ${pr.baseRefName}`)
  const headOid = pr.headRefOid
  // Both tips are fetched by id; no ref is written.
  await must(quiet, 'git fetch', [...git, 'fetch', '--quiet', '--no-write-fetch-head', '--no-recurse-submodules', '--no-auto-maintenance', '--', remote, baseOid, headOid], 120_000)
  const based = await quiet([...git, 'merge-base', baseOid, headOid])
  if (based.exitCode === 1 && based.stdout.trim() === '' && based.stderr.trim() === '') {
    const shallow = (await quiet([...git, 'rev-parse', '--is-shallow-repository'])).stdout.trim() === 'true'
    throw new StepError(
      'git merge-base',
      `returned no merge base for ${pr.baseRefName} and the PR head (exit 1)${shallow ? '; this is a shallow clone, where fetching more history (git fetch --unshallow) can supply one' : ''}`,
    )
  }
  if (based.exitCode !== 0) throw new StepError('git merge-base', firstLine(based))
  const mergeBase = based.stdout.trim()

  const notes: string[] = []
  if (mergeBase === headOid) notes.push(`the PR head is already in ${pr.baseRefName}: merged?`)
  const ends = [mergeBase, headOid]
  const inventory = await must(quiet, 'git diff', [...git, ...DIFF, '--raw', '--no-abbrev', '--numstat', '-z', ...ends], 120_000)
  const { entries, isWhole } = parseDiff(inventory.stdout)
  if (!isWhole || inventory.isStdoutTruncated) throw new StepError('git diff', 'file list over 4 MiB was cut')
  // An added or deleted file's missing side is the empty blob, stored if the repository lacks it.
  let empty: string | undefined
  const blank = async () => {
    empty ??= (await must(quiet, 'git hash-object', [...git, 'hash-object', '-w', '-t', 'blob', '/dev/null'])).stdout.trim()
    return empty
  }
  const readFile = async (e: Entry) => {
    if (!hasLines(e)) return { file: summaryOf(e), isCut: false }
    // Each side is `<rev>:<path>`: the path's attributes apply to the read.
    const old = e.status === 'A' ? await blank() : `${mergeBase}:${e.oldPath ?? e.path}`
    const now = e.status === 'D' ? await blank() : `${headOid}:${e.path}`
    const r = await must(quiet, 'git diff', [...git, ...DIFF, old, now], 120_000)
    return { file: fileFor(e, r.stdout, r.isStdoutTruncated), isCut: r.isStdoutTruncated }
  }

  return {
    number: pr.number,
    title: pr.title,
    url: pr.url,
    baseRefName: pr.baseRefName,
    headRefName: pr.headRefName,
    mergeBase,
    headOid,
    entries,
    notes,
    readFile,
  }
}
