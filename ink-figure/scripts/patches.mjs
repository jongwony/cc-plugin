// Source patches applied to beautiful-mermaid (MIT) at bundle time. Each anchor must
// match upstream exactly once; a mismatch fails the build rather than shipping unpatched.
export const PATCHES = [
  {
    file: /beautiful-mermaid\/src\/ascii\/pathfinder\.ts$/,
    find: '  while (pq.length > 0) {\n    const current = pq.pop()!.coord\n',
    replace:
      '  const MAX_EXPANSIONS = 40_000\n  let expansions = 0\n' +
      '  while (pq.length > 0) {\n    if (++expansions > MAX_EXPANSIONS) return null\n    const current = pq.pop()!.coord\n',
  },
  {
    file: /beautiful-mermaid\/src\/ascii\/draw\.ts$/,
    find:
      "  if (dirEquals(dir, Up)) canvas[from.x]![from.y + 1] = '┴'\n" +
      "  else if (dirEquals(dir, Down)) canvas[from.x]![from.y - 1] = '┬'\n" +
      "  else if (dirEquals(dir, Left)) canvas[from.x + 1]![from.y] = '┤'\n" +
      "  else if (dirEquals(dir, Right)) canvas[from.x - 1]![from.y] = '├'\n",
    replace:
      '  // The junction belongs on the source box border. With tight padding the first drawn\n' +
      '  // cell can sit on the border itself, so one step back lands inside the box.\n' +
      "  // Walk back toward the box through blank cells (a diamond is drawn narrower than its\n" +
      "  // grid cell), fill them with line, and put the junction on the first border cell met.\n" +
      "  const put = (dx: number, dy: number, ch: string, border: string, line: string): void => {\n" +
      "    let x = from.x, y = from.y\n" +
      "    const blanks: Array<[number, number]> = []\n" +
      "    for (let step = 0; step < 8; step++) {\n" +
      "      const here = graph.canvas[x]?.[y]\n" +
      "      if (here === border) { for (const [bx, by] of blanks) canvas[bx]![by] = line; canvas[x]![y] = ch; return }\n" +
      "      if (here !== ' ' && step > 0) return\n" +
      "      if (step > 0) blanks.push([x, y])\n" +
      "      x += dx; y += dy\n" +
      "    }\n" +
      "  }\n" +
      "  if (dirEquals(dir, Up)) put(0, 1, '┴', '─', '│')\n" +
      "  else if (dirEquals(dir, Down)) put(0, -1, '┬', '─', '│')\n" +
      "  else if (dirEquals(dir, Left)) put(1, 0, '┤', '│', '─')\n" +
      "  else if (dirEquals(dir, Right)) put(-1, 0, '├', '│', '─')\n",
  },
  // Every statement is consumed or the parse throws, so a fence the renderer would
  // draw incompletely keeps its source. A trailing `;` ends a flowchart statement.
  {
    file: /beautiful-mermaid\/src\/parser\.ts$/,
    find: "  const lines = text.split('\\n').map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('%%'))\n",
    replace: "  const lines = text.split('\\n').map(l => l.trim().replace(/;$/, '').trim()).filter(l => l.length > 0 && !l.startsWith('%%'))\n",
  },
  {
    file: /beautiful-mermaid\/src\/parser\.ts$/,
    find: '    parseEdgeLine(line, graph, subgraphStack)\n',
    replace: '    if (/^(click|accTitle|accDescr)\\b/.test(line)) continue\n    parseEdgeLine(line, graph, subgraphStack)\n',
  },
  {
    file: /beautiful-mermaid\/src\/parser\.ts$/,
    find: '  if (!firstGroup || firstGroup.ids.length === 0) return\n',
    replace: '  if (!firstGroup || firstGroup.ids.length === 0) throw new Error(`unparsed statement: ${line}`)\n',
  },
  {
    file: /beautiful-mermaid\/src\/parser\.ts$/,
    find: '      if (!textMatch) break\n',
    replace: '      if (!textMatch) throw new Error(`unparsed statement: ${line}`)\n',
  },
  {
    file: /beautiful-mermaid\/src\/parser\.ts$/,
    find: '    if (!nextGroup || nextGroup.ids.length === 0) break\n',
    replace: '    if (!nextGroup || nextGroup.ids.length === 0) throw new Error(`unparsed statement: ${line}`)\n',
  },
  {
    file: /beautiful-mermaid\/src\/parser\.ts$/,
    find:
      "      registerStateNode(graph, compositeStack, { id, label, shape: 'rounded' })\n      continue\n    }\n  }\n\n  return graph\n",
    replace:
      "      registerStateNode(graph, compositeStack, { id, label, shape: 'rounded' })\n      continue\n    }\n\n" +
      "    if (/^(classDef|class|style|click|accTitle|accDescr)\\b/.test(line)) continue\n" +
      '    throw new Error(`unparsed statement: ${line}`)\n  }\n\n  return graph\n',
  },
  {
    file: /beautiful-mermaid\/src\/sequence\/parser\.ts$/,
    find: '    // For now, we skip explicit activate/deactivate lines (they affect rendering only)\n  }\n',
    replace:
      '    // For now, we skip explicit activate/deactivate lines (they affect rendering only)\n' +
      '    if (/^(activate|deactivate)\\s+\\S+$/.test(line) || /^(accTitle|accDescr)\\b/.test(line)) continue\n' +
      '    throw new Error(`unparsed statement: ${line}`)\n  }\n',
  },
  {
    file: /beautiful-mermaid\/src\/class\/parser\.ts$/,
    find: '      diagram.relationships.push(rel)\n      continue\n    }\n  }\n\n  diagram.classes = [...classMap.values()]\n',
    replace:
      '      diagram.relationships.push(rel)\n      continue\n    }\n\n' +
      '    if (/^(click|link|callback|style|classDef|cssClass|direction|accTitle|accDescr)\\b/.test(line)) continue\n' +
      '    throw new Error(`unparsed statement: ${line}`)\n  }\n\n  diagram.classes = [...classMap.values()]\n',
  },
  {
    file: /beautiful-mermaid\/src\/er\/parser\.ts$/,
    find: '      const attr = parseAttribute(line)\n      if (attr) {\n        currentEntity.attributes.push(attr)\n      }\n      continue\n',
    replace:
      '      const attr = parseAttribute(line)\n      if (!attr) throw new Error(`unparsed attribute: ${line}`)\n' +
      '      currentEntity.attributes.push(attr)\n      continue\n',
  },
  {
    file: /beautiful-mermaid\/src\/er\/parser\.ts$/,
    find: '      diagram.relationships.push(rel)\n      continue\n    }\n  }\n\n  diagram.entities = [...entityMap.values()]\n',
    replace:
      '      diagram.relationships.push(rel)\n      continue\n    }\n\n' +
      '    if (/^(accTitle|accDescr)\\b/.test(line)) continue\n' +
      '    throw new Error(`unparsed statement: ${line}`)\n  }\n\n  diagram.entities = [...entityMap.values()]\n',
  },
  // A later definition of a node replaces its text and shape (the last wins); a state's
  // later description replaces its default name or adds a line under a given one.
  {
    file: /beautiful-mermaid\/src\/parser\.ts$/,
    find: '  const isNew = !graph.nodes.has(node.id)\n  if (isNew) {\n    graph.nodes.set(node.id, node)\n  }\n  trackInSubgraph(subgraphStack, node.id)\n',
    replace: '  graph.nodes.set(node.id, node)\n  trackInSubgraph(subgraphStack, node.id)\n',
  },
  {
    file: /beautiful-mermaid\/src\/parser\.ts$/,
    find: '  const isNew = !graph.nodes.has(node.id)\n  if (isNew) {\n    graph.nodes.set(node.id, node)\n  }\n  if (compositeStack.length > 0) {\n',
    replace:
      '  const existing = graph.nodes.get(node.id)\n' +
      '  if (!existing || existing.label === existing.id) graph.nodes.set(node.id, node)\n' +
      '  else if (existing.label !== node.label) existing.label = `${existing.label}\\n${node.label}`\n' +
      '  if (compositeStack.length > 0) {\n',
  },
  // A bare node ID takes inner dashes only, so `A-->B` reads as A, an arrow and B.
  {
    file: /beautiful-mermaid\/src\/parser\.ts$/,
    find: 'const BARE_NODE_REGEX = /^([\\w-]+)/\n',
    replace: 'const BARE_NODE_REGEX = /^(\\w+(?:-\\w+)*)/\n',
  },
  // The gap between two entities is as wide as the widest relationship label, so the
  // label drawn in it is never cut to the gap.
  {
    file: /beautiful-mermaid\/src\/ascii\/er-diagram\.ts$/,
    find: '  const hGap = 6  // horizontal gap between entity boxes\n',
    replace:
      '  const hGap = Math.max(6, ...diagram.relationships.flatMap(rel => splitLines(rel.label)).map(line => line.length + 3))\n',
  },
  // A grid row an edge routes through is at least one cell tall; at paddingY 1 the
  // half-padding default left it zero rows and dropped the edge's return segment.
  {
    file: /beautiful-mermaid\/src\/ascii\/grid\.ts$/,
    find: '      graph.rowHeight.set(c.y, Math.floor(graph.config.paddingY / 2))\n',
    replace: '      graph.rowHeight.set(c.y, Math.max(1, Math.floor(graph.config.paddingY / 2)))\n',
  },
]
