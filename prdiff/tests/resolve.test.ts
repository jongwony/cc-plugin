import { expect, test } from 'claude-code/testing'
import { candidates, loadDiff, repoOfUrl, type Run, type RunResult } from '../hooks/git.ts'

const ok = (stdout: string): RunResult => ({ exitCode: 0, stdout, stderr: '', isStdoutTruncated: false })
const fail = (stderr: string): RunResult => ({ exitCode: 1, stdout: '', stderr, isStdoutTruncated: false })

const PR = { number: 7, title: 'Stacked', url: 'https://github.com/o/r/pull/7', headRefName: 'feat/b', headRefOid: 'h'.repeat(40), baseRefName: 'feat/a', baseRefOid: 'b'.repeat(40) }
/** The file read of `x`: its two sides named `<rev>:<path>`. */
const READ_X = `${'m'.repeat(40)}:x ${'h'.repeat(40)}:x`
const PATCH = 'diff --git a/x b/x\nindex 1111111..2222222 100644\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b\n'

/** The `--raw --numstat -z` records of modified `paths`, as git writes them ahead of the patch. */
const inv = (paths: string[]) =>
  paths.map(p => `:100644 100644 old-${p} new-${p} M\0${p}\0`).join('') + paths.map(p => `1\t1\t${p}\0`).join('')

/** The remote a probe (`git fetch --dry-run`) asks, or undefined for any other command. */
const probed = (argv: readonly string[]) => (argv.includes('--dry-run') ? argv[argv.indexOf('--') + 1] : undefined)
/** A probe's porcelain answer: the pull head. */
const porcelain = (head: string) => ok(`* ${'0'.repeat(40)} ${head} refs/prdiff/head\n`)
/** The fetch of both tips by id. */
const byId = (calls: string[][]) => calls.find(c => c.includes('fetch') && !c.includes('--dry-run'))

/** A repository that answers by the command's shape; records every argv. */
function fakeRepo(overrides: Record<string, RunResult> = {}) {
  const calls: string[][] = []
  const run: Run = async argv => {
    calls.push(argv)
    const s = argv.join(' ')
    for (const [k, v] of Object.entries(overrides)) if (s.includes(k)) return v
    if (s.startsWith('gh pr view 7')) return ok(JSON.stringify(PR))
    if (s.includes('rev-parse --show-toplevel')) return ok('/repo\n')
    if (s.includes('remote -v')) return ok('fork\tgit@github.com:me/r.git (fetch)\norigin\thttps://github.com/o/r.git (fetch)\n')
    if (probed(argv) !== undefined) return porcelain('h'.repeat(40))
    if (s.includes(' fetch ')) return ok('')
    if (s.includes('merge-base')) return ok('m'.repeat(40) + '\n')
    if (s.includes('--raw')) return ok(inv(['x']))
    if (s.endsWith(READ_X)) return ok(PATCH)
    return fail(`unexpected: ${s}`)
  }
  return { run, calls }
}

test('remotes are grouped: URL matches first, then the rest, origin first within each', () => {
  expect(repoOfUrl('git@github.com:Me/R.git')).toBe('me/r')
  expect(repoOfUrl('https://github.com/o/r')).toBe('o/r')
  expect(repoOfUrl('git@github-work:delightroom/app.git')).toBe('delightroom/app')
  expect(repoOfUrl('ssh://git@ssh.github.com:443/o/r.git')).toBe('o/r')
  expect(repoOfUrl('https://ghe.corp.com/o/r.git/')).toBe('o/r')
  expect(repoOfUrl('git@ghe.corp.com:o/r.git')).toBe('o/r')
  expect(repoOfUrl('/local/path/r')).toBe(undefined)
  const v = 'up\thttps://github.com/o/r (fetch)\norigin\tssh://git@github.com/o/r.git (fetch)\n'
  expect(candidates(v, 'O/R')).toEqual([['origin', 'up']])
  // A remote naming another repository is in a group of its own, after those naming this one.
  expect(candidates('fork\tgit@github.com:me/r.git (fetch)\nwork\tgit@github-work:o/r.git (fetch)\n', 'o/r')).toEqual([['work'], ['fork']])
  // A partial clone writes its filter after the fetch URL; a name may hold spaces.
  expect(candidates('origin\thttps://github.com/o/r.git (fetch) [blob:none]\norigin\thttps://github.com/o/r.git (push)\n', 'o/r')).toEqual([['origin']])
  expect(candidates('my remote\t/srv/r (fetch)\n', 'o/r')).toEqual([['my remote']])
  // A local mirror whose path holds a space.
  expect(candidates('mirror\t/srv/mirror dir/r (fetch)\n', 'o/r')).toEqual([['mirror']])
})

