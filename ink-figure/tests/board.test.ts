import { expect, test } from 'claude-code/testing'
import { boardOf, contextOf, entriesOf, htmlOf, KATEX, MAX_CONTEXT, mergedOf, MERMAID, plainOf, publishBoard, urlOf, type BoardEntry, type ToolAnswer } from '../hooks/board.ts'

const fenced = (source: string, lang = 'mermaid') => '```' + lang + '\n' + source + '\n```'
const FLOW = 'flowchart LR\n  A[답글의 펜스] --> B{화면}'
const SEQ = 'sequenceDiagram\n  A->>B: hi'
const AT = '2026-10-13T02:00:00.000Z'
const LATER = '2026-10-13T03:00:00.000Z'
const SID = 'abcd1234-0000-4000-8000-000000000000'
const URL = 'https://claude.ai/artifact/KYjgvRqnb2NaRSyF2cmfEN'
const published = (version: number, url = URL) => ({ text: `Published /x/board.html at ${url} (Version ${version}, version id 1-a) Icon: "chart".` })

test('the context line is the last prose paragraph before the fence, plain and capped', () => {
  expect(contextOf('# Title\n\nFirst para.\n\nThe **focus** is `화면` — see [docs](https://x.y).\n\n')).toBe('The focus is 화면 — see docs.')
  // an earlier code block and a table are passed over
  expect(contextOf('Lead-in.\n\n```js\nconst a = 1\n\nconst b = 2\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n')).toBe('Lead-in.')
  expect(contextOf('')).toBe('')
  const long = contextOf('가'.repeat(500))
  expect(Array.from(long).length).toBe(MAX_CONTEXT)
  expect(long.endsWith('…')).toBe(true)
  expect(plainOf('- **bold** and *it* and __u__')).toBe('bold and it and u')
})

test('every mermaid and math fence becomes an entry, refused ones included, each with its context', () => {
  const refused = 'flowchart TD\n  subgraph S\n    A --> B\n  end'
  const texts = [`Lead.\n\n${fenced(FLOW)}\n\nMiddle words.\n\n${fenced('x^2', 'math')}`, `${fenced(refused)}`, '```python\nprint(1)\n```']
  const entries = entriesOf(texts, AT)
  expect(entries.map(e => [e.lang, e.context])).toEqual([
    ['mermaid', 'Lead.'],
    ['math', 'Middle words.'],
    ['mermaid', 'Middle words.'],
  ])
  expect(entries[2]!.source).toBe(refused)
  expect(entries.every(e => e.at === AT)).toBe(true)
})

test('newest first: a reply goes on top in its own order, a repeated figure moves up instead of duplicating', () => {
  const old: BoardEntry[] = [
    { lang: 'mermaid', source: SEQ, context: 'old seq', at: AT },
    { lang: 'mermaid', source: FLOW, context: 'old flow', at: AT },
  ]
  const fresh: BoardEntry[] = [
    { lang: 'math', source: 'a+b', context: 'new math', at: LATER },
    { lang: 'mermaid', source: FLOW + '\n', context: 'new flow', at: LATER },
    { lang: 'math', source: 'a+b', context: 'again', at: LATER },
  ]
  const merged = mergedOf(old, fresh)
  expect(merged.map(e => e.context)).toEqual(['new math', 'new flow', 'old seq'])
  expect(mergedOf(old, fresh, 2).length).toBe(2)
})

