#!/usr/bin/env uv run --quiet --script
# /// script
# requires-python = ">=3.8"
# dependencies = []
# ///
"""Render a directed graph (DAG) as a layered box-art / ASCII diagram in the terminal.

Zero external dependencies — pure stdlib, so it works on any machine with uv/python.
Best for hub-style fan-out / fan-in (the common workflow shape: one source feeding N
parallel stages that fan back into one). For dense crossing graphs, graph-easy or
graphviz `dot` give nicer routing — this tool stays honest by listing cross-layer
edges below the diagram instead of mis-routing them.

Input — edges, one per line, on stdin or from a file given as a positional arg:

    A -> B
    A -> B -> C          # chains expand to A->B and B->C
    A, B -> C            # comma groups: A->C and B->C
    LoneNode             # a bare token declares an isolated node

DOT-style lines are tolerated: surrounding quotes, trailing `;`, `[...]` attribute
blocks, and `digraph foo {` / `}` wrappers are stripped. Blank lines and `#` comments
are ignored.

Flags:
    --ascii     use +-|  instead of unicode box characters (for non-UTF8 terminals)
    --gutter N  horizontal space between sibling boxes (default 3)
"""
import sys
import argparse


def parse_edges(text):
    """Return (nodes_in_first_seen_order, edges) from the edge-list text."""
    nodes, seen, edges = [], set(), []

    def add(n):
        if n and n not in seen:
            seen.add(n)
            nodes.append(n)

    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        # drop DOT wrappers: `digraph x {`, standalone `{` / `}`
        if line in ("{", "}") or line.endswith("{"):
            continue
        if "[" in line:                       # strip attribute block
            line = line[: line.index("[")]
        line = line.rstrip(";").strip()
        if not line:
            continue
        if "->" not in line:                  # bare node declaration
            add(line.strip('"').strip())
            continue
        groups = []
        for part in line.split("->"):
            members = [m.strip().strip('"').strip() for m in part.split(",") if m.strip()]
            for m in members:
                add(m)
            groups.append(members)
        for i in range(len(groups) - 1):
            for a in groups[i]:
                for b in groups[i + 1]:
                    edges.append((a, b))
    return nodes, edges


def compute_layers(nodes, edges):
    """Longest-path layering from sources. Cycle-safe (back-edges contribute 0)."""
    preds = {n: [] for n in nodes}
    for a, b in edges:
        preds[b].append(a)
    layer, visiting = {}, set()

    def lay(n):
        if n in layer:
            return layer[n]
        if n in visiting:                     # cycle guard
            return 0
        visiting.add(n)
        layer[n] = 1 + max((lay(p) for p in preds[n]), default=-1)
        visiting.discard(n)
        return layer[n]

    for n in nodes:
        lay(n)
    return layer


def junction(up, down, left, right, ascii_mode):
    if ascii_mode:
        return "+"
    return {
        (1, 0, 1, 1): "┴", (1, 0, 1, 0): "┘", (1, 0, 0, 1): "└",
        (0, 1, 1, 1): "┬", (0, 1, 1, 0): "┐", (0, 1, 0, 1): "┌",
        (1, 1, 1, 1): "┼", (1, 1, 1, 0): "┤", (1, 1, 0, 1): "├",
        (1, 1, 0, 0): "│", (1, 0, 0, 0): "│", (0, 1, 0, 0): "│",
        (0, 0, 1, 1): "─", (0, 0, 1, 0): "─", (0, 0, 0, 1): "─",
    }.get((up, down, left, right), "┼")


def render(nodes, edges, ascii_mode=False, gutter=3):
    if not nodes:
        return "(empty graph)"
    layer = compute_layers(nodes, edges)
    n_layers = max(layer.values()) + 1
    rows = [[] for _ in range(n_layers)]      # nodes per layer, first-seen order
    for n in nodes:
        rows[layer[n]].append(n)

    # box width includes borders + one space of padding each side: "│ label │"
    bw = {n: len(n) + 4 for n in nodes}
    line_w = lambda layer_nodes: sum(bw[n] for n in layer_nodes) + gutter * max(len(layer_nodes) - 1, 0)
    canvas_w = max(line_w(r) for r in rows)

    # assign absolute column of each box's left edge, then its center
    left, center = {}, {}
    for r in rows:
        x = (canvas_w - line_w(r)) // 2
        for n in r:
            left[n] = x
            center[n] = x + bw[n] // 2
            x += bw[n] + gutter

    BOX_H, BAND_H = 3, 2
    height = n_layers * BOX_H + (n_layers - 1) * BAND_H
    grid = [[" "] * canvas_w for _ in range(height)]

    def put(row, col, ch):
        if 0 <= row < height and 0 <= col < canvas_w:
            grid[row][col] = ch

    top_row = lambda L: L * (BOX_H + BAND_H)

    # draw boxes
    h, v = ("-", "|") if ascii_mode else ("─", "│")
    tl, tr, bl, br = ("+", "+", "+", "+") if ascii_mode else ("┌", "┐", "└", "┘")
    for L, r in enumerate(rows):
        t = top_row(L)
        for n in r:
            x, w = left[n], bw[n]
            for c in range(1, w - 1):
                put(t, x + c, h)
                put(t + 2, x + c, h)
            put(t, x, tl); put(t, x + w - 1, tr)
            put(t + 2, x, bl); put(t + 2, x + w - 1, br)
            put(t + 1, x, v); put(t + 1, x + w - 1, v)
            for i, ch in enumerate(" " + n + " "):
                put(t + 1, x + 1 + i, ch)

    # draw connectors gap by gap, using only adjacent-layer edges (comb bus)
    adj = {}                                  # (L) -> list of (parent, child)
    cross = []                                # edges skipping a layer
    for a, b in edges:
        if layer[b] == layer[a] + 1:
            adj.setdefault(layer[a], []).append((a, b))
        elif layer[b] != layer[a]:
            cross.append((a, b))
    for L, pairs in adj.items():
        bus = top_row(L) + BOX_H              # bus row (band row 0)
        drop = bus + 1                        # child-drop row (band row 1)
        parents = {center[a] for a, _ in pairs}
        children = {center[b] for _, b in pairs}
        involved = parents | children
        lo, hi = min(involved), max(involved)
        for c in range(lo, hi + 1):
            up = c in parents
            down = c in children
            grid[bus][c] = junction(up, down, c > lo, c < hi, ascii_mode)
        for c in children:
            put(drop, c, v)

    out = "\n".join("".join(row).rstrip() for row in grid)
    out = "\n".join(line for line in out.split("\n"))  # keep internal blanks
    if cross:
        arrow = "-->" if ascii_mode else "⇢"
        note = "\n".join(f"  {a} {arrow} {b}" for a, b in cross)
        out += f"\n\ncross-layer edges (not drawn above):\n{note}"
    return out


def main():
    ap = argparse.ArgumentParser(description="Render a DAG as layered box-art ASCII.")
    ap.add_argument("file", nargs="?", help="edge-list file (default: stdin)")
    ap.add_argument("--ascii", action="store_true", help="use +-| instead of box chars")
    ap.add_argument("--gutter", type=int, default=3, help="space between sibling boxes")
    args = ap.parse_args()
    text = open(args.file, encoding="utf-8").read() if args.file else sys.stdin.read()
    nodes, edges = parse_edges(text)
    print(render(nodes, edges, ascii_mode=args.ascii, gutter=args.gutter))


if __name__ == "__main__":
    main()
