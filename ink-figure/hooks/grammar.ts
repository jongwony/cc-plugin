// The grammar each mermaid kind is drawn from. The renderer reads more of mermaid than
// it draws faithfully: it parses a statement and then drops a part of it, draws one
// arrow as another, or lays two things over each other. So a fence is drawn only when
// every statement belongs to the forms below, each shown by a test to draw what it
// says; anything else keeps the whole fence as written. `labels` are the texts the
// drawing must show whole, `categories` the x-axis names it must show in order, and
// `chain` says a top-down drawing is safe at the compact vertical spacing: no edge
// label, and no node with more than one edge in or out.

export type Admitted = { labels: string[]; categories: string[]; chain: boolean }
export type Grammar = Admitted | { error: string }

const ID = String.raw`[\p{L}\p{N}_]+`
// label text: no markup the renderer reads as something else (entities, HTML,
// markdown strings, nested shapes, pipes, quotes)
const TEXT = String.raw`[^\[\](){}"|<>#\x60;]+`
const QUOTED = String.raw`"[^"<>#\x60]*"`

const statementsOf = (source: string): string[] =>
  source
    .split('\n')
    .map(l => l.trim())
    .filter(l => l !== '' && !l.startsWith('%%'))

const outside = (line: string): Grammar => ({ error: `a statement outside the drawn grammar: ${line}` })

const unquote = (s: string): string => (s.startsWith('"') ? s.slice(1, -1) : s).trim()

const pairOf = (a: string, b: string): string => [a, b].sort().join('\u0000')

// counts of edges in and out per node; `chain` holds when none exceeds one
const degrees = () => {
  const out = new Map<string, number>()
  const into = new Map<string, number>()
  return {
    add(from: string, to: string) {
      out.set(from, (out.get(from) ?? 0) + 1)
      into.set(to, (into.get(to) ?? 0) + 1)
    },
    chain: () => [...out.values(), ...into.values()].every(n => n <= 1),
  }
}

// flowchart: `graph`/`flowchart` LR, TD, TB, BT or none; nodes `A`, `A[text]`,
// `A(text)`, `A{text}` (text quoted or not); one `-->` edge per statement, with an
// optional one-word `|label|`; at most one edge between two nodes; style, class,
// click and accessibility statements, which draw nothing
const SHAPE = String.raw`(?:\[(${QUOTED}|${TEXT})\]|\((${QUOTED}|${TEXT})\)|\{(${QUOTED}|${TEXT})\})`
const NODE = String.raw`(${ID})${SHAPE}?`
const FLOW_HEADER = /^(?:flowchart|graph)(?:\s+(?:LR|TD|TB|BT))?\s*;?$/i
const FLOW_NODE = new RegExp(String.raw`^${NODE}\s*;?$`, 'u')
const FLOW_EDGE = new RegExp(String.raw`^${NODE}\s*-->\s*(?:\|([^|<>#"\x60\s]+)\|\s*)?${NODE}\s*;?$`, 'u')
const FLOW_SILENT = /^(?:(?:style|classDef|class|click|linkStyle)\s|acc(?:Title|Descr)\s*:)/

const flowchartOf = (lines: string[]): Grammar => {
  if (!FLOW_HEADER.test(lines[0] ?? '')) return outside(lines[0] ?? '')
  const text = new Map<string, string>()
  const edgeLabels: string[] = []
  const pairs = new Set<string>()
  const deg = degrees()
  let selfLoop = false
  const node = (id: string, ...shape: (string | undefined)[]) => {
    const label = shape.find(s => s !== undefined)
    if (label !== undefined) text.set(id, unquote(label))
    else if (!text.has(id)) text.set(id, id)
  }
  for (const line of lines.slice(1)) {
    if (FLOW_SILENT.test(line)) continue
    const edge = FLOW_EDGE.exec(line)
    if (edge) {
      const [, from, a1, a2, a3, label, to, b1, b2, b3] = edge
      node(from!, a1, a2, a3)
      node(to!, b1, b2, b3)
      if (from === to) selfLoop = true
      const pair = pairOf(from!, to!)
      if (pairs.has(pair)) return { error: `two edges between ${from} and ${to}` }
      pairs.add(pair)
      deg.add(from!, to!)
      if (label) edgeLabels.push(label)
      continue
    }
    const one = FLOW_NODE.exec(line)
    if (one) {
      node(one[1]!, one[2], one[3], one[4])
      continue
    }
    return outside(line)
  }
  const labels = [...text.values(), ...edgeLabels].filter(l => l !== '')
  return { labels, categories: [], chain: edgeLabels.length === 0 && !selfLoop && deg.chain() }
}

