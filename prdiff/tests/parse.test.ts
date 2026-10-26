import { expect, test } from 'claude-code/testing'
import { clean, fileFor, hunkSource, parseDiff, summaryOf, type Entry } from '../hooks/parse.ts'

// The inventory `git diff --raw --no-abbrev --numstat -z -M` from git 2.54,
// over: a binary edit, a file turned symlink, an edit, an added `new one.txt`,
// `ren.txt` renamed to `say "hi".txt`, and a mode change on `with space.txt`.
const REAL = ":100644 100644 bdc955b7b2e610ad5a72302b139a2e6cb325519a 8835708590a9afa236e1bbad18df9d23de82ccd3 M\u0000bin\u0000:100644 120000 587be6b4c3f93f93c489c0111bba5596147a26cb 347bda8b202a5db796d1fe649680232fde0f6c3a T\u0000f\u0000:100644 100644 422c2b7ab3b3c668038da977e4e93a5fc623169c de980441c3ab03a8c07dda1ad27b8a11f39deb1e M\u0000m.txt\u0000:000000 100644 0000000000000000000000000000000000000000 3e757656cf36eca53338e520d134963a44f793f8 A\u0000new one.txt\u0000:100644 100644 4286f428e3b19fe84de503916ce0e7dc8deefea1 4286f428e3b19fe84de503916ce0e7dc8deefea1 R100\u0000ren.txt\u0000say \"hi\".txt\u0000:100644 100755 3367afdbbf91e638efe983616377c60477cc6612 3367afdbbf91e638efe983616377c60477cc6612 M\u0000with space.txt\u0000-\t-\tbin\u00001\t1\tf\u00001\t0\tm.txt\u00001\t0\tnew one.txt\u00000\t0\t\u0000ren.txt\u0000say \"hi\".txt\u00000\t0\twith space.txt\u0000"

// The blob-pair patch git 2.54 writes for that type change (`git diff <old blob> <new blob>`).
const TYPECHANGE = "diff --git a/587be6b b/347bda8\nindex 587be6b..347bda8 100644\n--- a/587be6b\n+++ b/347bda8\n@@ -1 +1 @@\n-x\n+m.txt\n\\ No newline at end of file\n"

/** A one-entry diff: a modified `path` with the given patch. */
function one(path: string, patch: string, added = 1, deleted = 1) {
  const { entries } = parseDiff(`:100644 100644 1111111 2222222 M\0${path}\0${added}\t${deleted}\t${path}\0`)
  const e = entries[0] as Entry
  return fileFor(e, patch)
}

