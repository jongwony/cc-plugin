import { expect, test } from 'claude-code/testing'
import { drawn, plainOf } from '../hooks/diagrams.ts'
import { piecesOf } from '../hooks/figures.ts'

// Each allowed statement form draws what it says; each form the renderer was found
// to draw wrongly keeps its whole fence.

const art = (source: string): string[] => {
  const r = drawn(source, 200)
  if (!('lines' in r)) throw new Error(r.error)
  return r.lines.map(plainOf)
}
const kept = (source: string): boolean => piecesOf('Before.\n\n```mermaid\n' + source + '\n```', 200) === null
const rowOf = (lines: string[], text: string): number => lines.findIndex(l => l.includes(text))
const colOf = (lines: string[], text: string): number => lines[rowOf(lines, text)]!.indexOf(text)

// ── flowchart ────────────────────────────────────────────────────────────────

test('flowchart: every allowed node shape draws its text, and `-->` draws an arrow from source to target', () => {
  const lines = art('graph LR\n  A[square] --> B(round)\n  B --> C{decide}\n  C --> D["quoted: text"]')
  for (const label of ['square', 'round', 'decide', 'quoted: text']) expect(rowOf(lines, label)).toBeGreaterThan(-1)
  const row = lines[rowOf(lines, 'square')]!
  expect(/square ├──►│ +round ├──►│ +decide ├──►│ +quoted: text/.test(row)).toBe(true)
})

test('flowchart: a one-word edge label is drawn on its edge', () => {
  const lines = art('graph LR\n  A[ask] -->|yes| B[go]')
  expect(lines.some(l => /ask ├─*yes─*►│ +go/.test(l))).toBe(true)
})

test('flowchart: LR draws left to right; an unbranched unlabelled TD or BT chain stays vertical, its arrows the right way', () => {
  const lr = art('graph LR\n  A[first] --> B[second]')
  expect(colOf(lr, 'first')).toBeLessThan(colOf(lr, 'second'))
  const td = art(`graph TD\n  A[${'a'.repeat(100)}] --> B[${'b'.repeat(100)}]`)
  expect(rowOf(td, 'aaaa')).toBeLessThan(rowOf(td, 'bbbb'))
  expect(td.some(l => l.trim() === '▼')).toBe(true)
  const bt = art('flowchart BT\n  A[start] --> B[middle]\n  B --> C[end]')
  expect(rowOf(bt, 'start')).toBeGreaterThan(rowOf(bt, 'middle'))
  expect(rowOf(bt, 'middle')).toBeGreaterThan(rowOf(bt, 'end'))
  expect(bt.some(l => l.trim() === '▲')).toBe(true)
})

test('flowchart: a top-down source with a label or a branch is drawn sideways, never at the vertical spacing that breaks it', () => {
  const lines = art('graph TD\n  A{ok?} -->|yes| B[go]\n  A -->|no| C[stop]')
  expect(rowOf(lines, 'ok?')).toBe(rowOf(lines, 'go'))
  expect(lines.some(l => /ok\? ├─*yes─*►│ +go/.test(l))).toBe(true)
  expect(lines.some(l => l.includes('◇─yes─◇'))).toBe(false)
})

test('flowchart: a vertical layout kept with a branch or a label keeps the fence', () => {
  expect(kept('flowchart BT\n  A --> B\n  A --> C')).toBe(true)
  expect(kept('flowchart BT\n  A -->|up| B')).toBe(true)
})

test('flowchart: graph RL, drawn reversed, keeps the fence', () => {
  expect(kept('graph RL\n  A[from] --> B[to]')).toBe(true)
})

test('flowchart: an edge to or from a subgraph, or any subgraph, keeps the fence', () => {
  expect(kept('graph LR\n  subgraph S\n    A --> B\n  end\n  C --> S')).toBe(true)
  expect(kept('graph LR\n  subgraph S\n    A --> B\n  end')).toBe(true)
})

test('flowchart: two edges between one pair, either way round, keep the fence', () => {
  expect(kept('graph LR\n  A -->|go| B\n  B -->|back| A')).toBe(true)
  expect(kept('graph LR\n  A --> B\n  A --> B')).toBe(true)
})

test('flowchart: an edge label with a space, which draws as line, keeps the fence', () => {
  expect(kept('graph LR\n  A -->|yes please| B')).toBe(true)
})

test('flowchart: other edge shapes, chains, `&`, and other node shapes keep the fence', () => {
  for (const source of [
    'graph LR\n  A --> B\n  A -.-> C',
    'graph LR\n  A ==> B',
    'graph LR\n  A --- B',
    'graph LR\n  A -- text --> B',
    'graph LR\n  A --> B --> C',
    'graph LR\n  A & B --> C',
    'graph LR\n  A([stadium]) --> B',
    'graph LR\n  A((circle)) --> B',
    'graph LR\n  A[line<br/>break] --> B',
    'graph LR\n  A:::warm --> B',
  ])
    expect(kept(source)).toBe(true)
})

