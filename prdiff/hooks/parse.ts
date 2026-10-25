// Parsers for `git diff --numstat -z` and `git diff -p`, and the merge of the
// two into one inventory. Pure: no `$`.

export type FileKind = 'modified' | 'added' | 'deleted' | 'renamed' | 'copied' | 'mode' | 'typechange' | 'untracked'

export type DiffLine = {
  /** ' ', '+', '-' or '\\' (no newline at end of file). */
  mark: ' ' | '+' | '-' | '\\'
  text: string
  /** Old/new line cursors before this line, as the hunk header counts them. */
  oldNo: number
  newNo: number
}

export type Hunk = {
  header: string
  section: string
  lines: DiffLine[]
}

export type FileDiff = {
  path: string
  oldPath?: string
  kind: FileKind
  added: number
  deleted: number
  isBinary: boolean
  notes: string[]
  hunks: Hunk[]
}

export type NumstatEntry = {
  path: string
  oldPath?: string
  added: number
  deleted: number
  isBinary: boolean
}

/** Characters a Text or Code refuses: every control character but tab. */
const CONTROL = /[\u0000-\u0008\u000a-\u001f\u007f-\u009f]/g

export function clean(text: string): string {
  return text.replace(CONTROL, '\ufffd')
}

/**
 * `git diff --numstat -z`: `added\tdeleted\tpath\0`, or for a rename or copy
 * `added\tdeleted\t\0old\0new\0`; binary files count `-\t-`.
 */
export function parseNumstat(z: string): NumstatEntry[] {
  const parts = z.split('\0')
  const out: NumstatEntry[] = []
  let i = 0
  while (i < parts.length) {
    const head = parts[i]
    i += 1
    if (head === undefined || head === '') continue
    const m = /^(-|\d+)\t(-|\d+)\t(.*)$/s.exec(head)
    if (!m) continue
    const [, a = '0', d = '0', rest = ''] = m
    const isBinary = a === '-' && d === '-'
    const added = isBinary ? 0 : Number(a)
    const deleted = isBinary ? 0 : Number(d)
    if (rest === '') {
      const oldPath = parts[i] ?? ''
      const path = parts[i + 1] ?? ''
      i += 2
      out.push({ path, oldPath, added, deleted, isBinary })
    } else {
      out.push({ path: rest, added, deleted, isBinary })
    }
  }
  return out
}

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/

type Section = {
  headerLines: string[]
  hunks: Hunk[]
  plusPath?: string
  minusPath?: string
  /** A removed and an added line of one hunk differ only in a trailing CR. */
  eol?: boolean
}

/** Splits a patch into per-file sections at each `diff --git` line. */
function sections(patch: string): Section[] {
  const out: Section[] = []
  let cur: Section | undefined
  let hunk: Hunk | undefined
  let oldNo = 0
  let newNo = 0
  // Lines the hunk header still owes on each side.
  let oldLeft = 0
  let newLeft = 0
  // The current hunk's removed and added texts, each with whether it ended in CR.
  let seen = { '-': new Map<string, Set<boolean>>(), '+': new Map<string, Set<boolean>>() }
  for (const raw of patch.split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
    if (line.startsWith('diff --git ') || line.startsWith('diff --cc ')) {
      cur = { headerLines: [line], hunks: [] }
      hunk = undefined
      out.push(cur)
      continue
    }
    if (!cur) continue
    const m = HUNK.exec(line)
    if (m) {
      oldLeft = m[2] === undefined ? 1 : Number(m[2])
      newLeft = m[4] === undefined ? 1 : Number(m[4])
      // A side that counts 0 lines names the line before the change.
      oldNo = Number(m[1]) + (oldLeft === 0 ? 1 : 0)
      newNo = Number(m[3]) + (newLeft === 0 ? 1 : 0)
      hunk = { header: line.slice(0, line.indexOf(' @@') + 3), section: clean(m[5] ?? ''), lines: [] }
      seen = { '-': new Map(), '+': new Map() }
      cur.hunks.push(hunk)
      continue
    }
    if (!hunk) {
      cur.headerLines.push(line)
      if (line.startsWith('+++ ')) cur.plusPath = stripPrefix(markerPath(line))
      if (line.startsWith('--- ')) cur.minusPath = stripPrefix(markerPath(line))
      continue
    }
    // An empty line inside a hunk that still owes lines on both sides is an
    // empty context line written without its space; otherwise it is the
    // patch's trailing newline.
    const mark = line === '' && oldLeft > 0 && newLeft > 0 ? ' ' : line[0]
    if (mark === ' ' || mark === '+' || mark === '-' || mark === '\\') {
      hunk.lines.push({ mark, text: clean(line.slice(1)), oldNo, newNo })
      if (mark === '-' || mark === '+') {
        const cr = raw.endsWith('\r')
        const text = line.slice(1)
        if (seen[mark === '-' ? '+' : '-'].get(text)?.has(!cr)) cur.eol = true
        seen[mark].set(text, (seen[mark].get(text) ?? new Set<boolean>()).add(cr))
      }
      if (mark === ' ') {
        oldNo += 1
        newNo += 1
        oldLeft -= 1
        newLeft -= 1
      } else if (mark === '-') {
        oldNo += 1
        oldLeft -= 1
      } else if (mark === '+') {
        newNo += 1
        newLeft -= 1
      }
    } else if (line === '') {
      // The trailing newline of the whole patch.
    } else {
      hunk = undefined
      cur.headerLines.push(line)
    }
  }
  return out
}