// state: `stateDiagram`/`stateDiagram-v2`; `direction LR|TB`; `A --> B` between
// states or `[*]`, with an optional label; `state "text" as A`; `A : text`; at most
// one transition between two states; no composite state, note, fork or choice
const STATE = String.raw`(\[\*\]|${ID})`
const STATE_HEADER = /^stateDiagram(?:-v2)?\s*$/
const STATE_DIRECTION = /^direction\s+(?:LR|TB)\s*$/
const STATE_EDGE = new RegExp(String.raw`^${STATE}\s*-->\s*${STATE}\s*(?::\s*(${TEXT}))?$`, 'u')
const STATE_ALIAS = new RegExp(String.raw`^state\s+(${QUOTED})\s+as\s+(${ID})$`, 'u')
const STATE_TEXT = new RegExp(String.raw`^(${ID})\s*:\s*(${TEXT})$`, 'u')

const stateOf = (lines: string[]): Grammar => {
  if (!STATE_HEADER.test(lines[0] ?? '')) return outside(lines[0] ?? '')
  const names = new Map<string, string>()
  const described = new Set<string>()
  const texts: string[] = []
  const edgeLabels: string[] = []
  const pairs = new Set<string>()
  const deg = degrees()
  let selfLoop = false
  const state = (id: string) => {
    if (id !== '[*]' && !names.has(id)) names.set(id, id)
  }
  for (const line of lines.slice(1)) {
    if (STATE_DIRECTION.test(line)) continue
    const edge = STATE_EDGE.exec(line)
    if (edge) {
      const [, rawFrom, rawTo, label] = edge
      const from = rawFrom === '[*]' ? '[*]start' : rawFrom!
      const to = rawTo === '[*]' ? '[*]end' : rawTo!
      state(rawFrom!)
      state(rawTo!)
      if (from === to) selfLoop = true
      const pair = pairOf(from, to)
      if (pairs.has(pair)) return { error: `two transitions between ${rawFrom} and ${rawTo}` }
      pairs.add(pair)
      deg.add(from, to)
      if (label?.trim()) edgeLabels.push(label.trim())
      continue
    }
    const alias = STATE_ALIAS.exec(line)
    if (alias) {
      names.set(alias[2]!, unquote(alias[1]!))
      continue
    }
    const text = STATE_TEXT.exec(line)
    if (text) {
      state(text[1]!)
      described.add(text[1]!)
      texts.push(text[2]!.trim())
      continue
    }
    return outside(line)
  }
  // a state with a description and no `state "…" as` name is drawn as its description
  const shown = [...names].filter(([id, name]) => name !== id || !described.has(id)).map(([, name]) => name)
  const labels = [...shown, ...texts, ...edgeLabels].filter(l => l !== '')
  return { labels, categories: [], chain: edgeLabels.length === 0 && !selfLoop && deg.chain() }
}

// sequence: `participant A` or `participant A as text`; `A->>B: text` and
// `A-->>B: text`, a self-message included; nothing else (no note, block, activation,
// actor, numbering or other arrow)
const SEQ_PARTICIPANT = new RegExp(String.raw`^participant\s+(${ID})(?:\s+as\s+([^<>#;:"]+))?$`, 'u')
const SEQ_MESSAGE = new RegExp(String.raw`^(${ID})\s*(?:->>|-->>)\s*(${ID})\s*:([^<>#;"\x60]*)$`, 'u')

const sequenceOf = (lines: string[]): Grammar => {
  if (!/^sequenceDiagram\s*$/.test(lines[0] ?? '')) return outside(lines[0] ?? '')
  const names = new Map<string, string>()
  const texts: string[] = []
  for (const line of lines.slice(1)) {
    const participant = SEQ_PARTICIPANT.exec(line)
    if (participant) {
      names.set(participant[1]!, participant[2]?.trim() || participant[1]!)
      continue
    }
    const message = SEQ_MESSAGE.exec(line)
    if (message) {
      for (const id of [message[1]!, message[2]!]) if (!names.has(id)) names.set(id, id)
      if (message[3]!.trim()) texts.push(message[3]!.trim())
      continue
    }
    return outside(line)
  }
  return { labels: [...names.values(), ...texts], categories: [], chain: true }
}

