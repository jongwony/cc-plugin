import { expect, test } from 'claude-code/testing'
import { listPrs, loadDiff, mapLimit, remoteFor, repoOfUrl, type Run, type RunResult } from '../hooks/git.ts'

const ok = (stdout: string): RunResult => ({ exitCode: 0, stdout, stderr: '', isStdoutTruncated: false })
const fail = (stderr: string): RunResult => ({ exitCode: 1, stdout: '', stderr, isStdoutTruncated: false })

const PR = { number: 7, title: 'Stacked', url: 'https://github.com/o/r/pull/7', headRefName: 'feat/b', headRefOid: 'h'.repeat(40), baseRefName: 'feat/a' }
const PATCH = 'diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b\n'

/** The `--raw --numstat -z` records of modified `paths`, as git writes them ahead of the patch. */
const inv = (paths: string[]) =>
  paths.map(p => `:100644 100644 1111111 2222222 M\0${p}\0`).join('') + paths.map(p => `1\t1\t${p}\0`).join('') + '\0'

/** A repository that answers by the command's shape; records every argv. */
function fakeRepo(current: number | undefined, overrides: Record<string, RunResult> = {}) {
  const calls: string[][] = []
  const run: Run = async argv => {
    calls.push(argv)
    const s = argv.join(' ')
    for (const [k, v] of Object.entries(overrides)) if (s.includes(k)) return v
    if (s === 'gh pr view --json number') return current === undefined ? fail('no pull requests found') : ok(JSON.stringify({ number: current }))
    if (s.startsWith('gh pr view 7')) return ok(JSON.stringify(PR))
    if (s.startsWith('gh repo view')) return ok(JSON.stringify({ nameWithOwner: 'O/R' }))
    if (s.includes('rev-parse --show-toplevel')) return ok('/repo\n')
    if (s.includes('remote -v')) return ok('fork\tgit@github.com:me/r.git (fetch)\norigin\thttps://github.com/o/r.git (fetch)\n')
    if (s.includes(' ls-remote ')) {
      return ok(argv.slice(argv.indexOf('ls-remote') + 2).map(n => `${n.startsWith('refs/pull/') ? 'h'.repeat(40) : 'b'.repeat(40)}\t${n}`).join('\n') + '\n')
    }
    if (s.includes(' fetch ')) return ok('')
    if (s.includes('merge-base')) return ok('m'.repeat(40) + '\n')
    if (s.includes('--raw')) return ok(inv(['x']) + PATCH)
    if (s.includes(' -p ')) return ok(PATCH)
    return fail(`unexpected: ${s}`)
  }
  return { run, calls }
}

test('the remote is the one whose URL is the repository gh resolved, origin first, whatever the host', () => {
  expect(repoOfUrl('git@github.com:Me/R.git')).toBe('me/r')
  expect(repoOfUrl('https://github.com/o/r')).toBe('o/r')
  expect(repoOfUrl('git@github-work:delightroom/app.git')).toBe('delightroom/app')
  expect(repoOfUrl('ssh://git@ssh.github.com:443/o/r.git')).toBe('o/r')
  expect(repoOfUrl('https://ghe.corp.com/o/r.git/')).toBe('o/r')
  expect(repoOfUrl('git@ghe.corp.com:o/r.git')).toBe('o/r')
  expect(repoOfUrl('/local/path/r')).toBe(undefined)
  const v = 'up\thttps://github.com/o/r (fetch)\norigin\tssh://git@github.com/o/r.git (fetch)\n'
  expect(remoteFor(v, 'O/R')).toBe('origin')
  expect(remoteFor('work\tgit@github-work:o/r.git (fetch)\n', 'o/r')).toBe('work')
  expect(remoteFor('fork\tgit@github.com:me/r.git (fetch)\n', 'o/r')).toBe(undefined)
  // A partial clone writes its filter after the fetch URL.
  expect(remoteFor('origin\thttps://github.com/o/r.git (fetch) [blob:none]\norigin\thttps://github.com/o/r.git (push)\n', 'o/r')).toBe('origin')
})

test('per-file reads keep their order and stay under the concurrency limit', async () => {
  let live = 0
  let peak = 0
  const out = await mapLimit([5, 1, 4, 2, 3, 0, 6, 7, 8, 9], 3, async n => {
    live += 1
    peak = Math.max(peak, live)
    for (let i = 0; i < n; i += 1) await null
    live -= 1
    return n * 10
  })
  expect(out).toEqual([50, 10, 40, 20, 30, 0, 60, 70, 80, 90])
  expect(peak).toBe(3)
})