test('a PR not checked out: its pull head asked for by name in a dry run, it and gh\'s base fetched by id without a ref, diffed merge-base..head', async () => {
  const { run, calls } = fakeRepo()
  const d = await loadDiff(run, 7)
  expect(d.baseRefName).toBe('feat/a')
  const listed = calls.find(c => probed(c) !== undefined) ?? []
  // The base branch is never asked for: a PR whose base branch was deleted still loads.
  expect(listed.slice(-3)).toEqual(['--', 'origin', '+refs/pull/7/head:refs/prdiff/head'])
  expect(listed).toContain('--porcelain')
  // An unchanged ref is printed only under --verbose.
  expect(listed).toContain('--verbose')
  expect(listed).toContain('--no-tags')
  const fetch = byId(calls) ?? []
  expect(fetch.slice(-4)).toEqual(['--', 'origin', 'b'.repeat(40), 'h'.repeat(40)])
  expect(calls.some(c => c.includes('update-ref'))).toBe(false)
  const diffed = calls.find(c => c.includes('--raw')) ?? []
  expect(diffed.slice(-2)).toEqual(['m'.repeat(40), 'h'.repeat(40)])
  expect(d.entries.map(e => e.path)).toEqual(['x'])
})

test('a failed fetch or merge-base is reported with its step, not swallowed', async () => {
  const f = fakeRepo({ ' fetch --quiet ': fail('fatal: remote error: upload-pack: not our ref') })
  await expect(loadDiff(f.run, 7)).rejects.toThrow('git fetch: fatal: remote error: upload-pack: not our ref')
  const m = fakeRepo({ 'merge-base': fail('') })
  await expect(loadDiff(m.run, 7)).rejects.toThrow('git merge-base: exit 1')
})

