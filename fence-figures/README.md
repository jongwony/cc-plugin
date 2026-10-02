# fence-figures

A Claude Code mod that draws figure fences in Claude's replies right where the
fence was, in the terminal transcript:

- ` ```heatmap ` — a matrix of measured values, one colour shade per value band (`Raster` cells)
- ` ```bars ` — measured horizontal bars, one cell per stated step (`Raster` cells)
- ` ```mermaid ` — flowchart, sequence, class, state, ER and xychart diagrams as box art

One `ui.render` hook on `AssistantMessage` reads every fence of every kind in one
pass, so a reply that mixes kinds draws whole.

Labels are measured in screen cells, so Hangul and other double-width labels line
up — beside the `Raster` cells for charts, inside the boxes for diagrams. Every
chart states what one cell (or one shade) stands for, and lengths round to whole
cells — nothing finer than a cell is implied.

Needs Claude Code v2.1.287 or later (mods on by default) and the interactive
terminal. On any other surface, and for a fence that does not parse, is not a
drawn kind, or does not fit the terminal width, the fence is left as written.
The Desktop app draws ` ```math ` itself and shows other fences as code.

## Install

```bash
claude plugin marketplace add jongwony/cc-plugin
claude plugin install fence-figures@cc-plugin
```

Then `/reload-plugins` in a running session.

## Fence syntax

The chart fences take an optional `unit:` line anywhere in the block (so a bar or
row cannot itself be labelled `unit`).

### bars

One `label: value` line per bar. Values are non-negative numbers; the label is
everything before the last `:`.

````markdown
```bars
unit: GB
인덱서: 3.2
api: 0.8
cache: 6
```
````

Drawn as:

```text
인덱서 ████████████████████████████████                             3.2 GB
api    ████████                                                     0.8 GB
cache  ████████████████████████████████████████████████████████████ 6 GB
1 cell ~ 0.1 GB · lengths rounded to whole cells
```

The step is the smallest 1, 2, 2.5 or 5 × 10ⁿ that fits the longest bar in at
most 60 cells.

### heatmap

A header row of column names, then one row per label ending in one value per
column. Separate with spaces, or write a markdown table with `|` (a `|---|`
rule line is skipped). The header may carry a corner cell above the labels or
not. `-` marks a missing value, drawn blank.

````markdown
```heatmap
unit: ms
        00h 06h 12h
서울     12  40  95
Tokyo    10  33  -
```
````

Each value is two cells wide (three past nine columns), coloured on an
eight-step viridis scale. Columns are numbered above the cells and named in a
key line below, since names would not fit a two-cell column:

```text
       1 2 3
서울   ██████
Tokyo  ████
██████████ 1 shade ~ 20 ms · 0 to 100 ms, 5 shades · blank = no value
columns: 1 00h · 2 06h · 3 12h
```

### mermaid

Standard mermaid source. Drawn kinds: `flowchart`/`graph`, `sequenceDiagram`,
`classDiagram`, `stateDiagram`, `erDiagram`, `xychart`; any other kind keeps its
fence. A top-down flowchart or state diagram is laid out left to right when no
label is lost and it fits. Spacing is compact: two columns and one row between
boxes, one cell inside them.

````markdown
```mermaid
graph LR
  A[서울 요청] --> B[cache]
  B --> C[응답]
```
````

```text
┌───────────┐  ┌───────┐  ┌──────┐
│           │  │       │  │      │
│ 서울 요청 ├─►│ cache ├─►│ 응답 │
│           │  │       │  │      │
└───────────┘  └───────┘  └──────┘
```

Borders and junctions are drawn cyan, arrows yellow, lines dim, through element
styles.

The renderer is [beautiful-mermaid](https://github.com/lukilabs/beautiful-mermaid)
(MIT, `hooks/vendor/LICENSE`), bundled into `hooks/vendor/mermaid-ascii.js` with
the patches in `scripts/patches.mjs`: a bounded edge search, and an edge's start
junction placed on its box border — at tight spacing it landed inside the box,
and a diamond's edge started a few cells away from it. Fence detection, the
left-to-right flip and the role colouring are adapted from
[claude-mermaid](https://github.com/galElmalah/claude-mods) (Gal Elmalah, MIT).

## Limits

- A `Raster` is at most 512 columns by 256 rows; a fence past that, or wider
  than the terminal, is not drawn.
- `AssistantMessage` is the finest site a mod can draw in, so a reply holding a
  figure is redrawn as Markdown pieces around it. A piece over 10,000
  characters, or one carrying escape codes another mod wrote into the reply,
  makes the whole reply fall back to Claude Code's own drawing.

- mermaid: a node ID must be ASCII (a Hangul label is fine, a Hangul ID is not
  parsed upstream); such a fence keeps its source.
- mermaid: where one node fans out to several targets stacked below it, the
  two-column gap leaves no room for both a tee on the shared line and the
  arrowhead, so the arrowhead sits on the line. A three-column gap draws both.

## Build and test

`hooks/vendor/mermaid-ascii.js` is generated; rebuild it after changing
`scripts/patches.mjs` or the pinned renderer version (Node 22+):

```bash
cd fence-figures && npm install && npm run build:vendor
claude plugin test
```
