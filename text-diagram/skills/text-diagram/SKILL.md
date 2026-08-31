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

Turn a directed graph — most often a workflow or DAG — into a layered box-art diagram you
can read straight in the terminal. The whole point is to make a branching process *legible
at a glance* without reaching for an image renderer or a browser.

## Before you draw

Four checks, in order. The first two decide *whether* to draw; the last two decide *how big*.

1. **Would a well-written sentence beat this picture?** A three-node chain is a sentence.
   Draw when the reader has to hold several relationships at once — that is what prose is
   bad at and a picture is good at.
2. **Merge nodes that always travel together.** Two boxes that appear and disappear as a
   pair are one box with a compound name. Every node should stand for a distinct idea.
3. **Fit the width budget: `Σ(label lengths) + 4n + 3(n−1) ≤ W` for the widest layer,**
   where `W` is the reading terminal's width. The terminal hard-wraps anything past it and
   a wrapped drawing is unreadable, so this is the one hard constraint. `render.py` reads
   `W` at invocation and warns past it, falling back to 80 only when the width cannot be
   detected. Label length eats the budget as fast as sibling count does, so shortening
   names is usually the cheaper fix — read that off the formula rather than off a table
   of sibling counts, which would only be true at one `W`.

   When the skill runs the script on the user's behalf, the detected width is the tool's
   own pty rather than the user's window — usually narrower, so the check errs
   conservative. Pass `--width` when you know the real reading width.
4. **Pick a detail level before drawing, not after.**

   | Level | Node ceiling | Use when |
   |---|---|---|
   | `faithful` | ≤24, split into stages | The reader will check the picture against the real system |
   | `balanced` (default) | ≤12 | Explaining how something works |
   | `simplified` | ≤7 | The shape is the point and details would distract |

   Above the ceiling it is two diagrams, not one crowded one.

## Emphasis: strokes, because there is no colour

Assistant output reaches the terminal as plain characters — escape sequences are consumed
before they become cells, so **no colour is available to mark a focal node**. Emphasis is
carried by stroke weight instead: `--focus <node>` draws that box with `┏━┓┃┗┛` (`=` under
`--ascii`).

**Use one focal node.** Heavy strokes contrast far less than colour would, so the signal
dies faster: mark five of six boxes and "focus" stops meaning anything. If two things
genuinely compete for the reader's eye, that is usually a sign the graph should be split.

## Choosing a rendering path

There are three ways to render, in priority order. The first works on any machine and is
the default; the others are situational. Prefer the bundled script unless you have a
specific reason not to — it is environment-neutral, which matters because a teammate
running this skill may not have graph-easy installed (cc-plugin's Environment-neutrality
principle: a skill must work even when an optional external tool is absent).

1. **Bundled `render.py` (default).** Pure Python stdlib via uv — no external packages.
   Lays a graph out top-to-bottom by longest-path layers. Best for the common workflow
   shape: one source fanning out to N parallel stages that fan back into one.

2. **graph-easy (optional upgrade).** If `graph-easy` is on PATH, it produces nicer
   automatic routing for dense or heavily-crossing graphs. Detect it first
   (`command -v graph-easy`); only suggest installing it when the graph is genuinely too
   tangled for the layered renderer (see *Limits* below). It is a Perl module
   (`cpanm Graph::Easy`, or `apt install libgraph-easy-perl`), so installation is a real
   cost — do not push it for simple graphs.

3. **Hand-ASCII heredoc (one-off).** For a three- or four-node sketch you will never reuse,
   just write the boxes by hand in a `cat <<'EOF'` block. Faster than any tool when the
   graph is trivial and disposable.

## Default path: render.py

Feed it an edge list on stdin (or pass a file path):

```bash
uv run ${CLAUDE_PLUGIN_ROOT}/skills/text-diagram/scripts/render.py <<'EOF'
diff/fate -> Category, Type, OpSem, Gap
Category, Type, OpSem, Gap -> verify
verify -> Synthesize -> report
EOF
```

### Input grammar

One edge statement per line. The grammar is deliberately small so it is quick to type and
also tolerant of pasted DOT.

- `A -> B` — a single edge.
- `A -> B -> C` — a chain; expands to `A->B` and `B->C`.
- `A, B -> C` — comma groups on either side; expands to the cross product (`A->C`, `B->C`).
- `LoneNode` — a bare token with no arrow declares an isolated node.
- DOT noise is stripped: surrounding quotes, a trailing `;`, `[label=...]` attribute
  blocks, and `digraph foo {` / `}` wrappers are all ignored, so you can paste a `.dot`
  body directly.
- Blank lines and `#` comments are ignored.

### Flags

| Flag | Effect |
|------|--------|
| `--ascii` | Use `+ - |` instead of unicode box characters — for terminals that mangle UTF-8. |
| `--gutter N` | Horizontal space between sibling boxes (default `3`). Widen it if labels look cramped. |
| `--focus A[,B]` | Draw the named node(s) with heavy strokes. Keep it to one — see *Emphasis* above. |
| `--width N` | Column budget to warn past. Defaults to the detected terminal width (80 when undetectable); `0` disables the check. |