test('the page escapes sources, pins its CDN versions and carries the dark guard and local times', () => {
  const html = htmlOf({
    name: 'cc-plugin · abcd1234',
    url: URL,
    updatedAt: LATER,
    entries: [
      { lang: 'mermaid', source: 'flowchart LR\n  A["</pre><script>x</script>"] --> B', context: 'a < b & c', at: LATER },
      { lang: 'math', source: '\\frac{a}{b} < c', context: '', at: AT },
    ],
  })
  expect(html).toContain('<title>Figure Board</title>')
  expect(html).toContain('&lt;/pre&gt;&lt;script&gt;x&lt;/script&gt;')
  expect(html).not.toContain('<script>x</script>')
  expect(html).toContain('a &lt; b &amp; c')
  expect(html).toContain(`import mermaid from '${MERMAID}'`)
  expect(html).toContain(`import katex from '${KATEX}'`)
  expect(MERMAID).toMatch(/mermaid@\d+\.\d+\.\d+\//)
  expect(KATEX).toMatch(/katex@\d+\.\d+\.\d+\//)
  expect(html).toContain(":root:not([data-theme=\"light\"])")
  expect(html).toContain(':root[data-theme="dark"]')
  expect(html).toContain("securityLevel: 'strict'")
  expect(html).toContain(`datetime="${LATER}"`)
  expect(html).not.toContain('<link rel="stylesheet"')
  expect(html).not.toContain('import(')
  expect(html).toContain('2 figures')
})

test('a board URL is read from the publish text', () => {
  expect(urlOf(published(3).text)).toBe(URL)
  expect(urlOf('Published at https://claude.ai/code/artifact/abc-123 (Version 1')).toBe('https://claude.ai/code/artifact/abc-123')
  expect(urlOf('nothing here')).toBe(null)
})

const caller = (answers: ToolAnswer[]) => {
  const calls: Record<string, unknown>[] = []
  return {
    calls,
    call: async (input: Record<string, unknown>) => {
      calls.push(input)
      return answers.shift() ?? { isError: true, text: 'no answer' }
    },
  }
}

test('publishing: first publish names an icon and no url; a republish names the url', async () => {
  const first = caller([published(1)])
  expect(await publishBoard(first.call, '/x/board.html', null)).toEqual({ url: URL, log: [] })
  expect(first.calls).toEqual([{ tool: 'Artifact', action: 'publish', file_path: '/x/board.html', icon: 'chart', description: expect.any(String) }])
  const again = caller([published(2)])
  expect((await publishBoard(again.call, '/x/board.html', URL)).url).toBe(URL)
  expect(again.calls).toEqual([{ tool: 'Artifact', action: 'publish', file_path: '/x/board.html', url: URL }])
})

test('a refused republish reads the board and tries again; failing that it starts a fresh board', async () => {
  const resumed = caller([{ deny: 'not read in this conversation' }, { text: '<html>' }, published(4)])
  const ok = await publishBoard(resumed.call, '/x/board.html', URL)
  expect(ok.url).toBe(URL)
  expect(resumed.calls.map(c => c.action)).toEqual(['publish', 'read', 'publish'])
  expect(ok.log[0]).toContain('not read in this conversation')

  const NEW = 'https://claude.ai/artifact/NewBoard01'
  const lost = caller([{ isError: true, text: 'refused' }, { isError: true, text: 'gone' }, published(1, NEW)])
  const fresh = await publishBoard(lost.call, '/x/board.html', URL)
  expect(fresh.url).toBe(NEW)
  expect(lost.calls.map(c => [c.action, 'url' in c])).toEqual([['publish', true], ['read', true], ['publish', false]])
  expect(fresh.log.at(-1)).toBe('starting a fresh board')

  const thrown = { calls: 0, call: async () => { thrown.calls++; throw new Error('boom') } }
  expect(await publishBoard(thrown.call, '/x/board.html', null)).toEqual({ url: null, log: ['publishing the board was refused: boom'] })
})

test('a stored board is read back only in its own shape', () => {
  expect(boardOf(null)).toBe(null)
  expect(boardOf({ name: 'n', entries: [{ lang: 'mermaid', source: 's', context: '', at: AT }, { lang: 'svg', source: 's' }], url: 3 })).toEqual({
    name: 'n',
    url: null,
    updatedAt: '',
    entries: [{ lang: 'mermaid', source: 's', context: '', at: AT }],
  })
})

// The wiring: a turn's reply goes to the board after the turn ends, through the
// engine beneath the plugin (mocked here: tools, store, files, toasts). The board's
// work runs after the turn, so a test waits for the update's last store write.
const engine = (on: any, opts: { artifact?: boolean; answers?: ToolAnswer[] } = {}) => {
  const store = new Map<string, unknown>()
  const writes: { path: string; text: string }[] = []
  const calls: any[] = []
  const toasts: string[] = []
  const logs: string[] = []
  const done = { count: 0 }
  const answers: ToolAnswer[] = opts.answers ?? [published(1), published(2), published(3)]
  const value = (v: unknown) => ({ value: v })
  on('tool.list', () => value([{ name: 'Read' }, ...(opts.artifact === false ? [] : [{ name: 'Artifact' }])]))
  on('tool.call', (_$: any, e: any) => {
    calls.push(e)
    const answer = answers.shift() ?? { isError: true, text: 'no answer' }
    if (answer.deny !== undefined) return { deny: answer.deny }
    return { result: answer.text ?? '', text: answer.text ?? '', ...(answer.isError ? { isError: true } : {}) }
  })
  on('store.get', (_$: any, e: any) => value(store.get(e.key)))
  on('store.set', (_$: any, e: any) => {
    store.set(e.key, JSON.parse(JSON.stringify(e.value)))
    if (e.key === 'boards') done.count++
    return value(undefined)
  })
  on('store.delete', (_$: any, e: any) => (store.delete(e.key), value(undefined)))
  on('fs.write', (_$: any, e: any) => (writes.push({ path: e.path, text: e.text }), value(undefined)))
  on('ui.toast', (_$: any, e: any) => (toasts.push(e.text), value(undefined)))
  on('ui.log', (_$: any, e: any) => (logs.push(e.text), value(undefined)))
  on('clock.now', () => value(Date.parse(AT)))
  on('env.get', (_$: any, e: any) => value(e.name === 'HOME' ? '/home/test' : undefined))
  on('session.root', () => value('/work/cc-plugin'))
  on('session.id', () => value(SID))
  on('session.append', (_$: any, e: any, next: any) => next(e))
  on('turn.start', (_$: any, e: any) => ({ turnId: e.turnId }))
  on('turn.complete', (_$: any, e: any) => ({ text: e.answer }))
  return { store, writes, calls, toasts, logs, done }
}

type Io = ReturnType<typeof engine>

const reply = async ($: any, io: Io, texts: string[], turnId = 't1', expectUpdate = true) => {
  const from = io.done.count
  await $.turn.start({ text: 'draw', turnId })
  let n = 0
  for (const text of texts)
    await $.session.append({ door: 'response', origin: { kind: 'model', model: 'test' }, uuid: `${turnId}-${n++}`, message: { type: 'assistant', role: 'assistant', content: [{ type: 'text', text }] } })
  await $.turn.complete({ answer: texts.at(-1) ?? '', durationMs: 1, isAborted: false, turnId, reason: 'answer' })
  const until = Date.now() + (expectUpdate ? 3000 : 200)
  while (Date.now() < until && io.done.count === from) await new Promise(r => (globalThis as any).setTimeout(r, 10))
}

test('with the board on, a reply with a fence is written and published, and the next one republishes at the same URL', { options: { figureBoard: true } }, async ($, on) => {
  const io = engine(on)
  await reply($, io, [`The focus is the surface.\n\n${fenced(FLOW)}`])
  expect(io.logs).toEqual([])
  expect(io.writes.length).toBe(1)
  expect(io.writes[0]!.path).toMatch(/^\/home\/test\/\.claude\/ink-figure\/boards\/[^/]+\.html$/)
  expect(io.writes[0]!.text).toContain('The focus is the surface.')
  expect(io.writes[0]!.text).toContain('cc-plugin · ')
  expect(io.calls.length).toBe(1)
  expect(io.toasts).toEqual([`Figure board: ${URL}`])
  const id = SID
  expect((io.store.get(`board:${id}`) as any).url).toBe(URL)

  await reply($, io, [`Then a sequence.\n\n${fenced(SEQ)}`], 't2')
  expect(io.calls.length).toBe(2)
  expect(JSON.stringify(io.calls[1])).toContain(URL)
  expect(io.writes[1]!.text.indexOf('Then a sequence.')).toBeLessThan(io.writes[1]!.text.indexOf('The focus is the surface.'))
  expect(io.toasts.length).toBe(1)
  expect(io.store.get('boards')).toEqual([{ id, at: AT }])
  expect((await $.command.run({ command: 'figure-board' } as any)).text).toContain(URL)
})

test('a resumed session whose republish is refused reads the board and republishes it', { options: { figureBoard: true } }, async ($, on) => {
  const io = engine(on, { answers: [{ deny: 'not read in this conversation' }, { text: '<html>' }, published(5)] })
  const id = SID
  io.store.set(`board:${id}`, { name: 'cc-plugin · old', url: URL, updatedAt: AT, entries: [{ lang: 'mermaid', source: SEQ, context: 'before the resume', at: AT }] })
  await reply($, io, [`After the resume.\n\n${fenced(FLOW)}`])
  expect(io.calls.map((c: any) => (JSON.stringify(c).includes('"read"') ? 'read' : 'publish'))).toEqual(['publish', 'read', 'publish'])
  expect((io.store.get(`board:${id}`) as any).url).toBe(URL)
  expect(io.writes[0]!.text).toContain('before the resume')
  expect(io.logs.some(l => l.includes('not read in this conversation'))).toBe(true)
})

test('a reply with no fence, or a session without the Artifact tool, publishes nothing', { options: { figureBoard: true } }, async ($, on) => {
  const io = engine(on, { artifact: false })
  await reply($, io, ['just words'], 't1', false)
  await reply($, io, [fenced(FLOW)], 't2', false)
  expect(io.calls).toEqual([])
  expect(io.writes).toEqual([])
})

test('with the board off (the default), nothing is written or published', async ($, on) => {
  const io = engine(on)
  await reply($, io, [fenced(FLOW)], 't1', false)
  expect(io.calls).toEqual([])
  expect(io.writes).toEqual([])
  expect(io.store.size).toBe(0)
})
