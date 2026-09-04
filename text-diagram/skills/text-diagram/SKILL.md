---
name: text-diagram
description: |
  This skill should be used when the user wants a directed graph — a DAG, workflow,
  pipeline, or dependency tree — drawn as a plain-text terminal picture: "draw this graph",
  "sketch the DAG", "diagram these dependencies", "render as ASCII", or turning a Workflow
  script's pipeline()/parallel() structure into a diagram (even when "ASCII" is never said).
  Renders layered box-art, zero-dependency, upgrading to graph-easy when installed.
---

# Text Diagram

Render a directed graph as a layered box-art diagram read directly in the terminal.

## Before drawing

- Reader must hold several relationships at once → draw. A three-node chain → write the sentence instead.
- Two nodes that always appear and disappear together → one node with a compound name.
- Widest layer must satisfy `Σ(label lengths) + 4n + 3(n−1) ≤ W`, where `W` is the reading
  terminal's width. Over budget → shorten labels first, then split the graph. `render.py`
  reads `W` at invocation and warns past it, falling back to 80 when it cannot be detected.
- Running the script on the user's behalf → the detected width is the tool's own pty, not the
  user's window. Real reading width known → pass `--width N`.
- Fix the detail level before drawing; above a ceiling it is two diagrams:
  - `faithful` — ≤24 nodes, split into stages; the reader will check the picture against the real system.
  - `balanced` — ≤12 nodes; default; explaining how something works.
  - `simplified` — ≤7 nodes; the shape is the point.

## Emphasis

- Colour does not survive to the terminal, so emphasis is stroke weight: `--focus <node>`
  draws that box with `┏━┓┃┗┛`.
- One focal node per diagram. Two nodes genuinely competing for the eye → split the graph.

## Choosing a rendering path

- Default → bundled `render.py`. Stdlib via uv, no external packages; lays the graph out
  top-to-bottom by longest-path layers; fits the fan-out / fan-in workflow shape.
- Graph is a tangle rather than a hierarchy and `command -v graph-easy` succeeds →
  `graph-easy --as_boxart`.
- Same tangle and graph-easy absent → name the install cost (`cpanm Graph::Easy`, or
  `apt install libgraph-easy-perl`) and let the user choose. Simple graph → stay on `render.py`.
- Three or four nodes, used once → write the boxes by hand in a `cat <<'EOF'` block.

## Running render.py

```bash
uv run ${CLAUDE_PLUGIN_ROOT}/skills/text-diagram/scripts/render.py <<'EOF'
diff/fate -> Category, Type, OpSem, Gap
Category, Type, OpSem, Gap -> verify
verify -> Synthesize -> report
EOF
```

A file path as a positional arg replaces stdin.

### Edge grammar

One statement per line.

- `A -> B` — a single edge.
- `A -> B -> C` — a chain; expands to `A->B` and `B->C`.
- `A, B -> C` — comma groups on either side; expands to the cross product.
- `LoneNode` — a bare token declares an isolated node.
- Surrounding quotes, a trailing `;`, `[label=...]` blocks, and `digraph foo {` / `}` on their
  own lines are stripped, so a `.dot` body pastes in directly.
- Blank lines and `#` comments are ignored.

### Flags

- `--gutter N` — horizontal space between sibling boxes, default `3`; widen when labels look cramped.
- `--focus A[,B]` — heavy strokes on the named node(s); keep it to one.
- `--width N` — column budget to warn past; defaults to the detected terminal width (80 when
  undetectable), `0` disables the check.

## Translating a Workflow script into an edge list

- `pipeline(items, stageA, stageB, ...)` → a chain per item, `item -> stageA -> stageB`. Every
  item flowing through the same named stages → collapse to one chain of stage names.
- `parallel([f1, f2, f3])` → a fan-out from the spawning node to each thunk; results later
  combined → a fan-in to the consuming node.
- Results awaited together before the next stage → a fan-in, `s1, s2, s3 -> next`.
- Node names come from what the step does (`review:bugs`, `verify`), not from the variable holding it.
- Read the shape off the script's `phase()` calls and the nesting of its `parallel` / `pipeline` calls.

## Delivering the drawing

- Emit the drawing in a fenced code block with no language tag.
- Block level only: a drawing is never a table cell's content and never an inline-code span.
- The fence buys verbatim indentation, not overflow protection — the width budget above is the
  constraint that binds.

## Limits — and when to escalate

- Edge skipping a layer → listed under `cross-layer edges (not drawn above)` beneath the diagram
  rather than routed.
- Many edges crossing each other → the shared connector bus is indicative only; tangle rather than
  hierarchy → `graph-easy --as_boxart`, or graphviz (`dot -Tpng`).
- Graph has cycles → it still lays out, back edges contributing layer 0, and reads as a tree; say
  so to the user and offer graph-easy.
- Every limit above is a worked case in [`references/catalog.md`](references/catalog.md) — read the
  case there. `uv run scripts/catalog.py --check` is what keeps those cases true.

### Input envelope

- Box width is `len(label) + 4` measured in characters, so CJK and emoji labels overflow their
  boxes and the connectors drift → use single-cell Latin labels when alignment matters.
- Single chain longer than Python's recursion limit (~1000 nodes) → `RecursionError`;
  machine-scale DAGs → graphviz.
- `digraph foo {` and `}` are stripped only when each is on its own line; a one-line
  `digraph G { A -> B }` yields junk nodes → split the wrapper across lines, or feed the bare edges.

## Files

- `scripts/render.py` — the renderer; stdlib-only, runs via `uv run`, reads an edge list from stdin or a file.
- `scripts/catalog.py` — regenerates the catalog from its own scenario list; `--write` rebuilds, `--check` fails on drift.
- `references/catalog.md` — every catalogued scenario rendered at 80 columns; generated, not hand-written.
