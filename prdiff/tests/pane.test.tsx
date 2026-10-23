import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'prdiff',
  component: 'Pane',
  requestId: 'prdiff',
  props: {
    title: 'PR diff',
    isFocused: true,
    bodyColumns: 80,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

const result = (stdout: string, exitCode = 0) => ({ exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false })

function pr(n: number) {
  return { number: n, title: `Title ${n}`, url: `https://github.com/o/r/pull/${n}`, headRefName: `b${n}`, headRefOid: 'h'.repeat(40), baseRefName: 'main' }
}

/** Answers the host commands loadDiff and listPrs make; PR 1's view waits on `gate`. */
function answer(argv: readonly string[], gate: Promise<void>): Promise<ReturnType<typeof result>> | ReturnType<typeof result> {
  const s = argv.join(' ')
  if (s === 'gh pr view --json number') return result('', 1)
  if (s.startsWith('gh pr view 1 ')) return gate.then(() => result(JSON.stringify(pr(1))))
  if (s.startsWith('gh pr view 2 ')) return result(JSON.stringify(pr(2)))
  if (s.startsWith('gh pr list')) {
    return result(JSON.stringify([1, 2].map(n => ({ ...pr(n), author: { login: 'me' }, isDraft: false }))))
  }
  if (s.startsWith('gh repo view')) return result(JSON.stringify({ nameWithOwner: 'o/r' }))
  if (s.includes('--show-toplevel')) return result('/repo')
  if (s.includes('remote -v')) return result('origin\thttps://github.com/o/r.git (fetch)\n')
  if (s.includes(' fetch ')) return result('')
  if (s.includes('rev-parse --verify')) return result('c'.repeat(40))
  if (s.includes('merge-base')) return result('m'.repeat(40))
  if (s.includes('--numstat')) return result('1\t1\tsrc/one.ts\0')
  if (s.includes(' -p ')) return result('diff --git a/src/one.ts b/src/one.ts\n--- a/src/one.ts\n+++ b/src/one.ts\n@@ -1 +1 @@\n-old\n+new\n')
  return result(`unexpected ${s}`, 2)
}

test('the list shows the PRs and a press opens one diff as a stream of files', async ($, on) => {
  on('command.register', () => ({ value: { command: 'prdiff' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', async (_, e) => ({ value: await answer(e.argv, Promise.resolve()) }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'prdiff', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ key: 'pr:2' }))).toBeDefined()
    await ui.press({ key: 'pr:2' })
    expect(await ui.find({ type: 'Text', text: /#2 Title 2/ })).toBeDefined()
    expect(await ui.find({ key: 'goto:0' })).toBeDefined()
    expect(await ui.find({ key: 'file:0' })).toBeDefined()
    expect(await ui.find({ type: 'Code' })).toBeDefined()
    await ui.press({ key: 'back' })
    expect(await ui.find({ key: 'pr:1' })).toBeDefined()
    await ui.unmount()
  }
})

test('a slower earlier load never overwrites the PR asked for later', async ($, on) => {
  let release = () => {}
  const gate = new Promise<void>(r => {
    release = r
  })
  on('command.register', () => ({ value: { command: 'prdiff' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', async (_, e) => ({ value: await answer(e.argv, gate) }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'prdiff', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const first = ui.press({ key: 'pr:1' })
  // Let PR 1's handler reach its slow `gh pr view` before the next act.
  for (let i = 0; i < 200 && !(await ui.find({ key: 'back' })); i += 1) await null
  await ui.press({ key: 'back' })
  await ui.press({ key: 'pr:2' })
  release()
  await first
  expect(await ui.find({ type: 'Text', text: /#2 Title 2/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Title 1/ })).toBe(undefined)
  await ui.unmount()
})
