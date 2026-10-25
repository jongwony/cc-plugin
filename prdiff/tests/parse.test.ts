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

test('an empty context line written without its space still counts as context', () => {
  // diff.suppressBlankEmpty=true writes a blank context line as ''.
  const patch = 'diff --git a/e.txt b/e.txt\n--- a/e.txt\n+++ b/e.txt\n@@ -1,3 +1,3 @@\n a\n\n-b\n+B\n'
  const [f] = mergeDiff(parseNumstat('1\t1\te.txt\0'), patch)
  expect(f?.hunks[0]?.lines.map(l => `${l.mark}${l.oldNo}/${l.newNo}`)).toEqual([' 1/1', ' 2/2', '-3/3', '+4/3'])
})

test('a section at the same index but another path is not paired by position', () => {
  // numstat [a, b], patch [a, c]: the counts agree but b's patch is not c's.
  const n = parseNumstat(['1\t0\ta.txt', '1\t0\tb.txt', ''].join('\0'))
  const patch = [
    'diff --git a/a.txt b/a.txt', '--- a/a.txt', '+++ b/a.txt', '@@ -1 +1,2 @@', ' a', '+a2',
    'diff --git a/c.txt b/c.txt', '--- a/c.txt', '+++ b/c.txt', '@@ -1 +1,2 @@', ' c', '+c2', '',
  ].join('\n')
  const files = mergeDiff(n, patch)
  expect(files.map(f => [f.path, f.hunks.length])).toEqual([['a.txt', 1], ['b.txt', 0]])
  expect(files[1]?.notes).toEqual(['no patch text for this file'])
})

test('a "no newline" marker is never drawn, and a run of only that gives no source', () => {
  const [, , , r] = mergeDiff(parseNumstat(NUMSTAT), PATCH)
  const lines = r?.hunks[0]?.lines ?? []
  expect(lines.at(-1)?.mark).toBe('\\')
  expect(hunkSource(lines)).toBe('@@ -10,2 +10,4 @@\n keep\n+added one\n+added two\n keep')
  expect(hunkSource(lines.slice(-1))).toBe('')
})

test('a section with no ---/+++ lines is named by its diff --git line', () => {
  const n = parseNumstat(['0\t0\tsp ace/run.sh', '-\t-\tb.bin', ''].join('\0'))
  const patch = [
    'diff --git a/sp ace/run.sh b/sp ace/run.sh', 'old mode 100644', 'new mode 100755',
    'diff --git a/b.bin b/b.bin', 'index 1..2 100644', 'Binary files a/b.bin and b/b.bin differ', '',
  ].join('\n')
  // Swapped order defeats pairing by index; only the names can match them.
  const files = mergeDiff([n[1]!, n[0]!], patch)
  expect(files.map(f => [f.path, f.kind, f.isBinary])).toEqual([['b.bin', 'modified', true], ['sp ace/run.sh', 'mode', false]])
})

test('a file that becomes a symlink is one entry with both halves of its patch', () => {
  const patch = [
    'diff --git a/f b/f', 'deleted file mode 100644', 'index 1111111..0000000', '--- a/f', '+++ /dev/null', '@@ -1 +0,0 @@', '-x',
    'diff --git a/f b/f', 'new file mode 120000', 'index 0000000..2222222', '--- /dev/null', '+++ b/f', '@@ -0,0 +1 @@', '+a',
    '\\ No newline at end of file',
    'diff --git a/g b/g', '--- a/g', '+++ b/g', '@@ -1 +1 @@', '-1', '+2', '',
  ].join('\n')
  const files = mergeDiff(parseNumstat('1\t1\tf\0' + '1\t1\tg\0'), patch)
  expect(files.map(f => [f.path, f.kind])).toEqual([['f', 'typechange'], ['g', 'modified']])
  expect(files[0]?.hunks.flatMap(h => h.lines.map(l => l.mark + l.text))).toEqual(['-x', '+a', '\\ No newline at end of file'])
  expect(files[0]?.notes).toContain('file type changed')
})

test('a rename to a name git quotes is matched under its real name', () => {
  const patch = [
    'diff --git a/a.txt "b/say \\"hi\\".txt"', 'similarity index 80%', 'rename from a.txt', 'rename to "say \\"hi\\".txt"',
    '--- a/a.txt', '+++ "b/say \\"hi\\".txt"', '@@ -1 +1 @@', '-a', '+b', '',
  ].join('\n')
  const [f] = mergeDiff(parseNumstat('1\t1\t\0a.txt\0say "hi".txt\0'), patch)
  expect(f?.path).toBe('say "hi".txt')
  expect(f?.kind).toBe('renamed')
  expect(f?.hunks.length).toBe(1)
  // Every C escape git writes is read back, carriage return included.
  const [g] = mergeDiff(parseNumstat('1\t1\ta\rb\0'), 'diff --git "a/a\\rb" "b/a\\rb"\n--- "a/a\\rb"\n+++ "b/a\\rb"\n@@ -1 +1 @@\n-a\n+b\n')
  expect(g?.hunks.length).toBe(1)
})

test('a name with a space is matched though git ends its ---/+++ lines with a tab', () => {
  const patch = [
    'diff --git a/del me.txt b/del me.txt', 'deleted file mode 100644', 'index 1111111..0000000',
    '--- a/del me.txt\t', '+++ /dev/null', '@@ -1 +0,0 @@', '-d',
    'diff --git a/new one.txt b/new one.txt', 'new file mode 100644', 'index 0000000..2222222',
    '--- /dev/null', '+++ b/new one.txt\t', '@@ -0,0 +1 @@', '+n',
    'diff --git a/with space.txt b/with space.txt', 'index 3333333..4444444 100644',
    '--- a/with space.txt\t', '+++ b/with space.txt\t', '@@ -1 +1,2 @@', ' a', '+b',
    'diff --git "a/say \\"hi\\".txt" "b/say \\"hi\\".txt"', 'index 5555555..6666666 100644',
    '--- "a/say \\"hi\\".txt"\t', '+++ "b/say \\"hi\\".txt"\t', '@@ -1 +1 @@', '-x', '+y', '',
  ].join('\n')
  const numstat = ['0\t1\tdel me.txt', '1\t0\tnew one.txt', '1\t0\twith space.txt', '1\t1\tsay "hi".txt', ''].join('\0')
  const files = mergeDiff(parseNumstat(numstat), patch)
  expect(files.map(f => [f.path, f.kind, f.hunks.length])).toEqual([
    ['del me.txt', 'deleted', 1],
    ['new one.txt', 'added', 1],
    ['with space.txt', 'modified', 1],
    ['say "hi".txt', 'modified', 1],
  ])
  // The per-file fallback reads one section at a time through the same path.
  const [one] = mergeDiff(parseNumstat('1\t0\twith space.txt\0'), patch.slice(patch.indexOf('diff --git a/with')))
  expect(one?.hunks.length).toBe(1)
})
