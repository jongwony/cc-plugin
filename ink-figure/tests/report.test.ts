import { expect, test } from 'claude-code/testing'
import { grammarOf } from '../hooks/grammar.ts'
import { reportOf } from '../hooks/report.ts'

// a fence outside the drawn grammar: a dotted edge
const BAD = [
  'flowchart TD',
  '  A[반복되는 교정] --> B{판정이 정해진 상태만으로 나오는가}',
  '  B -.-> C[Lean: 표현 자체를 불가능하게]',
  '  B -->|문맥이 정함| E[판단: 리뷰]',
].join('\n')
const GOOD = 'graph LR\n  A[request] --> B[cache]\n  B --> C[resp]'
const fenced = (source: string) => '```mermaid\n' + source + '\n```'
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
  expect(unseen).toContain('no terminal has drawn a reply this session')
})

const turn = async ($: any, on: any, texts: string[], reason: 'answer' | 'aborted' = 'answer') => {
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
    })
  await $.turn.complete({ answer: texts.at(-1) ?? '', durationMs: 1, isAborted: reason === 'aborted', turnId: 't1', reason })
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
