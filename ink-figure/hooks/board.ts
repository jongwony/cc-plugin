import { fencesOf } from './figures.ts'

// The session's figure board: every ```mermaid and ```math fence the main loop's
// replies held, newest first, each beside the paragraph that led into it, written as
// one Artifact page the mod republishes at the same URL when a turn ends. The page
// draws with mermaid.js and KaTeX, so a fence the terminal renderer refuses is kept
// too. Nothing here calls the engine: the tool call comes in as `call`.

export type BoardEntry = { lang: 'mermaid' | 'math'; source: string; context: string; at: string }
export type Board = { name: string; url: string | null; updatedAt: string; entries: BoardEntry[] }

export const MAX_ENTRIES = 60
export const MAX_CONTEXT = 200
export const MERMAID = 'https://cdn.jsdelivr.net/npm/mermaid@11.17.2/dist/mermaid.esm.min.mjs'
export const KATEX = 'https://cdn.jsdelivr.net/npm/katex@0.18.9/dist/katex.mjs'
export const DESCRIPTION = "The figures this session's replies drew, newest first, each beside the paragraph that led into it."

const FENCE_MARK = /^ {0,3}(`{3,}|~{3,})/

// A markdown paragraph as one line of plain text: link targets, emphasis, code
// ticks and line markers dropped.
export const plainOf = (markdown: string): string =>
  markdown
    .split('\n')
    .map(line => line.replace(/^ {0,3}(?:#{1,6}[ \t]+|(?:>[ \t]?)+|[-*+][ \t]+|\d{1,9}[.)][ \t]+)/, ''))
    .join(' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`+([^`]*)`+/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|[^\w*])\*([^*\n]+)\*(?![\w*])/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim()

// The last paragraph before a fence that is prose: fenced code (closed or not) and
// table rows are passed over, and the text is cut to MAX_CONTEXT characters.
export const contextOf = (before: string): string => {
  const kept: string[] = []
  let open: string | null = null
  for (const line of before.replace(/\r\n?/g, '\n').split('\n')) {
    const mark = FENCE_MARK.exec(line)?.[1]
    if (open !== null) {
      if (mark !== undefined && mark[0] === open[0] && mark.length >= open.length) open = null
      kept.push('')
    } else if (mark !== undefined) {
      open = mark
      kept.push('')
    } else kept.push(line)
  }
  const paragraphs = kept
    .join('\n')
    .split(/\n[ \t]*\n/)
    .map(p => p.trim())
    .filter(p => p !== '' && !p.split('\n').every(l => l.trim().startsWith('|')))
  const last = paragraphs.at(-1)
  if (last === undefined) return ''
  const chars = Array.from(plainOf(last))
  return chars.length > MAX_CONTEXT ? chars.slice(0, MAX_CONTEXT - 1).join('').trimEnd() + '…' : chars.join('')
}

// Every fence of the reply's text blocks, in order. A fence whose own block has no
// prose before it takes the last paragraph of the blocks before.
export const entriesOf = (texts: readonly string[], at: string): BoardEntry[] => {
  const entries: BoardEntry[] = []
  const seen: string[] = []
  for (const raw of texts) {
    const text = raw.replace(/\r\n?/g, '\n')
    for (const fence of fencesOf(text)) {
      const context = contextOf(text.slice(0, fence.start)) || contextOf(seen.join('\n\n'))
      entries.push({ lang: fence.lang, source: fence.source, context, at })
    }
    seen.push(text)
  }
  return entries
}

const keyOf = (entry: BoardEntry) => `${entry.lang}\n${entry.source.trim()}`

// The reply's fences go on top in the order it wrote them; a figure already on the
// board with the same source moves up with its new time and context, never twice.
export const mergedOf = (board: readonly BoardEntry[], fresh: readonly BoardEntry[], max = MAX_ENTRIES): BoardEntry[] => {
  const top: BoardEntry[] = []
  const keys = new Set<string>()
  for (const entry of fresh) {
    const key = keyOf(entry)
    if (keys.has(key)) continue
    keys.add(key)
    top.push(entry)
  }
  return [...top, ...board.filter(entry => !keys.has(keyOf(entry)))].slice(0, max)
}

const escaped = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const entryHtml = (entry: BoardEntry) =>
  [
    '<article>',
    entry.context === '' ? '' : `<p class="context">${escaped(entry.context)}</p>`,
    entry.lang === 'math' ? `<figure><div class="math">${escaped(entry.source)}</div></figure>` : `<figure><pre class="mermaid">${escaped(entry.source)}</pre></figure>`,
    `<details><summary><time datetime="${escaped(entry.at)}">${escaped(entry.at)}</time> · source</summary><pre class="source">${escaped(entry.source)}</pre></details>`,
    '</article>',
  ].join('')

// The page: colour tokens with the dark guard, an explicit background, a 16px
// gutter, each figure scrolling on its own. Times are ISO in the markup and shown
// in the viewer's local time; KaTeX writes MathML, which needs no stylesheet.
export const htmlOf = (board: Board): string => `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Figure Board</title>
<style>
:root{--bg:#ffffff;--fg:#1f2328;--muted:#59636e;--line:#d1d9e0;--panel:#f6f8fa}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#0d1117;--fg:#e6edf3;--muted:#9198a1;--line:#3d444d;--panel:#151b23}}
:root[data-theme="dark"]{--bg:#0d1117;--fg:#e6edf3;--muted:#9198a1;--line:#3d444d;--panel:#151b23}
*{box-sizing:border-box}
body{margin:0;padding:16px;background:var(--bg);color:var(--fg);font:15px/1.6 system-ui,-apple-system,"Apple SD Gothic Neo",sans-serif;overflow-x:hidden}
main{max-width:960px;margin:0 auto}
h1{font-size:18px;margin:0}
.meta{color:var(--muted);font-size:13px;margin:2px 0 16px}
article{border:1px solid var(--line);border-radius:8px;padding:12px;margin:0 0 16px;background:var(--bg)}
.context{margin:0 0 8px}
figure{margin:0;overflow-x:auto}
pre.mermaid{margin:0;background:transparent}
.math{overflow-x:auto}
details{margin-top:8px;color:var(--muted);font-size:13px}
pre.source{background:var(--panel);padding:8px;border-radius:6px;overflow-x:auto;white-space:pre;color:var(--fg)}
</style></head><body><main>
<h1>Figure Board</h1>
<p class="meta">${escaped(board.name)} · updated <time datetime="${escaped(board.updatedAt)}">${escaped(board.updatedAt)}</time> · ${board.entries.length} figure${board.entries.length === 1 ? '' : 's'}</p>
${board.entries.map(entryHtml).join('\n')}
</main>
<script>
for (const t of document.querySelectorAll('time[datetime]')) { const d = new Date(t.getAttribute('datetime')); if (!isNaN(d)) t.textContent = d.toLocaleString() }
</script>
<script type="module">
import katex from '${KATEX}';
for (const el of document.querySelectorAll('.math')) { try { katex.render(el.textContent, el, { displayMode: true, throwOnError: false, output: 'mathml' }) } catch {} }
</script>
<script type="module">
import mermaid from '${MERMAID}';
const root = document.documentElement.dataset.theme;
const dark = root === 'dark' || (root !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: dark ? 'dark' : 'default' });
await mermaid.run({ querySelector: 'pre.mermaid', suppressErrors: true });
</script>
</body></html>
`

export const urlOf = (text: string | undefined): string | null => /https:\/\/claude\.ai\/(?:code\/)?artifact\/[A-Za-z0-9_-]+/.exec(text ?? '')?.[0] ?? null

export type ToolAnswer = { text?: string; deny?: string; isError?: boolean }
export type ToolCaller = (input: Record<string, unknown>) => Promise<ToolAnswer>

const refusalOf = (answer: ToolAnswer): string | null =>
  answer.deny !== undefined ? answer.deny : answer.isError === true ? (answer.text ?? 'error').slice(0, 300) : null

const attempt = async (call: ToolCaller, input: Record<string, unknown>): Promise<ToolAnswer> => {
  try {
    return await call(input)
  } catch (err) {
    return { isError: true, text: err instanceof Error ? err.message : String(err) }
  }
}

// Republishes the page at the board's URL. A conversation may publish only to an
// artifact it has read or published, so a resumed session that is refused reads the
// URL and tries once more; failing that it starts a fresh board. `url` null in the
// outcome means nothing was published; `log` says what was refused and why.
export const publishBoard = async (call: ToolCaller, path: string, url: string | null): Promise<{ url: string | null; log: string[] }> => {
  const log: string[] = []
  const publish = (to: string | null) =>
    attempt(call, { tool: 'Artifact', action: 'publish', file_path: path, ...(to === null ? { icon: 'chart', description: DESCRIPTION } : { url: to }) })
  if (url !== null) {
    const again = await publish(url)
    const refused = refusalOf(again)
    if (refused === null) return { url: urlOf(again.text) ?? url, log }
    log.push(`republishing ${url} was refused: ${refused}`)
    const read = await attempt(call, { tool: 'Artifact', action: 'read', url })
    const unread = refusalOf(read)
    if (unread === null) {
      const after = await publish(url)
      const still = refusalOf(after)
      if (still === null) return { url: urlOf(after.text) ?? url, log }
      log.push(`republishing after reading it was refused: ${still}`)
    } else log.push(`reading ${url} was refused: ${unread}`)
    log.push('starting a fresh board')
  }
  const fresh = await publish(null)
  const refused = refusalOf(fresh)
  if (refused !== null) {
    log.push(`publishing the board was refused: ${refused}`)
    return { url: null, log }
  }
  return { url: urlOf(fresh.text), log }
}

// What the store holds for a board, or null when it is not one.
export const boardOf = (value: unknown): Board | null => {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Partial<Board>
  if (typeof v.name !== 'string' || !Array.isArray(v.entries)) return null
  const entries = v.entries.filter(
    (e): e is BoardEntry => typeof e === 'object' && e !== null && (e.lang === 'mermaid' || e.lang === 'math') && typeof e.source === 'string' && typeof e.context === 'string' && typeof e.at === 'string',
  )
  return { name: v.name, url: typeof v.url === 'string' ? v.url : null, updatedAt: typeof v.updatedAt === 'string' ? v.updatedAt : '', entries }
}
