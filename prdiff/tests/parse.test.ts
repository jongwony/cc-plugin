import { expect, test } from 'claude-code/testing'
import { clean, hunkSource, mergeDiff, parseNumstat, untrackedFile } from '../hooks/parse.ts'

const NUMSTAT = ['3\t1\tsrc/a.ts', '-\t-\timg/logo.png', '0\t0\tbin/run.sh', '2\t0\t', 'old/name.ts', 'new/name.ts', ''].join('\0')

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
diff --git a/img/logo.png b/img/logo.png
index 3333333..4444444 100644
Binary files a/img/logo.png and b/img/logo.png differ
diff --git a/bin/run.sh b/bin/run.sh
old mode 100644
new mode 100755
diff --git a/old/name.ts b/new/name.ts
similarity index 90%
rename from old/name.ts
rename to new/name.ts
index 5555555..6666666 100644
--- a/old/name.ts
+++ b/new/name.ts
@@ -10,2 +10,4 @@
 keep
+added one
+added two
 keep
\\ No newline at end of file
`

test('numstat -z reads plain, binary and rename records', () => {
  const n = parseNumstat(NUMSTAT)
  expect(n).toEqual([
    { path: 'src/a.ts', added: 3, deleted: 1, isBinary: false },
    { path: 'img/logo.png', added: 0, deleted: 0, isBinary: true },
    { path: 'bin/run.sh', added: 0, deleted: 0, isBinary: false },
    { path: 'new/name.ts', oldPath: 'old/name.ts', added: 2, deleted: 0, isBinary: false },
  ])
})

test('files without hunks stay in the inventory with what kind of change they are', () => {
  const files = mergeDiff(parseNumstat(NUMSTAT), PATCH)
  expect(files.map(f => [f.path, f.kind, f.hunks.length])).toEqual([
    ['src/a.ts', 'modified', 1],
    ['img/logo.png', 'modified', 0],
    ['bin/run.sh', 'mode', 0],
    ['new/name.ts', 'renamed', 1],
  ])
  expect(files[1]?.isBinary).toBe(true)
  expect(files[1]?.notes).toContain('binary file')
  expect(files[2]?.notes).toContain('mode 100644 → 100755')
  expect(files[3]?.oldPath).toBe('old/name.ts')
})

test('hunk lines carry their old and new line numbers', () => {
  const [a] = mergeDiff(parseNumstat(NUMSTAT), PATCH)
  const h = a?.hunks[0]
  expect(h?.section).toBe('function top()')
  expect(h?.lines.map(l => `${l.mark}${l.oldNo}/${l.newNo}`)).toEqual([' 1/1', '-2/2', '+3/2', '+3/3', '+3/4', ' 3/5'])
})

test('a window that starts mid-hunk gets a header numbering that window', () => {
  const [a] = mergeDiff(parseNumstat(NUMSTAT), PATCH)
  const lines = a?.hunks[0]?.lines.slice(2) ?? []
  expect(hunkSource(lines)).toBe('@@ -3,1 +2,4 @@\n+TWO\n+three\n+four\n five')
  const added = a?.hunks[0]?.lines.filter(l => l.mark === '+') ?? []
  expect(hunkSource(added)).toBe('@@ -2,0 +2,3 @@\n+TWO\n+three\n+four')
})

test('the order fallback matches by path when counts disagree', () => {
  const n = parseNumstat(['1\t0\tz.txt', '1\t0\ty.txt', '1\t0\tx.txt', ''].join('\0'))
  const patch = `diff --git a/y.txt b/y.txt
--- a/y.txt
+++ b/y.txt
@@ -1 +1,2 @@
 y
+y2
`
  const files = mergeDiff(n, patch)
  expect(files.map(f => f.hunks.length)).toEqual([0, 1, 0])
  expect(files[0]?.notes).toEqual(['no patch text for this file'])
})

test('control characters are replaced, carriage returns dropped', () => {
  expect(clean('a\u0007b\nc')).toBe('a�b�c')
  const [f] = mergeDiff(parseNumstat('1\t1\tw.txt\0'), 'diff --git a/w.txt b/w.txt\n--- a/w.txt\n+++ b/w.txt\n@@ -1 +1 @@\n-old\r\n+new\u001b[0m\r\n')
  expect(f?.hunks[0]?.lines.map(l => l.text)).toEqual(['old', 'new�[0m'])
})

test('an untracked file counts its added lines', () => {
  const f = untrackedFile('notes.md', 'diff --git a/notes.md b/notes.md\nnew file mode 100644\n--- /dev/null\n+++ b/notes.md\n@@ -0,0 +1,2 @@\n+a\n+b\n')
  expect([f.kind, f.added, f.hunks.length]).toEqual(['untracked', 2, 1])
})
