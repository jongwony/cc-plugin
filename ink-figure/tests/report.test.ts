import { expect, test } from 'claude-code/testing'
import { grammarOf } from '../hooks/grammar.ts'
import { cached, verdictsOf } from '../hooks/figures.ts'
import { reportOf } from '../hooks/report.ts'

// a fence outside the drawn grammar: a dotted edge
const BAD = [
  'flowchart TD',
  '  A[반복되는 교정] --> B{판정이 정해진 상태만으로 나오는가}',
  '  B -.-> C[Lean: 표현 자체를 불가능하게]',
  '  B -->|문맥이 정함| E[판단: 리뷰]',
].join('\n')
const GOOD = 'graph LR\n  A[request] --> B[cache]\n  B --> C[resp]'
const fenced = (source: string, lang = 'mermaid') => '```' + lang + '\n' + source + '\n```'
const REASON = (grammarOf(BAD, 'flowchart') as { error: string }).error

test('a fence outside the drawn grammar is reported with the grammar reason', () => {
  const text = reportOf([`prose\n\n${fenced(GOOD)}\n\nmore\n\n${fenced(BAD)}`], 140)
  expect(REASON).toContain('a statement outside the drawn grammar')
  expect(text).toContain(REASON)
  expect(text).toContain('figure 2 (mermaid flowchart)')
  expect(text).toContain('do not re-emit')
})

test('a reply whose fences all draw, or that has none, reports nothing', () => {
  expect(reportOf([`prose\n\n${fenced(GOOD)}`], 140)).toBe(null)
  expect(reportOf(['no figures here'], 140)).toBe(null)
})

test('a figure wider than the room reports its cells and the terminal it was measured against', () => {
  const wide = 'graph LR\n' + Array.from({ length: 6 }, (_, i) => `  N${i}[a rather long label number ${i}] --> N${i + 1}[a rather long label number ${i + 1}]`).join('\n')
  const seen = reportOf([fenced(wide)], 60)
  expect(seen).toContain('the terminal last seen was 60 columns (room 54)')
  const unseen = reportOf([fenced(wide)], null)
  expect(unseen).toContain('over the 80-column default (room 74)')
})

test('with no terminal seen, the row says every fence shows as source and the verdicts are the terminal renderer\'s', () => {
  const text = reportOf([`${fenced(GOOD)}\n\n${fenced(BAD)}`], null)!
  expect(text).toContain('the surface in use shows every fence as its source')
  expect(text).toContain("the terminal renderer's verdicts")
  expect(text).not.toContain('the reader sees')
})

test('a reason that holds the whole reply is reported beside each fence\'s own reason, not in its place', () => {
  // the definition sits inside another code block; the bad fence still reports its grammar error
  const definition = reportOf(['```markdown\n[1]: https://example.com\n```\n\n' + fenced(BAD)], 140)!
  expect(definition).toContain(REASON)
  expect(definition).toContain('link reference or footnote definition')
  // an undrawn fence's long source joined to the prose beside it
  const long = BAD + '\n' + Array.from({ length: 400 }, (_, i) => `  style C fill:#f9f${i}`).join('\n')
  const joined = reportOf(['p'.repeat(6000) + '\n\n' + fenced(long) + '\n\n' + fenced(GOOD)], 140)!
  expect(joined).toContain(REASON)
  expect(joined).toContain("an undrawn fence's source joined to the prose")
  expect(joined).toContain('(1 would draw on its own)')
})

test('a measured verdict lays a formula out without drawing it into the cache', () => {
  const before = cached()
  const verdict = verdictsOf(fenced('x^2 + \\frac{a}{b}', 'math'), 120, undefined, undefined, true)
  expect(verdict.fences[0]!.drawn).toBe(true)
  expect(verdict.pieces).toBe(null)
  expect(cached()).toEqual(before)
})

const turn = async ($: any, on: any, texts: string[], reason: 'answer' | 'aborted' = 'answer', agentId?: string, rowAgent?: string) => {
  const notes: string[] = []
  on('session.append', ($: any, e: any, next: any) => {
    if (e.door === 'note') notes.push(...e.message.content.map((b: any) => b.text))
    return next(e)
  })
  on('turn.start', ($: any, e: any) => ({ turnId: e.turnId }))
  on('turn.complete', ($: any, e: any) => ({ text: e.answer }))
  await $.turn.start({ text: 'draw it', turnId: 't1' })
  let n = 0
  for (const text of texts)
    await $.session.append({
      door: 'response',
      origin: { kind: 'model', model: 'test' },
      uuid: `row-${n++}`,
      message: { type: 'assistant', role: 'assistant', content: [{ type: 'text', text }] },
      ...(rowAgent ? { agentId: rowAgent } : {}),
    })
  await $.turn.complete({ answer: texts.at(-1) ?? '', durationMs: 1, isAborted: reason === 'aborted', turnId: 't1', reason, ...(agentId ? { agentId } : {}) })
  return notes
}

test('a turn whose reply held an undrawn fence appends one row the model reads', async ($, on) => {
  const notes = await turn($, on, [`first\n\n${fenced(BAD)}`, 'then a tool ran, and the closing words'])
  expect(notes.length).toBe(1)
  expect(notes[0]).toContain(REASON)
})

test('a turn whose fences all draw appends nothing', async ($, on) => {
  expect(await turn($, on, [fenced(GOOD)])).toEqual([])
})

test('an aborted turn appends nothing', async ($, on) => {
  expect(await turn($, on, [fenced(BAD)], 'aborted')).toEqual([])
})

test("a subagent's response rows are not reported as the main reply's", async ($, on) => {
  expect(await turn($, on, [fenced(BAD)], 'answer', undefined, 'sub-1')).toEqual([])
})

test("a subagent's turn end appends nothing", async ($, on) => {
  expect(await turn($, on, [fenced(BAD)], 'answer', 'sub-1')).toEqual([])
})

test('a terminal that drew a reply without a viewport is the default-width terminal it drew at, not none', async ($, on) => {
  const notes: string[] = []
  on('session.append', ($: any, e: any, next: any) => {
    if (e.door === 'note') notes.push(...e.message.content.map((b: any) => b.text))
    return next(e)
  })
  on('turn.start', ($: any, e: any) => ({ turnId: e.turnId }))
  on('turn.complete', ($: any, e: any) => ({ text: e.answer }))
  const ui = await $.ui.mount({ plugin: 'ink-figure', surface: 'terminal', component: 'AssistantMessage', props: { text: fenced(GOOD) } } as any)
  await ui.unmount()
  const wide = 'graph LR\n' + Array.from({ length: 6 }, (_, i) => `  N${i}[a rather long label number ${i}] --> N${i + 1}[a rather long label number ${i + 1}]`).join('\n')
  await $.turn.start({ text: 'draw it', turnId: 't1' })
  await $.session.append({ door: 'response', origin: { kind: 'model', model: 'test' }, uuid: 'row-0', message: { type: 'assistant', role: 'assistant', content: [{ type: 'text', text: fenced(wide) }] } } as any)
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as any)
  expect(notes.length).toBe(1)
  expect(notes[0]).toContain('the terminal last seen was 80 columns (room 74)')
})