test('a PR not checked out: both tips listed once, fetched by id without a ref, diffed merge-base..head', async () => {
  const { run, calls } = fakeRepo(undefined)
  const d = await loadDiff(run, 7)
  expect(d.baseRefName).toBe('feat/a')
  const listed = calls.find(c => c.includes('ls-remote')) ?? []
  expect(listed.slice(-3)).toEqual(['origin', 'refs/heads/feat/a', 'refs/pull/7/head'])
  const fetch = calls.find(c => c.includes('fetch')) ?? []
  expect(fetch.slice(-3)).toEqual(['origin', 'b'.repeat(40), 'h'.repeat(40)])
  expect(calls.some(c => c.includes('update-ref'))).toBe(false)
  // The repository the list already resolved is not asked again.
  const again = fakeRepo(undefined)
  await loadDiff(again.run, 7, { repo: 'o/r' })
  expect(again.calls.some(c => c.join(' ').startsWith('gh repo view'))).toBe(false)
  const diffed = calls.find(c => c.includes('--raw')) ?? []
  expect(diffed.slice(-2)).toEqual(['m'.repeat(40), 'h'.repeat(40)])
  expect(d.files.map(f => f.path)).toEqual(['x'])
})

test('a failed fetch or merge-base is reported with its step, not swallowed', async () => {
  const f = fakeRepo(undefined, { ' fetch ': fail('fatal: remote error: upload-pack: not our ref') })
  await expect(loadDiff(f.run, 7)).rejects.toThrow('git fetch: fatal: remote error: upload-pack: not our ref')
  const gone = fakeRepo(undefined, { ' ls-remote ': ok('') })
  await expect(loadDiff(gone.run, 7)).rejects.toThrow('git ls-remote: origin has no branch feat/a')
  const m = fakeRepo(undefined, { 'merge-base': fail('') })
  await expect(loadDiff(m.run, 7)).rejects.toThrow('git merge-base: no common ancestor of feat/a and the PR head')
})

test('a patch over 4 MiB is fetched again file by file', async () => {
  const { run, calls } = fakeRepo(undefined, {
    '-- x': ok(PATCH),
  })
  const big: Run = async (argv, t) => {
    const s = argv.join(' ')
    if (s.includes('--raw')) return { ...ok(inv(['x'])), isStdoutTruncated: true }
    return run(argv, t)
  }
  const d = await loadDiff(big, 7)
  expect(d.files[0]?.hunks.length).toBe(1)
  expect(calls.some(c => c.at(-2) === '--' && c.at(-1) === 'x')).toBe(true)
  // File names are never read as pathspec magic or globs.
  expect(calls.find(c => c.at(-1) === 'x' && c.at(-2) === '--')).toContain('--literal-pathspecs')
})

test('with one owner/repo on two hosts, the remote on the PR\'s host is used', async () => {
  const v = 'origin\thttps://github.com/o/r.git (fetch)\nwork\tgit@ghe.corp.com:o/r.git (fetch)\n'
  expect(remoteFor(v, 'o/r', 'ghe.corp.com')).toBe('work')
  expect(remoteFor(v, 'o/r', 'github.com')).toBe('origin')
  // A host no remote URL names (an ssh alias) falls back to the path match.
  expect(remoteFor('work\tgit@github-work:o/r.git (fetch)\n', 'o/r', 'github.com')).toBe('work')
  expect(remoteFor(v, 'o/r')).toBe('origin')
})

test('a PR whose head is already in its base says so instead of showing nothing', async () => {
  const { run } = fakeRepo(undefined, { 'merge-base': ok('h'.repeat(40) + '\n'), '--raw': ok('') })
  const d = await loadDiff(run, 7)
  expect(d.files).toEqual([])
  expect(d.notes).toEqual(['the PR head is already in feat/a: merged?'])
  const { run: open } = fakeRepo(undefined)
  expect((await loadDiff(open, 7)).notes).toEqual([])
})

test('the fetch asks nothing on the terminal, and leaves a user\'s own ssh command alone', async () => {
  const envs: Array<Record<string, string> | undefined> = []
  const wrap = (run: Run): Run => async (argv, t, env) => {
    if (argv.includes('fetch')) envs.push(env)
    return run(argv, t, env)
  }
  await loadDiff(wrap(fakeRepo(undefined).run), 7)
  expect(envs[0]).toEqual({ GIT_TERMINAL_PROMPT: '0', GIT_SSH_COMMAND: 'ssh -o BatchMode=yes' })
  await loadDiff(wrap(fakeRepo(undefined, { 'config --get core.sshCommand': ok('ssh -i key\n') }).run), 7)
  expect(envs[1]).toEqual({ GIT_TERMINAL_PROMPT: '0' })
  await loadDiff(wrap(fakeRepo(undefined).run), 7, { ownSsh: true })
  expect(envs[2]).toEqual({ GIT_TERMINAL_PROMPT: '0' })
})

