import { expect, test } from 'claude-code/testing'
import { decideMode, isSafeRef, loadDiff, mapLimit, remoteFor, repoOfUrl, type Run, type RunResult } from '../hooks/git.ts'

const ok = (stdout: string): RunResult => ({ exitCode: 0, stdout, stderr: '', isStdoutTruncated: false })
const fail = (stderr: string): RunResult => ({ exitCode: 1, stdout: '', stderr, isStdoutTruncated: false })

const PR = { number: 7, title: 'Stacked', url: 'https://github.com/o/r/pull/7', headRefName: 'feat/b', headRefOid: 'h'.repeat(40), baseRefName: 'feat/a' }
const PATCH = 'diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b\n'

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
    if (s.includes('check-ref-format --branch')) return ok(`${argv.at(-1)}\n`)
    if (s.includes('update-ref -d')) return ok('')
    if (s.includes(' fetch ')) return ok('')
    if (/rev-parse --verify --quiet refs\/prdiff\/7\/[^/]+\/base/.test(s)) return ok('b'.repeat(40) + '\n')
    if (/rev-parse --verify --quiet refs\/prdiff\/7\/[^/]+\/head/.test(s)) return ok('h'.repeat(40) + '\n')
    if (s.includes('rev-parse --verify --quiet HEAD')) return ok('l'.repeat(40) + '\n')
    if (s.includes('merge-base')) return ok('m'.repeat(40) + '\n')
    if (s.includes('--numstat')) return ok('1\t1\tx\0')
    if (s.includes(' -p ')) return ok(PATCH)
    if (s.includes('ls-files --others')) return ok('new.txt\0')
    if (s.includes('--no-index')) return { ...ok('diff --git a/new.txt b/new.txt\n--- /dev/null\n+++ b/new.txt\n@@ -0,0 +1 @@\n+n\n'), exitCode: 1 }
    return fail(`unexpected: ${s}`)
  }
  return { run, calls }
}

test('working-tree changes join only when gh names this checkout the same PR', () => {
  expect(decideMode(7, 7)).toBe('worktree')
  expect(decideMode(8, 7)).toBe('committed')
  expect(decideMode(undefined, 7)).toBe('committed')
})

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