// ── state ────────────────────────────────────────────────────────────────────

test('state: start, end, transitions with labels, names and descriptions draw', () => {
  const lines = art('stateDiagram-v2\n  state "Waiting room" as W\n  [*] --> W\n  W --> Run: start\n  Run --> [*]\n  Run : working')
  for (const label of ['Waiting room', 'start', 'working']) expect(rowOf(lines, label)).toBeGreaterThan(-1)
  expect(lines.some(l => l.includes('●'))).toBe(true)
  expect(lines.some(l => l.includes('╔'))).toBe(true)
})

test('state: a branching diagram is drawn sideways, each transition an arrow', () => {
  const lines = art('stateDiagram-v2\n  [*] --> A\n  A --> B\n  A --> C\n  B --> D\n  C --> D')
  expect(colOf(lines, ' A ')).toBeLessThan(colOf(lines, ' B '))
  expect(lines.join('\n').match(/[►▲▼◄]/g)!.length).toBe(5)
})

test('state: a transition to or from a composite state keeps the fence', () => {
  expect(kept('stateDiagram-v2\n  [*] --> Idle\n  Idle --> Busy\n  state Busy {\n    Load --> Work\n  }')).toBe(true)
})

test('state: transitions both ways between two states, or a kept vertical layout with a branch, keep the fence', () => {
  expect(kept('stateDiagram-v2\n  [*] --> Idle\n  Idle --> Run: start\n  Run --> Idle: stop')).toBe(true)
  expect(kept('stateDiagram-v2\n  direction TB\n  A --> B\n  A --> C')).toBe(true)
})

test('state: notes, forks and choices keep the fence', () => {
  for (const source of [
    'stateDiagram-v2\n  A --> B\n  note right of A: hi',
    'stateDiagram-v2\n  state c <<choice>>\n  A --> c',
    'stateDiagram-v2\n  state f <<fork>>\n  A --> f',
  ])
    expect(kept(source)).toBe(true)
})

// ── sequence ─────────────────────────────────────────────────────────────────

test('sequence: participants, `->>` solid and `-->>` dashed messages, and a self-message draw', () => {
  const lines = art('sequenceDiagram\n  participant A as Alice\n  participant B\n  A->>B: hello there\n  B-->>A: ok\n  A->>A: think')
  for (const label of ['Alice', 'hello there', 'ok', 'think']) expect(rowOf(lines, label)).toBeGreaterThan(-1)
  expect(lines[rowOf(lines, 'hello there') + 1]!.trim()).toMatch(/^│─+▶$/)
  expect(lines[rowOf(lines, 'ok') + 1]!.trim()).toMatch(/^◀╌+│$/)
  expect(lines.some(l => /◀───┘/.test(l))).toBe(true)
})

test('sequence: an `-x`/`--x` message, or another arrow drawn like an open one, keeps the fence', () => {
  for (const arrow of ['-x', '--x', '->', '-->', '-)', '--)']) expect(kept(`sequenceDiagram\n  A${arrow}B: dropped`)).toBe(true)
})

test('sequence: a note, before or after the first message, keeps the fence', () => {
  expect(kept('sequenceDiagram\n  Note over A: Critical warning\n  A->>B: hi')).toBe(true)
  expect(kept('sequenceDiagram\n  A->>B: hi\n  Note over A,B: shared')).toBe(true)
})

test('sequence: alt, opt and nested blocks keep the fence', () => {
  expect(kept('sequenceDiagram\n  alt request is authenticated and quota remains\n  A->>B: hi\n  end')).toBe(true)
  expect(kept('sequenceDiagram\n  alt A\n  opt B\n  A->>B: hi\n  end\n  end')).toBe(true)
  expect(kept('sequenceDiagram\n  loop every second\n  A->>B: hi\n  end')).toBe(true)
})

test('sequence: a `<br/>` in a message, activation, an actor, or numbering keeps the fence', () => {
  for (const source of [
    'sequenceDiagram\n  A->>A: first<br/>second',
    'sequenceDiagram\n  A->>B: hi\n  activate B\n  B-->>A: ok\n  deactivate B',
    'sequenceDiagram\n  A->>+B: hi\n  B-->>-A: ok',
    'sequenceDiagram\n  actor U\n  U->>B: hi',
    'sequenceDiagram\n  autonumber\n  A->>B: hi',
  ])
    expect(kept(source)).toBe(true)
})

// ── class ────────────────────────────────────────────────────────────────────