/** `run`, except that a command whose text holds `match` rejects as a timeout does. */
function rejecting(run: Run, match: string): Run {
  return async (argv, t, env) => {
    if (argv.join(' ').includes(match)) throw new Error('process.run: timed out after 30000 ms')
    return run(argv, t, env)
  }
}

test('a command that never answers fails the load under its step; one file of the fallback only marks that file', async () => {
  await expect(loadDiff(rejecting(fakeRepo(undefined).run, '--raw'), 7)).rejects.toThrow('git diff: process.run: timed out')
  const two = fakeRepo(undefined, { '-- x': ok(PATCH) })
  const big: Run = async (argv, t, env) => {
    const s = argv.join(' ')
    if (s.includes('--raw')) return { ...ok(inv(['x', 'y'])), isStdoutTruncated: true }
    if (s.endsWith('-- y')) throw new Error('process.run: timed out after 30000 ms')
    return two.run(argv, t, env)
  }
  const d = await loadDiff(big, 7)
  expect(d.files.map(f => [f.path, f.hunks.length])).toEqual([['x', 1], ['y', 0]])
  expect(d.files[1]?.notes).toEqual(['git diff failed: process.run: timed out after 30000 ms'])
})

test('no merge-base in a shallow clone says so instead of an exit code', async () => {
  const shallow = fakeRepo(undefined, { 'merge-base': fail(''), 'is-shallow-repository': ok('true\n') })
  await expect(loadDiff(shallow.run, 7)).rejects.toThrow('git merge-base: no common ancestor of feat/a and the PR head in this shallow clone; fetch more history (git fetch --unshallow)')
  const unrelated = fakeRepo(undefined, { 'merge-base': fail(''), 'is-shallow-repository': ok('false\n') })
  await expect(loadDiff(unrelated.run, 7)).rejects.toThrow('git merge-base: no common ancestor of feat/a and the PR head')
})

test('the fetch skips submodules, and every git command from it on runs prompt-free with the diff budget', async () => {
  const seen: Array<{ s: string; t?: number; env?: Record<string, string> }> = []
  const record = (run: Run): Run => async (argv, t, env) => {
    seen.push({ s: argv.join(' '), t, env })
    return run(argv, t, env)
  }
  const big = fakeRepo(undefined, { '-- x': ok(PATCH) })
  const cut: Run = async (argv, t, env) => {
    const s = argv.join(' ')
    if (s.includes('--raw')) return { ...ok(inv(['x'])), isStdoutTruncated: true }
    return big.run(argv, t, env)
  }
  await loadDiff(record(cut), 7)
  const at = seen.findIndex(c => c.s.includes(' fetch '))
  expect(seen[at]?.s).toContain('--no-recurse-submodules')
  const after = seen.slice(at).filter(c => c.s.startsWith('git '))
  expect(after.length).toBeGreaterThan(3)
  expect(after.every(c => c.env?.GIT_TERMINAL_PROMPT === '0')).toBe(true)
  const budget = (match: string) => seen.find(c => c.s.includes(match))?.t
  expect(budget('-- x')).toBe(120_000)
})

test('a failure names its error line, not a warning printed ahead of it', async () => {
  const ssh = [
    "Warning: Permanently added 'github.com' (ED25519) to the list of known hosts.",
    'git@github.com: Permission denied (publickey).',
    'fatal: Could not read from remote repository.',
    '',
    'Please make sure you have the correct access rights',
  ].join('\n')
  const f = fakeRepo(undefined, { ' ls-remote ': fail(ssh) })
  await expect(loadDiff(f.run, 7)).rejects.toThrow('git ls-remote: fatal: Could not read from remote repository.')
  const w = fakeRepo(undefined, { ' fetch ': fail('warning: redirecting to https://github.com/o/r2.git/\nremote: Repository not found.') })
  await expect(loadDiff(w.run, 7)).rejects.toThrow('git fetch: remote: Repository not found.')
})

test('a list that reaches its limit says more may exist', async () => {
  const many = Array.from({ length: 100 }, (_, i) => ({ number: i + 1, title: 't', headRefName: 'h', baseRefName: 'main', author: { login: 'a' }, isDraft: false }))
  const run: Run = async argv => {
    const s = argv.join(' ')
    if (s.startsWith('gh repo view')) return ok(JSON.stringify({ nameWithOwner: 'o/r' }))
    if (s.startsWith('gh pr list')) return ok(JSON.stringify(s.includes('--limit 100') ? many : []))
    return fail('no pull requests found')
  }
  expect((await listPrs(run)).isCut).toBe(true)
  expect((await listPrs(async argv => (argv.join(' ').startsWith('gh pr list') ? ok('[]') : run(argv)))).isCut).toBe(false)
})
