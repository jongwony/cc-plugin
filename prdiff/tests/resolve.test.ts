import { expect, test } from 'claude-code/testing'
import { loadDiff, remoteFor, repoOfUrl, type Run, type RunResult } from '../hooks/git.ts'

const ok = (stdout: string): RunResult => ({ exitCode: 0, stdout, stderr: '', isStdoutTruncated: false })
const fail = (stderr: string): RunResult => ({ exitCode: 1, stdout: '', stderr, isStdoutTruncated: false })

const PR = { number: 7, title: 'Stacked', url: 'https://github.com/o/r/pull/7', headRefName: 'feat/b', baseRefName: 'feat/a' }
const PATCH = 'diff --git a/old-x b/new-x\nindex old-x..new-x 100644\n--- a/old-x\n+++ b/new-x\n@@ -1 +1 @@\n-a\n+b\n'

/** The `--raw --numstat -z` records of modified `paths`, as git writes them ahead of the patch. */
const inv = (paths: string[]) =>
  paths.map(p => `:100644 100644 old-${p} new-${p} M\0${p}\0`).join('') + paths.map(p => `1\t1\t${p}\0`).join('')

/** A repository that answers by the command's shape; records every argv. */
function fakeRepo(overrides: Record<string, RunResult> = {}) {
  const calls: string[][] = []
  const run: Run = async argv => {
    calls.push(argv)
    const s = argv.join(' ')
    for (const [k, v] of Object.entries(overrides)) if (s.includes(k)) return v
    if (s.startsWith('gh pr view 7')) return ok(JSON.stringify(PR))
    if (s.startsWith('gh repo view')) return ok(JSON.stringify({ nameWithOwner: 'O/R' }))
    if (s.includes('rev-parse --show-toplevel')) return ok('/repo\n')
    if (s.includes('remote -v')) return ok('fork\tgit@github.com:me/r.git (fetch)\norigin\thttps://github.com/o/r.git (fetch)\n')
    if (s.includes(' ls-remote ')) {
      return ok(argv.slice(argv.indexOf('ls-remote') + 2).map(n => `${n.startsWith('refs/pull/') ? 'h'.repeat(40) : 'b'.repeat(40)}\t${n}`).join('\n') + '\n')
    }
    if (s.includes(' fetch ')) return ok('')
    if (s.includes('merge-base')) return ok('m'.repeat(40) + '\n')
    if (s.includes('--raw')) return ok(inv(['x']))
    if (s.endsWith(' old-x new-x')) return ok(PATCH)
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

test('a PR not checked out: both tips listed once, fetched by id without a ref, diffed merge-base..head', async () => {
  const { run, calls } = fakeRepo()
  const d = await loadDiff(run, 7)
  expect(d.baseRefName).toBe('feat/a')
  const listed = calls.find(c => c.includes('ls-remote')) ?? []
  expect(listed.slice(-3)).toEqual(['origin', 'refs/heads/feat/a', 'refs/pull/7/head'])
  const fetch = calls.find(c => c.includes('fetch')) ?? []
  expect(fetch.slice(-3)).toEqual(['origin', 'b'.repeat(40), 'h'.repeat(40)])
  expect(calls.some(c => c.includes('update-ref'))).toBe(false)
  const diffed = calls.find(c => c.includes('--raw')) ?? []
  expect(diffed.slice(-2)).toEqual(['m'.repeat(40), 'h'.repeat(40)])
  expect(d.entries.map(e => e.path)).toEqual(['x'])
})

test('a failed fetch or merge-base is reported with its step, not swallowed', async () => {
  const f = fakeRepo({ ' fetch ': fail('fatal: remote error: upload-pack: not our ref') })
  await expect(loadDiff(f.run, 7)).rejects.toThrow('git fetch: fatal: remote error: upload-pack: not our ref')
  const gone = fakeRepo({ ' ls-remote ': ok('') })
  await expect(loadDiff(gone.run, 7)).rejects.toThrow('git ls-remote: origin has no branch feat/a')
  const m = fakeRepo({ 'merge-base': fail('') })
  await expect(loadDiff(m.run, 7)).rejects.toThrow('git merge-base: no common ancestor of feat/a and the PR head')
})

test('a file is read as the diff of its two blobs, with no pathspec', async () => {
  const z = (n: number) => '0'.repeat(n)
  const records = [
    `:100644 100644 old-x new-x M\0x\0`,
    `:000000 100644 ${z(40)} new-a A\0a\0`,
    `:100644 000000 old-d ${z(40)} D\0d\0`,
    `:100644 100755 same same M\0m\0`,
    `:100644 100644 old-b new-b M\0b\0`,
    `:160000 160000 aaaaaaaaaa bbbbbbbbbb M\0sub\0`,
  ].join('') + ['1\t1\tx', '1\t0\ta', '0\t1\td', '0\t0\tm', '-\t-\tb', '1\t1\tsub', ''].join('\0')
  const { run, calls } = fakeRepo({
    '--raw': ok(records),
    'hash-object -t blob /dev/null': ok('e'.repeat(40) + '\n'),
    'cat-file -e': ok(''),
    'old-x new-x': ok(PATCH),
    ' new-a': ok(''),
    'old-d ': ok(''),
  })
  const d = await loadDiff(run, 7)
  const read = async (path: string) => {
    const e = d.entries.find(x => x.path === path)
    if (!e) throw new Error(path)
    return d.readFile(e)
  }
  expect((await read('x')).file.hunks.length).toBe(1)
  await read('a')
  await read('d')
  const diffs = calls.filter(c => c.includes('diff') && !c.includes('--raw')).map(c => c.slice(-2))
  expect(diffs).toEqual([['old-x', 'new-x'], ['e'.repeat(40), 'new-a'], ['old-d', 'e'.repeat(40)]])
  // No pathspec reaches git: a path is never read as magic, a glob or a directory.
  expect(calls.some(c => c.includes('--'))).toBe(false)
  // Mode-only, binary and submodule entries have no lines to read.
  const before = calls.length
  expect((await read('m')).file.notes).toEqual(['mode 100644 → 100755'])
  expect((await read('b')).file.notes).toEqual(['binary file'])
  expect((await read('sub')).file.notes).toEqual(['submodule aaaaaaa → bbbbbbb'])
  expect(calls.length).toBe(before)
  // The empty blob is already in this repository: it is not written.
  expect(calls.some(c => c.includes('hash-object') && c.includes('-w'))).toBe(false)
})

test('a file patch cut at 4 MiB is kept as far as it arrived; a file list cut there is reported', async () => {
  const cut = fakeRepo({ 'old-x new-x': { ...ok(PATCH.slice(0, PATCH.indexOf('+b'))), isStdoutTruncated: true } })
  const d = await loadDiff(cut.run, 7)
  const e = d.entries[0]
  if (!e) throw new Error('no entry')
  const c = await d.readFile(e)
  expect([c.file.hunks[0]?.lines.map(l => l.mark + l.text), c.isCut]).toEqual([['-a'], true])
  const long = fakeRepo({ '--raw': { ...ok(inv(['x'])), isStdoutTruncated: true } })
  await expect(loadDiff(long.run, 7)).rejects.toThrow('git diff: file list over 4 MiB was cut')
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
  const { run } = fakeRepo({ 'merge-base': ok('h'.repeat(40) + '\n'), '--raw': ok('') })
  const d = await loadDiff(run, 7)
  expect(d.entries).toEqual([])
  expect(d.notes).toEqual(['the PR head is already in feat/a: merged?'])
  const { run: open } = fakeRepo()
  expect((await loadDiff(open, 7)).notes).toEqual([])
})

test('the fetch asks nothing on the terminal, and leaves a user\'s own ssh command alone', async () => {
  const envs: Array<Record<string, string> | undefined> = []
  const wrap = (run: Run): Run => async (argv, t, env) => {
    if (argv.includes('fetch')) envs.push(env)
    return run(argv, t, env)
  }
  await loadDiff(wrap(fakeRepo().run), 7)
  expect(envs[0]).toEqual({ GIT_TERMINAL_PROMPT: '0', GIT_SSH_COMMAND: 'ssh -o BatchMode=yes' })
  await loadDiff(wrap(fakeRepo({ 'config --get core.sshCommand': ok('ssh -i key\n') }).run), 7)
  expect(envs[1]).toEqual({ GIT_TERMINAL_PROMPT: '0' })
  await loadDiff(wrap(fakeRepo().run), 7, { ownSsh: true })
  expect(envs[2]).toEqual({ GIT_TERMINAL_PROMPT: '0' })
})

/** `run`, except that a command whose text holds `match` rejects as a timeout does. */
function rejecting(run: Run, match: string): Run {
  return async (argv, t, env) => {
    if (argv.join(' ').includes(match)) throw new Error('process.run: timed out after 30000 ms')
    return run(argv, t, env)
  }
}

test('a command that never answers fails the load, or the file read, under its step', async () => {
  await expect(loadDiff(rejecting(fakeRepo().run, '--raw'), 7)).rejects.toThrow('git diff: process.run: timed out')
  const d = await loadDiff(rejecting(fakeRepo().run, 'old-x new-x'), 7)
  const e = d.entries[0]
  if (!e) throw new Error('no entry')
  await expect(d.readFile(e)).rejects.toThrow('git diff: process.run: timed out')
})

test('no merge-base in a shallow clone says so instead of an exit code', async () => {
  const shallow = fakeRepo({ 'merge-base': fail(''), 'is-shallow-repository': ok('true\n') })
  await expect(loadDiff(shallow.run, 7)).rejects.toThrow('git merge-base: no common ancestor of feat/a and the PR head in this shallow clone; fetch more history (git fetch --unshallow)')
  const unrelated = fakeRepo({ 'merge-base': fail(''), 'is-shallow-repository': ok('false\n') })
  await expect(loadDiff(unrelated.run, 7)).rejects.toThrow('git merge-base: no common ancestor of feat/a and the PR head')
})

test('the fetch skips submodules, and every git command from it on runs prompt-free with the diff budget', async () => {
  const seen: Array<{ s: string; t?: number; env?: Record<string, string> }> = []
  const record = (run: Run): Run => async (argv, t, env) => {
    seen.push({ s: argv.join(' '), t, env })
    return run(argv, t, env)
  }
  const d = await loadDiff(record(fakeRepo({ 'old-x new-x': ok(PATCH) }).run), 7)
  const e = d.entries[0]
  if (!e) throw new Error('no entry')
  await d.readFile(e)
  const at = seen.findIndex(c => c.s.includes(' fetch '))
  expect(seen[at]?.s).toContain('--no-recurse-submodules')
  const after = seen.slice(at).filter(c => c.s.startsWith('git '))
  expect(after.length).toBeGreaterThan(3)
  expect(after.every(c => c.env?.GIT_TERMINAL_PROMPT === '0')).toBe(true)
  const budget = (match: string) => seen.find(c => c.s.includes(match))?.t
  expect(budget('old-x new-x')).toBe(120_000)
})

test('a failure names its error line, not a warning printed ahead of it', async () => {
  const ssh = [
    "Warning: Permanently added 'github.com' (ED25519) to the list of known hosts.",
    'git@github.com: Permission denied (publickey).',
    'fatal: Could not read from remote repository.',
    '',
    'Please make sure you have the correct access rights',
  ].join('\n')
  const f = fakeRepo({ ' ls-remote ': fail(ssh) })
  await expect(loadDiff(f.run, 7)).rejects.toThrow('git ls-remote: fatal: Could not read from remote repository.')
  const w = fakeRepo({ ' fetch ': fail('warning: redirecting to https://github.com/o/r2.git/\nremote: Repository not found.') })
  await expect(loadDiff(w.run, 7)).rejects.toThrow('git fetch: remote: Repository not found.')
})

test('the empty blob is written only when the repository lacks it, and a failed write is not kept', async () => {
  const z = '0'.repeat(40)
  const records = `:000000 100644 ${z} new-a A\0a\0` + '1\t0\ta\0'
  let writes = 0
  let present = false
  const { run, calls } = fakeRepo({ '--raw': ok(records), ' new-a': ok('') })
  const repo: Run = async (argv, t, env) => {
    const s = argv.join(' ')
    if (s.endsWith('hash-object -t blob /dev/null')) return ok('e'.repeat(40) + '\n')
    if (s.includes('cat-file -e')) return present ? ok('') : fail('')
    if (s.includes('hash-object -w')) {
      writes += 1
      if (writes === 1) return fail('error: unable to create temporary file: Read-only file system')
      present = true
      return ok('e'.repeat(40) + '\n')
    }
    return run(argv, t, env)
  }
  const d = await loadDiff(repo, 7)
  const e = d.entries[0]
  if (!e) throw new Error('no entry')
  await expect(d.readFile(e)).rejects.toThrow('git hash-object: error: unable to create temporary file: Read-only file system')
  // The next read tries again rather than repeating the first failure.
  expect((await d.readFile(e)).file.status).toBe('A')
  // Once present, nothing more is written.
  await d.readFile(e)
  expect(writes).toBe(2)
  expect(calls.some(c => c.includes('diff') && c.at(-2) === 'e'.repeat(40))).toBe(true)
})