test('class: attributes and parameterless methods draw in their compartments, visibility kept', () => {
  const lines = art('classDiagram\n  class Animal {\n    +String name\n    -int age\n    +eat() void\n    +sleep()\n  }')
  const at = (s: string) => rowOf(lines, s)
  for (const member of ['+name: String', '-age: int', '+eat: void', '+sleep']) expect(at(member)).toBeGreaterThan(-1)
  const rule = lines.findIndex((l, i) => i > at('-age: int') && l.includes('├'))
  expect(rule).toBeGreaterThan(at('-age: int'))
  expect(rule).toBeLessThan(at('+eat: void'))
})

test('class: each allowed relation draws its own end marker, the upper class above', () => {
  const lines = art('classDiagram\n  A <|-- B\n  C *-- D\n  E o-- F\n  G --> H : uses\n  I ..> J\n  K ..|> L')
  const top = rowOf(lines, '│ A │')
  const markers = lines[top + 2]!
  expect(markers.replace(/\s+/g, '')).toBe('△◆◇│┊△')
  expect(rowOf(lines, 'uses')).toBeGreaterThan(top)
  expect(lines.some(l => l.includes('▼'))).toBe(true)
  expect(rowOf(lines, '│ L │')).toBe(top)
  expect(rowOf(lines, '│ K │')).toBeGreaterThan(top)
})

test('class: a chain of relations draws each link', () => {
  const lines = art('classDiagram\n  A <|-- B\n  B <|-- C')
  expect(lines.filter(l => l.includes('△')).length).toBe(2)
  expect(rowOf(lines, '│ A │')).toBeLessThan(rowOf(lines, '│ B │'))
  expect(rowOf(lines, '│ B │')).toBeLessThan(rowOf(lines, '│ C │'))
})

test('class: a method with parameters, an overload, an undirected relation, multiplicity or a namespace keeps the fence', () => {
  for (const source of [
    'classDiagram\n  class A {\n    +send(message: String) bool\n  }',
    'classDiagram\n  class A {\n    +lookup() User\n    +lookup() User\n  }',
    'classDiagram\n  A : +lookup(id: int) User\n  A : +lookup(name: string) User',
    'classDiagram\n  A -- B',
    'classDiagram\n  A .. B',
    'classDiagram\n  C "1" --> "*" D',
    'classDiagram\n  namespace Shapes {\n    class Square\n  }',
  ])
    expect(kept(source)).toBe(true)
})

test('class: a fan-out, generics, classifiers, annotations and notes keep the fence', () => {
  for (const source of [
    'classDiagram\n  Animal <|-- Dog\n  Animal <|-- Cat',
    'classDiagram\n  Owner --> Dog : owns\n  Owner --> Cat : feeds',
    'classDiagram\n  class List~T~',
    'classDiagram\n  class A {\n    +count$ int\n  }',
    'classDiagram\n  class A {\n    +area()* double\n  }',
    'classDiagram\n  class Shape {\n    <<interface>>\n  }',
    'classDiagram\n  A <|-- B\n  B <|-- C\n  C <|-- A',
  ])
    expect(kept(source)).toBe(true)
})

// ── ER ───────────────────────────────────────────────────────────────────────

test('ER: a relationship draws both cardinalities and its label; attributes draw as written', () => {
  const lines = art('erDiagram\n  CUSTOMER {\n    string name\n    int id\n  }\n  ORDER {\n    int id\n  }\n  CUSTOMER ||--o{ ORDER : places')
  expect(lines.some(l => /││─+○╟│/.test(l))).toBe(true)
  for (const label of ['places', 'string name', 'int id']) expect(rowOf(lines, label)).toBeGreaterThan(-1)
  const pairs = art('erDiagram\n  A ||--|| B : one\n  C |o--o| D : opt\n  E }|--|{ F : many\n  G ||..o{ H : weak')
  for (const mark of [/A ││─+││ B/, /C │○│─+○││ D/, /E │╢─+╟│ F/, /G ││╌+○╟│ H/]) expect(pairs.some(l => mark.test(l))).toBe(true)
})

test('ER: two relationships between one pair, or an entity in two relationships, keep the fence', () => {
  expect(kept('erDiagram\n  A ||--o{ B : owns\n  A ||--|| B : leads')).toBe(true)
  expect(kept('erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  ORDER ||--|{ ITEM : contains')).toBe(true)
  expect(kept('erDiagram\n  A ||--o{ A : parent')).toBe(true)
})

test('ER: an entity alias, attribute keys or comments keep the fence', () => {
  expect(kept('erDiagram\n  p[Person] ||--o{ o[Order] : places')).toBe(true)
  expect(kept('erDiagram\n  A {\n    int other PK, FK "parent key"\n  }')).toBe(true)
  expect(kept('erDiagram\n  A {\n    int id PK\n  }')).toBe(true)
  expect(kept('erDiagram\n  A {\n    int id "the key"\n  }')).toBe(true)
})
