import { expect, test } from 'claude-code/testing'
import { forkId } from '../hooks/fork-id.ts'

const row = (line: string) => `<local-command-stdout>${line}</local-command-stdout>`

test('both confirmation states yield the id', () => {
  expect(forkId(row('session running · 37473ad2'))).toBe('37473ad2')
  expect(forkId(row('session waiting for a prompt · 37473ad2'))).toBe('37473ad2')
})

test('an optional name and an optional chip around the id', () => {
  expect(forkId(row('session running · test ⑂ 재테스트2 · 37473ad2'))).toBe('37473ad2')
  expect(forkId(row('session running · x · 37473ad2 · edits this checkout'))).toBe('37473ad2')
  expect(forkId(row('session waiting for a prompt · deadbeef · runs in the origin tree'))).toBe('deadbeef')
})

test('the confirmation 2.1.307 prints for a fork of a named background session', () => {
  expect(forkId(row('session running · stint::fd-2310-gateway-impl ⑂ artifact 를 ghostty 에서 볼 수 있는 mod가 있는지 찾아봅시다 · 2d0a9d9b'))).toBe('2d0a9d9b')
  expect(forkId(row('session running · stint::fd-2310-gateway-impl ⑂ artifact 를 ghostty 에서 볼 수 있는 mod가 있는지 찾아봅시다 · session test · 4f298746'))).toBe('4f298746')
})

test('a name that is itself 8 hex digits is followed by the id, which wins', () => {
  expect(forkId(row('session running · deadbeef · 37473ad2'))).toBe('37473ad2')
})

test('anything outside the grammar yields undefined', () => {
  expect(forkId('session running · x · 37473ad2')).toBe(undefined)
  expect(forkId(row('session running · x · 37473ad2\nsession running · y · 11111111'))).toBe(undefined)
  expect(forkId(row('Branched conversation "test". You are now in the new branch (session 71f8e958-71a6-4fc3-808e-3cd57558c207).'))).toBe(undefined)
})
