# cell-chart

A Claude Code mod that draws two kinds of fenced block in Claude's replies as
terminal cells (`Raster`), right where the fence was:

- ` ```heatmap ` — a matrix of measured values, one colour shade per value band
- ` ```bars ` — measured horizontal bars, one cell per stated step

Labels sit in a text column beside the cells, never inside them, so Hangul and
other double-width labels line up. Every drawing states what one cell (or one
shade) stands for, and lengths round to whole cells — nothing finer than a cell
is implied.

Needs function hooks (`CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` while they are in
early access) and the interactive terminal. On any other surface, and for a
fence that does not parse or does not fit the terminal width, the reply is left
to Claude Code exactly as written, so the fence shows as a plain code block.

## Install

```bash
claude plugin marketplace add jongwony/cc-plugin
claude plugin install cell-chart@cc-plugin
```

Then `/reload-plugins` in a running session.

## Fence syntax

Both fences take an optional `unit:` line anywhere in the block (so a bar or
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

## Limits

- A `Raster` is at most 512 columns by 256 rows; a fence past that, or wider
  than the terminal, is not drawn.
- `AssistantMessage` is the finest site a mod can draw in, so a reply holding a
  chart is redrawn as Markdown pieces around the chart. A piece over 10,000
  characters, or one carrying escape codes another mod wrote into the reply,
  makes the whole reply fall back to Claude Code's own drawing.

## Test

```bash
cd cell-chart && claude plugin test
```
