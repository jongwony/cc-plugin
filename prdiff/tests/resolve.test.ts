import { expect, test } from 'claude-code/testing'
import { decideMode, isSafeRef, loadDiff, remoteFor, repoOfUrl, type Run, type RunResult } from '../hooks/git.ts'

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
    if (s.includes(' fetch ')) return ok('')
    if (s.includes('rev-parse --verify --quiet refs/prdiff/7/base')) return ok('b'.repeat(40) + '\n')
    if (s.includes('rev-parse --verify --quiet refs/prdiff/7/head')) return ok('h'.repeat(40) + '\n')
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

test('the remote is the one whose URL is the repository gh resolved, origin first', () => {
  expect(repoOfUrl('git@github.com:Me/R.git')).toBe('me/r')
  expect(repoOfUrl('https://github.com/o/r')).toBe('o/r')
  const v = 'up\thttps://github.com/o/r (fetch)\norigin\tssh://git@github.com/o/r.git (fetch)\n'
  expect(remoteFor(v, 'O/R')).toBe('origin')
  expect(remoteFor('fork\tgit@github.com:me/r.git (fetch)\n', 'o/r')).toBe(undefined)
  expect(isSafeRef('feat/a-1.2')).toBe(true)
  expect(isSafeRef('--upload-pack=x')).toBe(false)
  expect(isSafeRef('a..b')).toBe(false)
})

test('a PR not checked out: both ends fetched into private refs, diffed merge-base..head', async () => {
  const { run, calls } = fakeRepo(undefined)
  const d = await loadDiff(run, 7)
  expect(d.mode).toBe('committed')
  expect(d.baseRefName).toBe('feat/a')
  const fetch = calls.find(c => c.includes('fetch')) ?? []
  expect(fetch).toContain('origin')
  expect(fetch).toContain('+refs/heads/feat/a:refs/prdiff/7/base')
  expect(fetch).toContain('+refs/pull/7/head:refs/prdiff/7/head')
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
})

test('a failed fetch or merge-base is reported with its step, not swallowed', async () => {
  const f = fakeRepo(undefined, { ' fetch ': fail("fatal: couldn't find remote ref refs/heads/feat/a") })
  await expect(loadDiff(f.run, 7)).rejects.toThrow("git fetch: fatal: couldn't find remote ref refs/heads/feat/a")
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
})