// class: `class A`, `class A { … }`, `A : member`; a member is `Type name` or `name`,
// or a method with no parameters `name()` or `name() Type`, each with an optional
// visibility mark, no member name twice in a class; a relation `<|--`, `*--`,
// `o--`, `-->`, `..>` or `..|>` with an optional label. The relations form chains:
// no class sits above two others or below two, and none closes a cycle.
const MEMBER_ATTR = new RegExp(String.raw`^([+\-#~]?)(?:(${ID})\s+)?(${ID})$`, 'u')
const MEMBER_METHOD = new RegExp(String.raw`^([+\-#~]?)(${ID})\(\)(?:\s+(${ID}))?$`, 'u')
const CLASS_OPEN = new RegExp(String.raw`^class\s+(${ID})\s*(\{)?$`, 'u')
const CLASS_MEMBER = new RegExp(String.raw`^(${ID})\s*:\s*(.+)$`, 'u')
const CLASS_RELATION = new RegExp(String.raw`^(${ID})\s+(<\|--|\*--|o--|-->|\.\.>|\.\.\|>)\s+(${ID})\s*(?::\s*(${TEXT}))?$`, 'u')

const classOf = (lines: string[]): Grammar => {
  if (!/^classDiagram\s*$/.test(lines[0] ?? '')) return outside(lines[0] ?? '')
  const classes = new Set<string>()
  const members = new Map<string, Set<string>>()
  const labels: string[] = []
  const above = new Map<string, number>()
  const below = new Map<string, number>()
  const root = new Map<string, string>()
  const find = (c: string): string => {
    while (root.has(c) && root.get(c) !== c) c = root.get(c)!
    return c
  }
  const member = (owner: string, text: string): string | null => {
    const method = MEMBER_METHOD.exec(text)
    const attr = method ? null : MEMBER_ATTR.exec(text)
    if (!method && !attr) return text
    const [, vis, a, b] = (method ?? attr)!
    const name = method ? a! : b!
    const type = method ? b : a
    const seen = members.get(owner) ?? new Set<string>()
    if (seen.has(name)) return text
    seen.add(name)
    members.set(owner, seen)
    labels.push(type ? `${vis}${name}: ${type}` : `${vis}${name}`)
    return null
  }
  let open: string | null = null
  for (const line of lines.slice(1)) {
    if (open !== null) {
      if (line === '}') open = null
      else if (member(open, line) !== null) return outside(line)
      continue
    }
    const decl = CLASS_OPEN.exec(line)
    if (decl) {
      classes.add(decl[1]!)
      if (decl[2]) open = decl[1]!
      continue
    }
    const relation = CLASS_RELATION.exec(line)
    if (relation) {
      const [, left, op, right, label] = relation
      classes.add(left!)
      classes.add(right!)
      const [upper, lower] = op === '..|>' ? [right!, left!] : [left!, right!]
      above.set(upper, (above.get(upper) ?? 0) + 1)
      below.set(lower, (below.get(lower) ?? 0) + 1)
      if (above.get(upper)! > 1 || below.get(lower)! > 1) return { error: `${upper} or ${lower} takes part in two relations on one side` }
      const [ru, rl] = [find(upper), find(lower)]
      if (ru === rl) return { error: `the relation between ${left} and ${right} closes a cycle` }
      root.set(ru, rl)
      if (label?.trim()) labels.push(label.trim())
      continue
    }
    const one = CLASS_MEMBER.exec(line)
    if (one) {
      classes.add(one[1]!)
      if (member(one[1]!, one[2]!.trim()) !== null) return outside(line)
      continue
    }
    return outside(line)
  }
  return { labels: [...classes, ...labels], categories: [], chain: true }
}

// ER: a relationship `A ||--o{ B : label` (cardinalities `||`, `|o`, `}o`, `}|`
// on the left and their mirrors on the right, line `--` or `..`), an entity block
// `A { … }` of `type name` attributes; every entity in at most one relationship
const ER_RELATION = new RegExp(
  String.raw`^(${ID})\s+(?:\|\||\|o|\}o|\}\|)(?:--|\.\.)(?:\|\||o\||o\{|\|\{)\s+(${ID})\s*:\s*(${QUOTED}|[\p{L}\p{N}_-]+)$`,
  'u',
)
const ER_OPEN = new RegExp(String.raw`^(${ID})\s*\{$`, 'u')
const ER_ATTRIBUTE = new RegExp(String.raw`^(${ID})\s+(${ID})$`, 'u')