test('a base name is usable when git accepts it as a branch and prints it back unchanged', async () => {
  const calls: string[][] = []
  // Stands in for `git check-ref-format --branch`: echoes, expanding @{-1}, refusing `..`.
  const run: Run = async argv => {
    calls.push(argv)
    const name = argv.at(-1) ?? ''
    if (name.includes('..')) return fail('fatal: not a valid branch name')
    return ok(name === '@{-1}' ? 'main\n' : `${name}\n`)
  }
  for (const name of ['feat/a-1.2', 'release/v2+hotfix', '기능/로그인', 'user@topic', 'fix#12']) {
    expect(await isSafeRef(run, name)).toBe(true)
  }
  for (const name of ['--upload-pack=x', '-x', 'a..b', '@{-1}', 'a:b', '']) {
    expect(await isSafeRef(run, name)).toBe(false)
  }
  expect(calls.every(c => c.includes('check-ref-format') && c.includes('--branch'))).toBe(true)
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

test('a PR not checked out: both ends fetched into private refs, diffed merge-base..head', async () => {
  const { run, calls } = fakeRepo(undefined)
  const d = await loadDiff(run, 7)
  expect(d.mode).toBe('committed')
  expect(d.baseRefName).toBe('feat/a')
  const fetch = calls.find(c => c.includes('fetch')) ?? []
  expect(fetch).toContain('origin')
  const baseSpec = fetch.find(a => a.startsWith('+refs/heads/feat/a:')) ?? ''
  const headSpec = fetch.find(a => a.startsWith('+refs/pull/7/head:')) ?? ''
  expect(baseSpec).toMatch(/^\+refs\/heads\/feat\/a:refs\/prdiff\/7\/\d+-[0-9a-z]+\/base$/)
  expect(headSpec).toMatch(/^\+refs\/pull\/7\/head:refs\/prdiff\/7\/\d+-[0-9a-z]+\/head$/)
  // The scratch refs are gone once their commit ids are read.
  const deleted = calls.filter(c => c.includes('update-ref')).map(c => c.at(-1))
  expect(deleted.sort()).toEqual([baseSpec.split(':')[1], headSpec.split(':')[1]].sort())
  // The repository the list already resolved is not asked again.
  const again = fakeRepo(undefined)
  await loadDiff(again.run, 7, { repo: 'o/r' })
  expect(again.calls.some(c => c.join(' ').startsWith('gh repo view'))).toBe(false)
  const numstat = calls.find(c => c.includes('--numstat')) ?? []
  expect(numstat.slice(-2)).toEqual(['m'.repeat(40), 'h'.repeat(40)])
  expect(d.files.map(f => f.path)).toEqual(['x'])
  expect(calls.some(c => c.includes('ls-files'))).toBe(false)
})

test('the checked-out PR: merge-base against the working tree, untracked files added', async () => {
  const { run, calls } = fakeRepo(7)
  const d = await loadDiff(run, 7)
  expect(d.mode).toBe('worktree')
  const numstat = calls.find(c => c.includes('--numstat')) ?? []
  const patch = calls.find(c => c.includes('-p') && !c.includes('--no-index')) ?? []
  expect(numstat.at(-1)).toBe('m'.repeat(40))
  expect(patch.at(-1)).toBe('m'.repeat(40))
  expect(d.files.map(f => [f.path, f.kind])).toEqual([['x', 'modified'], ['new.txt', 'untracked']])
  expect(d.notes.some(n => n.includes('differs from the PR head'))).toBe(true)
  // An untracked file is read as its bytes, never through a textconv filter.
  expect(calls.find(c => c.includes('--no-index'))).toContain('--no-textconv')
})

test('a failed fetch or merge-base is reported with its step, not swallowed', async () => {
  const f = fakeRepo(undefined, { ' fetch ': fail("fatal: couldn't find remote ref refs/heads/feat/a") })
  await expect(loadDiff(f.run, 7)).rejects.toThrow("git fetch: fatal: couldn't find remote ref refs/heads/feat/a")
  // A failed fetch still deletes whatever scratch refs it may have written.
  expect(f.calls.filter(c => c.includes('update-ref')).length).toBe(2)
  const m = fakeRepo(undefined, { 'merge-base': fail('') })
  await expect(loadDiff(m.run, 7)).rejects.toThrow('git merge-base: exit 1')
})

test('a patch over 4 MiB is fetched again file by file', async () => {
  const { run, calls } = fakeRepo(undefined, {
    '-- x': ok(PATCH),
  })
  const big: Run = async (argv, t) => {
    const s = argv.join(' ')
    if (s.includes(' -p ') && !s.includes(' -- ')) return { ...ok(''), isStdoutTruncated: true }
    return run(argv, t)
  }
  const d = await loadDiff(big, 7)
  expect(d.files[0]?.hunks.length).toBe(1)
  expect(calls.some(c => c.at(-2) === '--' && c.at(-1) === 'x')).toBe(true)
  // File names are never read as pathspec magic or globs.
  expect(calls.find(c => c.at(-1) === 'x' && c.at(-2) === '--')).toContain('--literal-pathspecs')
})

test("the patch prefixes are pinned whatever the user's diff prefix settings", async () => {
  const { run, calls } = fakeRepo(undefined)
  await loadDiff(run, 7)
  const patch = calls.find(c => c.includes('-p')) ?? []
  expect(patch.join(' ')).toContain('-c diff.srcPrefix=a/ -c diff.dstPrefix=b/')
})

test('a remote still on the URL from before a rename or transfer is found through gh', async () => {
  const { run, calls } = fakeRepo(undefined, {
    'remote -v': ok('origin\tgit@github.com:old-org/r.git (fetch)\nfork\tgit@github.com:me/r.git (fetch)\n'),
    'gh repo view old-org/r': ok(JSON.stringify({ nameWithOwner: 'O/R' })),
    'gh repo view me/r': ok(JSON.stringify({ nameWithOwner: 'me/r' })),
  })
  await loadDiff(run, 7)
  expect(calls.find(c => c.includes('fetch'))).toContain('origin')
  const none = fakeRepo(undefined, {
    'remote -v': ok('fork\tgit@github.com:me/r.git (fetch)\n'),
    'gh repo view me/r': ok(JSON.stringify({ nameWithOwner: 'me/r' })),
  })
  await expect(loadDiff(none.run, 7)).rejects.toThrow('remote: no git remote points at O/R')
})

test('an untracked path git cannot read is listed as not read, not as an empty file', async () => {
  const { run } = fakeRepo(7, {
    'ls-files --others': ok('emb/\0new.txt\0'),
    '-- /dev/null emb/': { exitCode: 1, stdout: '', stderr: "error: Could not access 'emb/null'", isStdoutTruncated: false },
  })
  const d = await loadDiff(run, 7)
  const emb = d.files.find(f => f.path === 'emb/')
  expect(emb?.notes).toContain('content not read')
  expect(d.files.find(f => f.path === 'new.txt')?.notes).toEqual(['untracked'])
})

test('an untracked list over 4 MiB lists what arrived whole instead of failing the load', async () => {
  const { run } = fakeRepo(7, {
    'ls-files --others': { exitCode: 0, stdout: 'a.txt\0b.txt\0c.t', stderr: '', isStdoutTruncated: true },
  })
  const d = await loadDiff(run, 7)
  expect(d.files.filter(f => f.kind === 'untracked').map(f => f.path)).toEqual(['a.txt', 'b.txt'])
  expect(d.notes.some(n => n.includes('more untracked files not listed'))).toBe(true)
})

test('with one owner/repo on two hosts, the remote on the PR\'s host is used', async () => {
  const v = 'origin\thttps://github.com/o/r.git (fetch)\nwork\tgit@ghe.corp.com:o/r.git (fetch)\n'
  expect(remoteFor(v, 'o/r', 'ghe.corp.com')).toBe('work')
  expect(remoteFor(v, 'o/r', 'github.com')).toBe('origin')
  // A host no remote URL names (an ssh alias) falls back to the path match.
  expect(remoteFor('work\tgit@github-work:o/r.git (fetch)\n', 'o/r', 'github.com')).toBe('work')
  expect(remoteFor(v, 'o/r')).toBe('origin')
})