### What the output looks like

The fan-out / fan-in example above renders as:

```
                ┌───────────┐
                │ diff/fate │
                └───────────┘
      ┌────────────┬──┴───────┬──────────┐
      │            │          │          │
┌──────────┐   ┌──────┐   ┌───────┐   ┌─────┐
│ Category │   │ Type │   │ OpSem │   │ Gap │
└──────────┘   └──────┘   └───────┘   └─────┘
      └────────────┴──┬───────┴──────────┘
                      │
                 ┌────────┐
                 │ verify │
                 └────────┘
                      │
               ┌────────────┐
               │ Synthesize │
               └────────────┘
                      │
                 ┌────────┐
                 │ report │
                 └────────┘
```

## Translating a Workflow script into an edge list

A frequent use is picturing the control flow of a `Workflow` script (the `pipeline()` /
`parallel()` orchestration primitives). Map the primitives to edges like this, then pipe
the result into `render.py`:

- **`pipeline(items, stageA, stageB, ...)`** is a chain per item: `item -> stageA -> stageB`.
  When every item flows through the same named stages, collapse to one chain of stage names.
- **`parallel([f1, f2, f3])`** is a fan-out from the node that spawned it to each thunk, then
  (if the results are later combined) a fan-in to the consuming node.
- A **barrier** (results awaited together before the next stage) is a fan-in: `s1, s2, s3 -> next`.
- Name nodes after what they *do* (`review:bugs`, `verify`, `synthesize`), not the variable
  that holds them — the picture is for a human.

Read the script's `phase()` calls and the shape of its `parallel`/`pipeline` calls, write the
edges, and render. This recovers the fan-out → verify → fan-in skeleton that the prose of a
script hides.

## Delivering the drawing

Emit the diagram **inside a fenced code block with no language tag**. Three separate things
go wrong otherwise:

- In prose, `*`, `_` and `|` are eaten as inline markdown, and a line indented four spaces
  silently becomes a code block of its own.
- A language tag routes the content through the syntax highlighter, which recolours box
  characters. No tag means the highlighter runs a grammar that assigns nothing, so the
  drawing comes out uniform.
- Inside a table cell the content is still markdown, so backticks pick up inline-code
  styling. Never wrap diagram characters in backticks.

The fence buys verbatim indentation and immunity from inline markdown. It does **not** buy
overflow protection — every line is still hard-wrapped at the terminal's width, which is
why the width budget above is the constraint that actually matters.

## Limits — and when to escalate

The layered renderer optimises for hub-style graphs. Two honest limitations, surfaced rather
than hidden:

- **Cross-layer edges are listed, not drawn.** An edge that skips a layer (e.g. `start -> end`
  when `end` is three layers down) is printed in a `cross-layer edges (not drawn above)` note
  beneath the diagram. This keeps the picture truthful instead of routing a misleading line.
- **Dense crossings are approximate.** Between two layers the connectors are drawn as a single
  shared bus, which is exactly right for fan-out/fan-in but only indicative when many edges
  cross each other. If the graph is a tangle rather than a hierarchy, switch to graph-easy
  (`graph-easy --as_boxart`) or graphviz (`dot -Tplain` rasterised, or just `dot -Tpng` for an
  image) — both do real edge routing.

If a graph has cycles, the renderer still lays it out (back-edges are treated as layer-0
contributions) but the result reads better as a tree than as a faithful cyclic graph; note
this to the user and offer graph-easy.

### Input envelope

The renderer targets graphs small enough to read in a terminal — the kind you can specify
inline — so a few input boundaries are accepted rather than engineered around:

- **Labels are measured by character count, not display width, and this is deliberate.**
  Box width is `len(label) + 4`, so CJK and emoji labels overflow their boxes and the
  connectors drift. Measuring display width instead would put a third measurer alongside
  the harness and the terminal, which already disagree in edge cases — so the renderer
  stays with one simple rule and documents the limit rather than chasing agreement it
  cannot guarantee. Use ASCII/Latin labels when alignment matters.
- **Very deep chains recurse.** Layering is computed recursively, so a single chain longer
  than Python's recursion limit (~1000 nodes) raises `RecursionError`. Graphs that fit in a
  terminal never approach this; for machine-scale DAGs, use graphviz.
- **DOT wrappers must be multi-line.** `digraph foo {` and `}` are stripped only when each is
  on its own line; a one-line `digraph G { A -> B }` is parsed literally and yields junk nodes.
  Split the wrapper across lines, or drop it and feed the bare edges.

## Files

| File | Purpose |
|------|---------|
| `scripts/render.py` | Layered box-art / ASCII renderer. Stdlib-only, runs via `uv run`. Reads an edge list from stdin or a file. |
