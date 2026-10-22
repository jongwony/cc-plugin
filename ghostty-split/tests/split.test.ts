import { expect, test } from 'claude-code/testing'
import { SPLIT } from '../hooks/fork.ts'

// A `\"` written in the template literal reaches osascript as a bare `"`: the string closes early and the stray
// quotes meet as `""`, so the script fails to compile (-2741) and every split fails. The script holds no empty
// string, so `""` only ever comes from that.
test('the split script carries no quote broken by template-literal escaping', () => {
  expect(SPLIT.split('\n').filter(line => line.includes('""'))).toEqual([])
})
