import { expect, test } from 'claude-code/testing'
import { clean, fileFor, hunkSource, parseDiff, summaryOf, type Entry } from '../hooks/parse.ts'

// `git diff --raw --numstat -p -z -M` from git 2.54, over: a binary edit, a
// file turned symlink, an edit, an added `new one.txt`, `ren.txt` renamed to
// `say "hi".txt`, and a mode change on `with space.txt`.
const REAL = ":100644 100644 bdc955b 8835708 M\u0000bin\u0000:100644 120000 587be6b 347bda8 T\u0000f\u0000:100644 100644 422c2b7 de98044 M\u0000m.txt\u0000:000000 100644 0000000 3e75765 A\u0000new one.txt\u0000:100644 100644 4286f42 4286f42 R100\u0000ren.txt\u0000say \"hi\".txt\u0000:100644 100755 3367afd 3367afd M\u0000with space.txt\u0000-\t-\tbin\u00001\t1\tf\u00001\t0\tm.txt\u00001\t0\tnew one.txt\u00000\t0\t\u0000ren.txt\u0000say \"hi\".txt\u00000\t0\twith space.txt\u0000\u0000diff --git a/bin b/bin\nindex bdc955b..8835708 100644\nBinary files a/bin and b/bin differ\ndiff --git a/f b/f\ndeleted file mode 100644\nindex 587be6b..0000000\n--- a/f\n+++ /dev/null\n@@ -1 +0,0 @@\n-x\ndiff --git a/f b/f\nnew file mode 120000\nindex 0000000..347bda8\n--- /dev/null\n+++ b/f\n@@ -0,0 +1 @@\n+m.txt\n\\ No newline at end of file\ndiff --git a/m.txt b/m.txt\nindex 422c2b7..de98044 100644\n--- a/m.txt\n+++ b/m.txt\n@@ -1,2 +1,3 @@\n a\n b\n+c\ndiff --git a/new one.txt b/new one.txt\nnew file mode 100644\nindex 0000000..3e75765\n--- /dev/null\n+++ b/new one.txt\t\n@@ -0,0 +1 @@\n+new\ndiff --git a/ren.txt \"b/say \\\"hi\\\".txt\"\nsimilarity index 100%\nrename from ren.txt\nrename to \"say \\\"hi\\\".txt\"\ndiff --git a/with space.txt b/with space.txt\nold mode 100644\nnew mode 100755\n"

/** A one-entry diff: a modified `path` with the given patch. */
function one(path: string, patch: string, added = 1, deleted = 1) {
  const { entries } = parseDiff(`:100644 100644 1111111 2222222 M\0${path}\0${added}\t${deleted}\t${path}\0`)
  const e = entries[0] as Entry
  return fileFor(e, patch)
}

const PATCH = `diff --git a/src/a.ts b/src/a.ts
index 1111111..2222222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,5 @@ function top()
 one
-two
+TWO
+three
+four
 five
`

test('the raw records name every file, its status, its counts and its notes', () => {
  const { entries, isWhole } = parseDiff(REAL)
  expect(isWhole).toBe(true)
  expect(entries.map(summaryOf).map(f => [f.path, f.oldPath, f.status, f.added, f.deleted, f.isBinary, f.notes])).toEqual([
    ['bin', undefined, 'M', 0, 0, true, ['binary file']],
    ['f', undefined, 'T', 1, 1, false, ['file type changed']],
    ['m.txt', undefined, 'M', 1, 0, false, []],
    ['new one.txt', undefined, 'A', 1, 0, false, []],
    ['say "hi".txt', 'ren.txt', 'R', 0, 0, false, ['similarity index 100%']],
    ['with space.txt', undefined, 'M', 0, 0, false, ['mode 100644 → 100755']],
  ])
  // Records cut short are reported, not half read.
  expect(parseDiff(REAL.slice(0, REAL.indexOf('ren.txt'))).isWhole).toBe(false)
})

test('a type change read alone takes both of its sections', () => {
  const { entries } = parseDiff(REAL)
  const patch = REAL.slice(REAL.indexOf('diff --git a/f b/f'), REAL.indexOf('diff --git a/m.txt'))
  const f = fileFor(entries[1] as Entry, patch)
  expect(f.hunks.flatMap(h => h.lines.map(l => l.mark + l.text))).toEqual(['-x', '+m.txt', '\\ No newline at end of file'])
})