test('a file on both sides is read as its <rev>:<path> pair; an added or deleted one against the empty tree at its literal path', async () => {
  const z = (n: number) => '0'.repeat(n)
  const records = [
    `:100644 100644 old-x new-x M\0x\0`,
    `:000000 100644 ${z(40)} new-a A\0a\0`,
    `:100644 000000 old-d ${z(40)} D\0d\0`,
    `:100644 100755 same same M\0m\0`,
    `:100644 100644 old-b new-b M\0b\0`,
    `:160000 160000 aaaaaaaaaa bbbbbbbbbb M\0sub\0`,
  ].join('') + ['1\t1\tx', '1\t0\ta', '0\t1\td', '0\t0\tm', '-\t-\tb', '1\t1\tsub', ''].join('\0')
  const [m, h, t] = ['m'.repeat(40), 'h'.repeat(40), '4b825dc642cb6eb9a060e54bf8d69288fbee4904']
  const { run, calls } = fakeRepo({
    '--raw': ok(records),
    [READ_X]: ok(PATCH),
    [`${t} ${h} -- a`]: ok(''),
    [`${m} ${t} -- d`]: ok(''),
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
  const diffs = calls.filter(c => c.includes('diff') && !c.includes('--raw'))
  expect(diffs.map(c => c.slice(c.indexOf('-M') + 1))).toEqual([[`${m}:x`, `${h}:x`], [t, h, '--', 'a'], [m, t, '--', 'd']])
  // A pathspec reaches git only as a literal path, never as magic, a glob or a directory.
  expect(diffs.filter(c => c.includes('--')).every(c => c.indexOf('--literal-pathspecs') < c.indexOf('diff'))).toBe(true)
  expect(diffs[0]?.includes('--')).toBe(false)
  // Nothing is written to the object store.
  expect(calls.some(c => c.includes('hash-object'))).toBe(false)
  // Mode-only, binary and submodule entries have no lines to read.
  const before = calls.length
  expect((await read('m')).file.notes).toEqual(['mode 100644 → 100755'])
  expect((await read('b')).file.notes).toEqual(['binary file'])
  expect((await read('sub')).file.notes).toEqual(['submodule aaaaaaa → bbbbbbb'])
  expect(calls.length).toBe(before)
})

test('a file patch cut at 4 MiB is kept as far as it arrived; a file list cut there is reported', async () => {
  const cut = fakeRepo({ [READ_X]: { ...ok(PATCH.slice(0, PATCH.indexOf('+b'))), isStdoutTruncated: true } })
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
  expect(candidates(v, 'o/r', 'ghe.corp.com')).toEqual([['work', 'origin']])
  expect(candidates(v, 'o/r', 'github.com')).toEqual([['origin', 'work']])
  expect(candidates(v, 'o/r')).toEqual([['origin', 'work']])
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
  const d = await loadDiff(rejecting(fakeRepo().run, READ_X), 7)
  const e = d.entries[0]
  if (!e) throw new Error('no entry')
  await expect(d.readFile(e)).rejects.toThrow('git diff: process.run: timed out')
})

test('the fetch skips submodules, and every git command from it on runs prompt-free with the diff budget', async () => {
  const seen: Array<{ s: string; t?: number; env?: Record<string, string> }> = []
  const record = (run: Run): Run => async (argv, t, env) => {
    seen.push({ s: argv.join(' '), t, env })
    return run(argv, t, env)
  }
  const d = await loadDiff(record(fakeRepo({ [READ_X]: ok(PATCH) }).run), 7)
  const e = d.entries[0]
  if (!e) throw new Error('no entry')
  await d.readFile(e)
  const at = seen.findIndex(c => c.s.includes(' fetch '))
  expect(seen[at]?.s).toContain('--no-recurse-submodules')
  // No `maintenance run --auto` (gc) is started by the fetch.
  expect(seen[at]?.s).toContain('--no-auto-maintenance')
  const after = seen.slice(at).filter(c => c.s.startsWith('git '))
  expect(after.length).toBeGreaterThan(3)
  expect(after.every(c => c.env?.GIT_TERMINAL_PROMPT === '0')).toBe(true)
  const budget = (match: string) => seen.find(c => c.s.includes(match))?.t
  expect(budget(READ_X)).toBe(120_000)
})

test('a failure names the lines through its error line, cause included, not the warnings or advice around them', async () => {
  const ssh = [
    "Warning: Permanently added 'github.com' (ED25519) to the list of known hosts.",
    'git@github.com: Permission denied (publickey).',
    'fatal: Could not read from remote repository.',
    '',
    'Please make sure you have the correct access rights',
  ].join('\n')
  const f = fakeRepo({ '--dry-run': fail(ssh) })
  await expect(loadDiff(f.run, 7)).rejects.toThrow(
    'origin failed: git@github.com: Permission denied (publickey). fatal: Could not read from remote repository.',
  )
  // As git 2.54 and OpenSSH wrote it for an unreachable port 22, ssh's line ending in CR.
  const port = 'ssh: connect to host github.com port 22: Operation timed out\r\nfatal: Could not read from remote repository.\n\nPlease make sure you have the correct access rights\nand the repository exists.\n'
  const p = fakeRepo({ '--dry-run': { ...fail(port), exitCode: 128 } })
  await expect(loadDiff(p.run, 7)).rejects.toThrow(
    'origin failed: ssh: connect to host github.com port 22: Operation timed out fatal: Could not read from remote repository.,',
  )
  const w = fakeRepo({ ' fetch --quiet ': fail('warning: redirecting to https://github.com/o/r2.git/\nremote: Repository not found.') })
  await expect(loadDiff(w.run, 7)).rejects.toThrow('git fetch: remote: Repository not found.')
})

test('a type change is read by path and drawn in its two halves', async () => {
  const records = ':100644 120000 old-f new-f T\0f\0' + '1\t1\tf\0'
  const sections = "diff --git a/f b/f\ndeleted file mode 100644\nindex 587be6b..0000000\n--- a/f\n+++ /dev/null\n@@ -1 +0,0 @@\n-x\ndiff --git a/f b/f\nnew file mode 120000\nindex 0000000..347bda8\n--- /dev/null\n+++ b/f\n@@ -0,0 +1 @@\n+m.txt\n\\ No newline at end of file\n"
  const f = `${'m'.repeat(40)}:f ${'h'.repeat(40)}:f`
  const { run } = fakeRepo({ '--raw': ok(records), [f]: ok(sections) })
  const d = await loadDiff(run, 7)
  const e = d.entries[0]
  if (!e) throw new Error('no entry')
  const { file } = await d.readFile(e)
  expect(file.hunks.flatMap(h => h.lines.map(l => l.mark + l.text))).toEqual(['-x', '+m.txt'])
})

test('the PR URL names the repository and host; gh is asked nothing else about the repository', async () => {
  const ghe = { ...PR, url: 'https://ghe.corp.com/o/r/pull/7' }
  const { run, calls } = fakeRepo({
    'gh pr view 7': ok(JSON.stringify(ghe)),
    'remote -v': ok('origin\thttps://github.com/o/r.git (fetch)\nwork\tgit@ghe.corp.com:o/r.git (fetch)\n'),
  })
  await loadDiff(run, 7)
  expect(probed(calls.find(c => probed(c) !== undefined) ?? [])).toBe('work')
  expect(calls.some(c => c[0] === 'gh' && c[1] === 'repo')).toBe(false)
})

test('the PR\'s remote is the first whose pull head is gh\'s head; with none, the load says what each had', async () => {
  const pulls: Record<string, string> = { origin: 'x'.repeat(40), corp: 'h'.repeat(40) }
  // A GitLab origin and a GitHub remote reached through an ssh alias that names no host.
  const lab = fakeRepo({ 'remote -v': ok('origin\tgit@gitlab.com:o/r.git (fetch)\ncorp\tcorp:o/r.git (fetch)\n') })
  const by = (pull: Record<string, string>): Run => async (argv, t, env) => {
    const remote = probed(argv)
    if (remote !== undefined) {
      const head = pull[remote]
      return head ? porcelain(head) : fail('fatal: couldn\'t find remote ref refs/pull/7/head')
    }
    return lab.run(argv, t, env)
  }
  await loadDiff(by(pulls), 7)
  expect(byId(lab.calls)?.slice(-4)).toEqual(['--', 'corp', 'b'.repeat(40), 'h'.repeat(40)])
  // A renamed repository whose remote still names the old path is found by its head alone.
  const renamed = fakeRepo({ 'remote -v': ok('origin\tgit@github.com:o/old-name.git (fetch)\n') })
  await loadDiff(renamed.run, 7)
  expect(byId(renamed.calls)?.includes('origin')).toBe(true)
  // No remote holds the head gh reports: each one tried, and what it had, is named.
  await expect(loadDiff(by({ origin: 'x'.repeat(40) }), 7)).rejects.toThrow(
    "remote: gh reports PR #7 at hhhhhhh; origin has xxxxxxx at refs/pull/7/head, corp failed: fatal: couldn't find remote ref refs/pull/7/head",
  )
})

test('the repository directory is taken as git prints it, a trailing space kept', async () => {
  const { run, calls } = fakeRepo({ 'rev-parse --show-toplevel': ok('/srv/my repo \n') })
  await loadDiff(run, 7)
  const later = calls.filter(c => c.includes('-C'))
  expect(later.length).toBeGreaterThan(0)
  expect(later.every(c => c[c.indexOf('-C') + 1] === '/srv/my repo ')).toBe(true)
})

test('a probe reads the pull head whatever its flag, a fast-forward\'s blank one and an unchanged ref included', async () => {
  for (const flag of ['*', ' ', '+', '=']) {
    const f = fakeRepo({ '--dry-run': ok(`${flag} ${'a'.repeat(40)} ${'h'.repeat(40)} refs/prdiff/head\n`) })
    expect((await loadDiff(f.run, 7)).headOid).toBe('h'.repeat(40))
  }
})

test('a remote name is never read as an option', async () => {
  const name = '--upload-pack=touch PWNED;git-upload-pack'
  const { run, calls } = fakeRepo({ 'remote -v': ok(`${name}\thttps://github.com/o/r.git (fetch)\n`) })
  await loadDiff(run, 7)
  for (const c of calls.filter(c => c.includes('fetch'))) {
    expect(c.indexOf('--')).toBe(c.indexOf(name) - 1)
  }
})

test('attributes are read from the PR head, in the file list and in each file read', async () => {
  const { run, calls } = fakeRepo({ [READ_X]: ok(PATCH) })
  const d = await loadDiff(run, 7)
  const e = d.entries[0]
  if (!e) throw new Error('no entry')
  await d.readFile(e)
  const diffs = calls.filter(c => c.includes('diff'))
  expect(diffs.length).toBe(2)
  expect(diffs.every(c => c.includes(`--attr-source=${'h'.repeat(40)}`))).toBe(true)
})

test('remotes naming the PR\'s repository are asked at once, so a slow one ranked first does not hold the others back', async () => {
  let release = () => {}
  const askedSecond = new Promise<void>(r => {
    release = r
  })
  const both = fakeRepo({ 'remote -v': ok('origin\tgit@github.com:o/r.git (fetch)\nwork\tgit@ghe.corp.com:o/r.git (fetch)\n') })
  const run: Run = async (argv, t, env) => {
    if (probed(argv) === 'origin') {
      // origin answers only once work has been asked: one at a time, this would never return.
      await askedSecond
      return fail('fatal: unable to access: Connection timed out')
    }
    if (probed(argv) === 'work') release()
    return both.run(argv, t, env)
  }
  await loadDiff(run, 7)
  expect(byId(both.calls)?.slice(-3, -2)).toEqual(['work'])
})

test('the first match in rank order is taken without waiting for remotes ranked below it', async () => {
  const never = new Promise<RunResult>(() => {})
  const both = fakeRepo({ 'remote -v': ok('origin\tgit@github.com:o/r.git (fetch)\nwork\tgit@ghe.corp.com:o/r.git (fetch)\n') })
  const run: Run = async (argv, t, env) => {
    // work, ranked below origin, never answers.
    if (probed(argv) === 'work') return never
    return both.run(argv, t, env)
  }
  await loadDiff(run, 7)
  expect(byId(both.calls)?.slice(-3, -2)).toEqual(['origin'])
})

test('a remote naming another repository is never asked while one naming the PR\'s repository matches', async () => {
  const never = new Promise<RunResult>(() => {})
  const repo = fakeRepo({ 'remote -v': ok('mirror\t/srv/mirror (fetch)\norigin\tgit@github.com:o/r.git (fetch)\n') })
  const asked: string[] = []
  const run: Run = async (argv, t, env) => {
    const remote = probed(argv)
    if (remote !== undefined) asked.push(remote)
    // mirror, slow, would hold its process until the timeout.
    if (remote === 'mirror') return never
    return repo.run(argv, t, env)
  }
  await loadDiff(run, 7)
  expect(asked).toEqual(['origin'])
})