const PATCH = `diff --git a/1111111 b/2222222
index 1111111..2222222 100644
--- a/1111111
+++ b/2222222
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

test('a type change reads as one hunk of its two blobs', () => {
  const { entries } = parseDiff(REAL)
  const f = fileFor(entries[1] as Entry, TYPECHANGE)
  expect(f.hunks.flatMap(h => h.lines.map(l => l.mark + l.text))).toEqual(['-x', '+m.txt', '\\ No newline at end of file'])
  expect(f.notes).toEqual(['file type changed'])
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
  const f = one('w.txt', 'diff --git a/1111111 b/2222222\nindex 1111111..2222222 100644\n--- a/1111111\n+++ b/2222222\n@@ -1 +1 @@\n-old\r\n+new\u001b[0m\r\n')
  expect(f.hunks[0]?.lines.map(l => l.text)).toEqual(['old', 'new�[0m'])
})

test('an empty context line written without its space still counts as context', () => {
  // diff.suppressBlankEmpty=true writes a blank context line as ''.
  const f = one('e.txt', 'diff --git a/1111111 b/2222222\nindex 1111111..2222222 100644\n--- a/1111111\n+++ b/2222222\n@@ -1,3 +1,3 @@\n a\n\n-b\n+B\n')
  expect(f.hunks[0]?.lines.map(l => `${l.mark}${l.oldNo}/${l.newNo}`)).toEqual([' 1/1', ' 2/2', '-3/3', '+4/3'])
})

test('a "no newline" marker is never drawn, and a run of only that gives no source', () => {
  const f = one('r.ts', 'diff --git a/1111111 b/2222222\nindex 1111111..2222222 100644\n--- a/1111111\n+++ b/2222222\n@@ -10,2 +10,4 @@\n keep\n+added one\n+added two\n keep\n\\ No newline at end of file\n')
  const lines = f.hunks[0]?.lines ?? []
  expect(lines.at(-1)?.mark).toBe('\\')
  expect(hunkSource(lines)).toBe('@@ -10,2 +10,4 @@\n keep\n+added one\n+added two\n keep')
  expect(hunkSource(lines.slice(-1))).toBe('')
})

test('a change only in line endings is noted, since the drawn texts are identical', () => {
  // `git diff` of `x\r\ny\n` to `x\ny\n`, as git 2.54 writes it.
  const patch = 'diff --git a/1111111 b/2222222\nindex 1111111..2222222 100644\n--- a/1111111\n+++ b/2222222\n@@ -1,2 +1,2 @@\n-x\r\n+x\n y\n'
  const f = one('c.txt', patch)
  expect(f.notes).toEqual(['line endings changed'])
  expect(f.hunks[0]?.lines.map(l => l.mark + l.text)).toEqual(['-x', '+x', ' y'])
  // A real edit inside a CRLF file is not one.
  expect(one('c.txt', patch.replace('+x\n', '+z\r\n')).notes).toEqual([])
})

test('a side that counts no lines starts the run after the line its header names', () => {
  // git 2.54 with -U0: inserting A, B after line 5 of 1..10, and deleting lines 5 and 6.
  const i = one('n', 'diff --git a/1111111 b/2222222\nindex 1111111..2222222 100644\n--- a/1111111\n+++ b/2222222\n@@ -5,0 +6,2 @@\n+A\n+B\n', 2, 0)
  const d = one('n', 'diff --git a/1111111 b/2222222\nindex 1111111..2222222 100644\n--- a/1111111\n+++ b/2222222\n@@ -5,2 +4,0 @@\n-5\n-6\n', 0, 2)
  expect(i.hunks[0]?.lines.map(l => [l.oldNo, l.newNo])).toEqual([[6, 6], [6, 7]])
  expect(d.hunks[0]?.lines.map(l => [l.oldNo, l.newNo])).toEqual([[5, 5], [6, 5]])
  expect(hunkSource(i.hunks[0]?.lines ?? []).split('\n')[0]).toBe('@@ -5,0 +6,2 @@')
  expect(hunkSource(d.hunks[0]?.lines ?? []).split('\n')[0]).toBe('@@ -5,2 +4,0 @@')
  const n = one('n', 'diff --git a/1111111 b/2222222\nindex 1111111..2222222 100644\n--- a/1111111\n+++ b/2222222\n@@ -0,0 +1 @@\n+x\n', 1, 0)
  expect(hunkSource(n.hunks[0]?.lines ?? []).split('\n')[0]).toBe('@@ -0,0 +1,1 @@')
})

test('a patch cut at 4 MiB keeps only its whole lines, even when the cut falls just after a newline', () => {
  const whole = 'diff --git a/1111111 b/2222222\nindex 1111111..2222222 100644\n--- a/1111111\n+++ b/2222222\n@@ -1,3 +1,3 @@\n a\n-b\n+B\n c\n'
  const atNewline = whole.slice(0, whole.indexOf('-b'))
  const midLine = whole.slice(0, whole.indexOf('-b') + 1)
  const { entries } = parseDiff(':100644 100644 1111111 2222222 M\0e.txt\0' + '1\t1\te.txt\0')
  const e = entries[0] as Entry
  for (const cut of [atNewline, midLine]) {
    expect(fileFor(e, cut, true).hunks[0]?.lines.map(l => l.mark + l.text)).toEqual([' a'])
  }
  expect(fileFor(e, whole).hunks[0]?.lines.map(l => l.mark + l.text)).toEqual([' a', '-b', '+B', ' c'])
})