test('hunk lines carry their old and new line numbers', () => {
  const h = one('src/a.ts', PATCH, 3, 1).hunks[0]
  expect(h?.section).toBe('function top()')
  expect(h?.lines.map(l => `${l.mark}${l.oldNo}/${l.newNo}`)).toEqual([' 1/1', '-2/2', '+3/2', '+3/3', '+3/4', ' 3/5'])
})

test('a window that starts mid-hunk gets a header numbering that window', () => {
  const lines = one('src/a.ts', PATCH, 3, 1).hunks[0]?.lines ?? []
  expect(hunkSource(lines.slice(2))).toBe('@@ -3,1 +2,4 @@\n+TWO\n+three\n+four\n five')
  expect(hunkSource(lines.filter(l => l.mark === '+'))).toBe('@@ -2,0 +2,3 @@\n+TWO\n+three\n+four')
})

test('control characters are replaced, carriage returns dropped', () => {
  expect(clean('a\u0007b\nc')).toBe('a�b�c')
  const f = one('w.txt', 'diff --git a/w.txt b/w.txt\n--- a/w.txt\n+++ b/w.txt\n@@ -1 +1 @@\n-old\r\n+new\u001b[0m\r\n')
  expect(f.hunks[0]?.lines.map(l => l.text)).toEqual(['old', 'new�[0m'])
})

test('an empty context line written without its space still counts as context', () => {
  // diff.suppressBlankEmpty=true writes a blank context line as ''.
  const f = one('e.txt', 'diff --git a/e.txt b/e.txt\n--- a/e.txt\n+++ b/e.txt\n@@ -1,3 +1,3 @@\n a\n\n-b\n+B\n')
  expect(f.hunks[0]?.lines.map(l => `${l.mark}${l.oldNo}/${l.newNo}`)).toEqual([' 1/1', ' 2/2', '-3/3', '+4/3'])
})

test('a "no newline" marker is never drawn, and a run of only that gives no source', () => {
  const f = one('r.ts', 'diff --git a/r.ts b/r.ts\n--- a/r.ts\n+++ b/r.ts\n@@ -10,2 +10,4 @@\n keep\n+added one\n+added two\n keep\n\\ No newline at end of file\n')
  const lines = f.hunks[0]?.lines ?? []
  expect(lines.at(-1)?.mark).toBe('\\')
  expect(hunkSource(lines)).toBe('@@ -10,2 +10,4 @@\n keep\n+added one\n+added two\n keep')
  expect(hunkSource(lines.slice(-1))).toBe('')
})

test('a change only in line endings is noted, since the drawn texts are identical', () => {
  // `git diff` of `x\r\ny\n` to `x\ny\n`, as git 2.54 writes it.
  const patch = 'diff --git a/c.txt b/c.txt\nindex 1111111..2222222 100644\n--- a/c.txt\n+++ b/c.txt\n@@ -1,2 +1,2 @@\n-x\r\n+x\n y\n'
  const f = one('c.txt', patch)
  expect(f.notes).toEqual(['line endings changed'])
  expect(f.hunks[0]?.lines.map(l => l.mark + l.text)).toEqual(['-x', '+x', ' y'])
  // A real edit inside a CRLF file is not one.
  expect(one('c.txt', patch.replace('+x\n', '+z\r\n')).notes).toEqual([])
})

test('a side that counts no lines starts the run after the line its header names', () => {
  // git 2.54 with -U0: inserting A, B after line 5 of 1..10, and deleting lines 5 and 6.
  const i = one('n', 'diff --git a/n b/n\n--- a/n\n+++ b/n\n@@ -5,0 +6,2 @@\n+A\n+B\n', 2, 0)
  const d = one('n', 'diff --git a/n b/n\n--- a/n\n+++ b/n\n@@ -5,2 +4,0 @@\n-5\n-6\n', 0, 2)
  expect(i.hunks[0]?.lines.map(l => [l.oldNo, l.newNo])).toEqual([[6, 6], [6, 7]])
  expect(d.hunks[0]?.lines.map(l => [l.oldNo, l.newNo])).toEqual([[5, 5], [6, 5]])
  expect(hunkSource(i.hunks[0]?.lines ?? []).split('\n')[0]).toBe('@@ -5,0 +6,2 @@')
  expect(hunkSource(d.hunks[0]?.lines ?? []).split('\n')[0]).toBe('@@ -5,2 +4,0 @@')
  const n = one('n', 'diff --git a/n b/n\nnew file mode 100644\n--- /dev/null\n+++ b/n\n@@ -0,0 +1 @@\n+x\n', 1, 0)
  expect(hunkSource(n.hunks[0]?.lines ?? []).split('\n')[0]).toBe('@@ -0,0 +1,1 @@')
})
