// Parsers for `git diff --numstat -z` and `git diff -p`, and the merge of the
// two into one inventory. Pure: no `$`.

export type FileKind = 'modified' | 'added' | 'deleted' | 'renamed' | 'copied' | 'mode' | 'untracked'

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
}

/** Splits a patch into per-file sections at each `diff --git` line. */
function sections(patch: string): Section[] {
  const out: Section[] = []
  let cur: Section | undefined
  let hunk: Hunk | undefined
  let oldNo = 0
  let newNo = 0
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
      oldNo = Number(m[1])
      newNo = Number(m[3])
      hunk = { header: line.slice(0, line.indexOf(' @@') + 3), section: clean(m[5] ?? ''), lines: [] }
      cur.hunks.push(hunk)
      continue
    }
    if (!hunk) {
      cur.headerLines.push(line)
      if (line.startsWith('+++ ')) cur.plusPath = stripPrefix(line.slice(4))
      if (line.startsWith('--- ')) cur.minusPath = stripPrefix(line.slice(4))
      continue
    }
    const mark = line[0]
    if (mark === ' ' || mark === '+' || mark === '-' || mark === '\\') {
      hunk.lines.push({ mark, text: clean(line.slice(1)), oldNo, newNo })
      if (mark === ' ') {
        oldNo += 1
        newNo += 1
      } else if (mark === '-') oldNo += 1
      else if (mark === '+') newNo += 1
    } else if (line === '') {
      // A trailing newline of the whole patch; an empty context line keeps its space.
    } else {
      hunk = undefined
      cur.headerLines.push(line)
    }
  }
  return out
}

function stripPrefix(p: string): string | undefined {
  if (p === '/dev/null') return undefined
  const unq = p.startsWith('"') ? unquote(p) : p
  return unq.replace(/^[abciwo]\//, '')
}

/** Git's C-style quoting of a path with special characters. */
function unquote(p: string): string {
  const body = p.slice(1, p.endsWith('"') ? -1 : undefined)
  return body.replace(/\\(["\\tn]|[0-7]{3})/g, (_, c: string) =>
    c === 't' ? '\t' : c === 'n' ? '\n' : c.length === 3 ? String.fromCharCode(parseInt(c, 8)) : c,
  )
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
      oldPath = l.slice('rename from '.length)
    } else if (l.startsWith('rename to ')) path = l.slice('rename to '.length)
    else if (l.startsWith('copy from ')) {
      kind = 'copied'
      oldPath = l.slice('copy from '.length)
    } else if (l.startsWith('copy to ')) path = l.slice('copy to '.length)
    else if (l.startsWith('old mode ')) oldMode = l.slice('old mode '.length)
    else if (l.startsWith('new mode ')) notes.push(`mode ${oldMode ?? '?'} → ${l.slice('new mode '.length)}`)
    else if (l.startsWith('Binary files ') || l === 'GIT binary patch') isBinary = true
    else if (l.startsWith('similarity index ')) notes.push(l)
  }
  if (kind === 'modified' && s.hunks.length === 0 && notes.some(n => n.startsWith('mode '))) kind = 'mode'
  if (isBinary) notes.push('binary file')
  return { kind, notes: notes.map(clean), isBinary, oldPath, path: path ?? s.plusPath ?? s.minusPath }
}

/**
 * Joins the numstat inventory with the patch. The inventory is authoritative:
 * an entry with no hunks (binary, mode-only, pure rename) stays listed. Both
 * come from one diff invocation's options, so their order agrees; a count
 * mismatch falls back to matching by path.
 */
export function mergeDiff(numstat: NumstatEntry[], patch: string): FileDiff[] {
  const secs = sections(patch).map(s => ({ ...describe(s), hunks: s.hunks }))
  const byIndex = secs.length === numstat.length
  const byPath = new Map(secs.map(s => [s.path ?? '', s]))
  return numstat.map((n, i) => {
    const s = byIndex ? secs[i] : byPath.get(n.path)
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
 * starts mid-hunk.
 */
export function hunkSource(lines: readonly DiffLine[]): string {
  const first = lines[0]
  if (!first) return ''
  const oldCount = lines.filter(l => l.mark === ' ' || l.mark === '-').length
  const newCount = lines.filter(l => l.mark === ' ' || l.mark === '+').length
  const oldStart = oldCount === 0 ? Math.max(0, first.oldNo - 1) : first.oldNo
  const newStart = newCount === 0 ? Math.max(0, first.newNo - 1) : first.newNo
  const head = `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`
  return [head, ...lines.map(l => l.mark + l.text)].join('\n')
}