const erOf = (lines: string[]): Grammar => {
  if (!/^erDiagram\s*$/.test(lines[0] ?? '')) return outside(lines[0] ?? '')
  const entities = new Set<string>()
  const related = new Set<string>()
  const labels: string[] = []
  let open = false
  for (const line of lines.slice(1)) {
    if (open) {
      if (line === '}') open = false
      else {
        const attribute = ER_ATTRIBUTE.exec(line)
        if (!attribute) return outside(line)
        labels.push(`${attribute[1]} ${attribute[2]}`)
      }
      continue
    }
    const block = ER_OPEN.exec(line)
    if (block) {
      entities.add(block[1]!)
      open = true
      continue
    }
    const relation = ER_RELATION.exec(line)
    if (relation) {
      const [, a, b, label] = relation
      for (const e of [a!, b!]) {
        if (related.has(e)) return { error: `${e} takes part in two relationships` }
        related.add(e)
        entities.add(e)
      }
      if (a === b) return { error: `${a} relates to itself` }
      const text = unquote(label!)
      if (text) labels.push(text)
      continue
    }
    return outside(line)
  }
  return { labels: [...entities, ...labels], categories: [], chain: true }
}

// xychart: `xychart` or `xychart-beta`, upright; a quoted `title`; `x-axis [a, b]`
// with no axis title; `y-axis min --> max` in integers with no axis title; one
// `line` series of integers. No bars, second series, horizontal orientation,
// axis title or fractional value.
const INT = String.raw`-?\d{1,12}`
const CHART_HEADER = /^xychart(?:-beta)?\s*$/
const CHART_TITLE = /^title\s+"([^"]+)"$/
const CHART_X = /^x-axis\s*\[([^\[\]"]*)\]$/
const CHART_Y = new RegExp(String.raw`^y-axis\s+${INT}\s*-->\s*${INT}$`)
const CHART_LINE = new RegExp(String.raw`^line\s*\[\s*${INT}(?:\s*,\s*${INT})*\s*\]$`)

const chartOf = (lines: string[]): Grammar => {
  if (!CHART_HEADER.test(lines[0] ?? '')) return outside(lines[0] ?? '')
  const labels: string[] = []
  let categories: string[] = []
  let series = 0
  for (const line of lines.slice(1)) {
    const title = CHART_TITLE.exec(line)
    if (title) {
      labels.push(title[1]!.trim())
      continue
    }
    const x = CHART_X.exec(line)
    if (x) {
      categories = x[1]!.split(',').map(c => c.trim())
      if (categories.some(c => c === '')) return outside(line)
      continue
    }
    if (CHART_Y.test(line)) continue
    if (CHART_LINE.test(line)) {
      if (++series > 1) return { error: 'a second series' }
      continue
    }
    return outside(line)
  }
  return { labels, categories, chain: true }
}

const GRAMMARS: Record<string, (lines: string[]) => Grammar> = {
  flowchart: flowchartOf,
  state: stateOf,
  sequence: sequenceOf,
  class: classOf,
  er: erOf,
  xychart: chartOf,
}

export const grammarOf = (source: string, kind: string): Grammar => {
  const grammar = GRAMMARS[kind]
  return grammar ? grammar(statementsOf(source)) : { error: `${kind} diagrams are not drawn` }
}

const escaped = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// what the drawing must show for the grammar to have drawn faithfully: every label
// whole, and the categories in order on one row with space between them
export const faithfulTo = (admitted: Admitted, art: readonly string[]): string | null => {
  const all = art.join('\n')
  for (const label of admitted.labels) if (!all.includes(label)) return `the drawing lost "${label}"`
  if (admitted.categories.length > 0) {
    const row = new RegExp(String.raw`(?:^|\s)${admitted.categories.map(escaped).join(String.raw`\s+`)}(?:\s|$)`)
    if (!art.some(line => row.test(line))) return 'the drawing ran the categories together'
  }
  return null
}