/**
 * The path a `diff --git a/X b/X` line names when both sides are one path, the
 * only form a section without `---`/`+++` (mode-only, binary) can name it in.
 */
function gitLinePath(line: string): string | undefined {
  const rest = line.slice('diff --git '.length)
  if (rest.startsWith('"')) {
    const m = /^("(?:[^"\\]|\\.)*") ("(?:[^"\\]|\\.)*")$/.exec(rest)
    const a = m?.[1] ? stripPrefix(m[1]) : undefined
    const b = m?.[2] ? stripPrefix(m[2]) : undefined
    return a !== undefined && a === b ? a : undefined
  }
  if (rest.length % 2 === 0) return undefined
  const half = (rest.length - 1) / 2
  const a = rest.slice(0, half)
  const b = rest.slice(half + 1)
  return a.startsWith('a/') && b.startsWith('b/') && a.slice(2) === b.slice(2) ? a.slice(2) : undefined
}

/** The path of a `---`/`+++` line, less the tab git ends it with when the name holds a space. */
function markerPath(line: string): string {
  const p = line.slice(4)
  return p.endsWith('\t') ? p.slice(0, -1) : p
}

function stripPrefix(p: string): string | undefined {
  if (p === '/dev/null') return undefined
  const unq = p.startsWith('"') ? unquote(p) : p
  return unq.replace(/^[abciwo]\//, '')
}

const ESCAPES: Record<string, string> = { a: '\x07', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v' }

/** Git's C-style quoting of a path with special characters. */
function unquote(p: string): string {
  const body = p.slice(1, p.endsWith('"') ? -1 : undefined)
  return body.replace(/\\(["\\abfnrtv]|[0-7]{3})/g, (_, c: string) =>
    c.length === 3 ? String.fromCharCode(parseInt(c, 8)) : (ESCAPES[c] ?? c),
  )
}

/** A path as a `rename`/`copy` header line writes it: C-quoted when special. */
function headerPath(p: string): string {
  return p.startsWith('"') ? unquote(p) : p
}

function describe(s: Section): { kind: FileKind; notes: string[]; isBinary: boolean; oldPath?: string; path?: string } {
  const notes: string[] = []
  let kind: FileKind = 'modified'
  let isBinary = false
  let oldPath: string | undefined
  let path: string | undefined
  let oldMode: string | undefined
  for (const l of s.headerLines) {
    if (l.startsWith('new file mode')) kind = 'added'
    else if (l.startsWith('deleted file mode')) kind = 'deleted'
    else if (l.startsWith('rename from ')) {
      kind = 'renamed'
      oldPath = headerPath(l.slice('rename from '.length))
    } else if (l.startsWith('rename to ')) path = headerPath(l.slice('rename to '.length))
    else if (l.startsWith('copy from ')) {
      kind = 'copied'
      oldPath = headerPath(l.slice('copy from '.length))
    } else if (l.startsWith('copy to ')) path = headerPath(l.slice('copy to '.length))
    else if (l.startsWith('old mode ')) oldMode = l.slice('old mode '.length)
    else if (l.startsWith('new mode ')) notes.push(`mode ${oldMode ?? '?'} → ${l.slice('new mode '.length)}`)
    else if (l.startsWith('Binary files ') || l === 'GIT binary patch') isBinary = true
    else if (l.startsWith('similarity index ')) notes.push(l)
  }
  if (kind === 'modified' && s.hunks.length === 0 && notes.some(n => n.startsWith('mode '))) kind = 'mode'
  if (isBinary) notes.push('binary file')
  if (s.eol) notes.push('line endings changed')
  const named = path ?? s.plusPath ?? s.minusPath ?? (s.headerLines[0] ? gitLinePath(s.headerLines[0]) : undefined)
  return { kind, notes: notes.map(clean), isBinary, oldPath, path: named }
}

type Described = ReturnType<typeof describe> & { hunks: Hunk[] }

/**
 * A file whose type changes (regular file to symlink, or back) is one numstat
 * entry but two sections, deleted then added; they become one section.
 */
function typechanges(secs: Described[]): Described[] {
  const out: Described[] = []
  for (const s of secs) {
    const prev = out.at(-1)
    if (prev && prev.kind === 'deleted' && s.kind === 'added' && prev.path !== undefined && prev.path === s.path) {
      out[out.length - 1] = {
        kind: 'typechange',
        notes: ['file type changed', ...[...prev.notes, ...s.notes].filter((n, i, all) => all.indexOf(n) === i)],
        isBinary: prev.isBinary || s.isBinary,
        path: s.path,
        hunks: [...prev.hunks, ...s.hunks],
      }
    } else out.push(s)
  }
  return out
}

/**
 * Joins the numstat inventory with the patch. The inventory is authoritative:
 * an entry with no hunks (binary, mode-only, pure rename) stays listed. A
 * section is paired with the entry at its index only when their paths agree;
 * otherwise it is found by path.
 */
export function mergeDiff(numstat: NumstatEntry[], patch: string): FileDiff[] {
  const secs = typechanges(sections(patch).map(s => ({ ...describe(s), hunks: s.hunks })))
  const byPath = new Map(secs.map(s => [s.path ?? '', s]))
  return numstat.map((n, i) => {
    const at = secs[i]
    const s = at !== undefined && at.path === n.path ? at : byPath.get(n.path)
    const kind: FileKind = s?.kind ?? (n.oldPath !== undefined ? 'renamed' : 'modified')
    return {
      path: clean(n.path),
      oldPath: n.oldPath === undefined ? undefined : clean(n.oldPath),
      kind,
      added: n.added,
      deleted: n.deleted,
      isBinary: n.isBinary || (s?.isBinary ?? false),
      notes: s ? s.notes : ['no patch text for this file'],
      hunks: s?.hunks ?? [],
    }
  })
}

/** A file the working tree holds that git does not track, shown as added. */
export function untrackedFile(path: string, patch: string | undefined, note?: string): FileDiff {
  const secs = patch ? sections(patch) : []
  const hunks = secs[0]?.hunks ?? []
  const added = hunks.reduce((n, h) => n + h.lines.filter(l => l.mark === '+').length, 0)
  const isBinary = secs[0] ? describe(secs[0]).isBinary : false
  const notes = ['untracked', ...(isBinary ? ['binary file'] : []), ...(note ? [note] : [])]
  return { path: clean(path), kind: 'untracked', added, deleted: 0, isBinary, notes, hunks }
}

/**
 * A unified-diff source for a run of one hunk's lines, with a header that
 * numbers that run, so `Code format="diff"` gutters stay true when a window
 * starts mid-hunk. `\` lines are left out; a run with no content line gives ''.
 */
export function hunkSource(all: readonly DiffLine[]): string {
  const lines = all.filter(l => l.mark !== '\\')
  const first = lines[0]
  if (!first) return ''
  const oldCount = lines.filter(l => l.mark === ' ' || l.mark === '-').length
  const newCount = lines.filter(l => l.mark === ' ' || l.mark === '+').length
  const oldStart = oldCount === 0 ? Math.max(0, first.oldNo - 1) : first.oldNo
  const newStart = newCount === 0 ? Math.max(0, first.newNo - 1) : first.newNo
  const head = `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`
  return [head, ...lines.map(l => l.mark + l.text)].join('\n')
}
