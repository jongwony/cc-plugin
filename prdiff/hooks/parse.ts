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

/** Characters a Text or Code refuses: every control character but tab. */
const CONTROL = /[\u0000-\u0008\u000a-\u001f\u007f-\u009f]/g

export function clean(text: string): string {
  return text.replace(CONTROL, '\ufffd')
}

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/

type Section = {
  hunks: Hunk[]
  isBinary: boolean
  /** A removed and an added line of one hunk differ only in a trailing CR. */
  eol: boolean
}

/** Splits a patch into per-file sections at each `diff --git` line, in the order git wrote them. */
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
      cur = { hunks: [], isBinary: false, eol: false }
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
      if (line.startsWith('Binary files ') || line === 'GIT binary patch') cur.isBinary = true
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
    }
  }
  return out
}

/** One file of `git diff --raw --numstat -z`: its raw record and its numstat counts. */
export type Entry = {
  /** The raw status letter: A, C, D, M, R, T, U or X. */
  status: string
  /** Similarity of a rename or copy, in percent. */
  score?: number
  oldMode: string
  newMode: string
  path: string
  oldPath?: string
  added: number
  deleted: number
  isBinary: boolean
}

/**
 * `git diff --raw --numstat -p -z`: every raw record, then every numstat
 * record in the same order, then the patch. `isWhole` is false when the
 * output stops inside the records.
 */
export function parseDiff(z: string): { entries: Entry[]; patch: string; isWhole: boolean } {
  const parts = z.split('\0')
  const entries: Entry[] = []
  let i = 0
  while (parts[i]?.startsWith(':')) {
    const m = /^:(\d+) (\d+) \S+ \S+ ([A-Z])(\d*)$/.exec(parts[i] ?? '')
    if (!m) return { entries, patch: '', isWhole: false }
    const status = m[3] ?? 'M'
    const two = status === 'R' || status === 'C'
    const first = parts[i + 1]
    const second = two ? parts[i + 2] : undefined
    if (first === undefined || (two && second === undefined)) return { entries, patch: '', isWhole: false }
    entries.push({
      status,
      score: m[4] ? Number(m[4]) : undefined,
      oldMode: m[1] ?? '',
      newMode: m[2] ?? '',
      path: second ?? first,
      oldPath: two ? first : undefined,
      added: 0,
      deleted: 0,
      isBinary: false,
    })
    i += two ? 3 : 2
  }
  for (const e of entries) {
    const m = /^(-|\d+)\t(-|\d+)\t/.exec(parts[i] ?? '')
    if (!m) return { entries, patch: '', isWhole: false }
    e.isBinary = m[1] === '-' && m[2] === '-'
    e.added = e.isBinary ? 0 : Number(m[1])
    e.deleted = e.isBinary ? 0 : Number(m[2])
    i += parts[i]?.length === m[0].length ? 3 : 1
  }
  if (parts[i] === '') i += 1
  return { entries, patch: parts.slice(i).join('\0'), isWhole: true }
}

function kindOf(e: Entry, hunks: number): FileKind {
  switch (e.status) {
    case 'A':
      return 'added'
    case 'D':
      return 'deleted'
    case 'R':
      return 'renamed'
    case 'C':
      return 'copied'
    case 'T':
      return 'typechange'
    default:
      return e.oldMode !== e.newMode && hunks === 0 ? 'mode' : 'modified'
  }
}

/** Sections an entry takes in the patch: a type change is written as a deletion and an addition. */
function sectionCount(e: Entry): number {
  return e.status === 'T' ? 2 : 1
}

/** One file from its entry and the patch sections git wrote for it. */
function fileOf(e: Entry, secs: readonly Section[]): FileDiff {
  const hunks = secs.flatMap(s => s.hunks)
  const kind = kindOf(e, hunks.length)
  const isBinary = e.isBinary || secs.some(s => s.isBinary)
  const notes = [
    ...(kind === 'typechange' ? ['file type changed'] : []),
    ...(e.status === 'M' && e.oldMode !== e.newMode ? [`mode ${e.oldMode} → ${e.newMode}`] : []),
    ...(e.score !== undefined && (kind === 'renamed' || kind === 'copied') ? [`similarity index ${e.score}%`] : []),
    ...(isBinary ? ['binary file'] : []),
    ...(secs.some(s => s.eol) ? ['line endings changed'] : []),
  ]
  return {
    path: clean(e.path),
    oldPath: e.oldPath === undefined ? undefined : clean(e.oldPath),
    kind,
    added: e.added,
    deleted: e.deleted,
    isBinary,
    notes,
    hunks,
  }
}

/**
 * The files of a parsed diff, its patch sections taken in entry order. With
 * `isCut` the patch stopped early: the last section may be partial, so it
 * and every entry after it come back `undefined`, to be read again.
 */
export function filesOf(entries: readonly Entry[], patch: string, isCut = false): Array<FileDiff | undefined> {
  const secs = sections(patch)
  if (isCut) secs.pop()
  // Pairing by order holds only while git wrote the sections the entries call for.
  if (!isCut && secs.length !== entries.reduce((n, e) => n + sectionCount(e), 0)) return entries.map(() => undefined)
  let at = 0
  return entries.map(e => {
    const n = sectionCount(e)
    const mine = secs.slice(at, at + n)
    at += n
    return mine.length === n ? fileOf(e, mine) : undefined
  })
}

/** One entry's file from a patch read for that entry alone. */
export function fileFor(e: Entry, patch: string): FileDiff {
  return fileOf(e, sections(patch))
}

/** A file the working tree holds that git does not track, shown as added. */
export function untrackedFile(path: string, patch: string | undefined, note?: string): FileDiff {
  const secs = patch ? sections(patch) : []
  const hunks = secs[0]?.hunks ?? []
  const added = hunks.reduce((n, h) => n + h.lines.filter(l => l.mark === '+').length, 0)
  const isBinary = secs[0]?.isBinary ?? false
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
