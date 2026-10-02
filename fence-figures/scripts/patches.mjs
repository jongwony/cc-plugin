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
]
