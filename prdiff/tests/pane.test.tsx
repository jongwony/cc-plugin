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

/** The `--raw --numstat -z` records of `paths`, each added or changed by `added`/`deleted` lines. */
const inv = (paths: string[], added = 1, deleted = 0) =>
  paths.map(p => `:100644 100644 1111111 2222222 M\0${p}\0`).join('') + paths.map(p => `${added}\t${deleted}\t${p}\0`).join('') + '\0'

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
  if (s.includes(' ls-remote ')) return result(argv.slice(argv.indexOf('ls-remote') + 2).map(n => `${'c'.repeat(40)}\t${n}`).join('\n'))
  if (s.includes(' fetch ')) return result('')
  if (s.includes('rev-parse --verify')) return result('c'.repeat(40))
  if (s.includes('merge-base')) return result('m'.repeat(40))
  if (s.includes('--raw')) return result(inv(['src/one.ts'], 1, 1) + 'diff --git a/src/one.ts b/src/one.ts\n--- a/src/one.ts\n+++ b/src/one.ts\n@@ -1 +1 @@\n-old\n+new\n')
  return result(`unexpected ${s}`, 2)
}

/** A mount of the pane once the list a bare `/prdiff` starts without awaiting is drawn. */
async function listedPane<M extends { find(q: { key: string }): Promise<unknown>; unmount(): Promise<void> }>(mount: () => Promise<M>): Promise<M> {
  for (let i = 0; i < 200; i += 1) {
    const ui = await mount()
    if (await ui.find({ key: 'pr:1' })) return ui
    await ui.unmount()
    await null
  }
  return mount()
}

test('the list shows the PRs and a press opens one diff as a stream of files', async ($, on) => {
  on('command.register', () => ({ value: { command: 'prdiff' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('env.get', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', async (_, e) => ({ value: await answer(e.argv, Promise.resolve()) }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'prdiff', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await listedPane(() => $.ui.mount({ ...PANE, surface }))
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
  on('env.get', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', async (_, e) => ({ value: await answer(e.argv, gate) }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'prdiff', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } })
  const ui = await listedPane(() => $.ui.mount({ ...PANE, surface: 'terminal' }))
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

test('scrolling while another PR loads leaves that PR to open at its top', async ($, on) => {
  let release = () => {}
  const gate = new Promise<void>(r => {
    release = r
  })
  const many = Array.from({ length: 40 }, (_, i) => `f${i}.txt`)
  on('command.register', () => ({ value: { command: 'prdiff' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('env.get', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', async (_, e) => {
    const s = e.argv.join(' ')
    // PR 1 is long and loads at once; PR 2 waits on the gate.
    if (s.startsWith('gh pr view 2 ')) await gate
    if (s.includes('--raw')) {
      return { value: result(inv(many) + many.map(f => `diff --git a/${f} b/${f}\n--- a/${f}\n+++ b/${f}\n@@ -1 +1,2 @@\n x\n+y\n`).join('')) }
    }
    return { value: await answer(e.argv, Promise.resolve()) }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'prdiff', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } })
  const ui = await listedPane(() => $.ui.mount({ ...PANE, surface: 'terminal' }))
  await ui.press({ key: 'pr:1' })
  expect(await ui.find({ type: 'Text', text: /#1 Title 1/ })).toBeDefined()
  await ui.press({ key: 'back' })
  const second = ui.press({ key: 'pr:2' })
  for (let i = 0; i < 200 && !(await ui.find({ type: 'Text', text: /Loading #2/ })); i += 1) await null
  expect(await ui.find({ type: 'Text', text: /Loading #2/ })).toBeDefined()
  await ui.press({ key: 'down' })
  await ui.press({ key: 'next' })
  for (let i = 0; i < 50; i += 1) await null
  release()
  await second
  for (let i = 0; i < 200 && !(await ui.find({ type: 'Text', text: /#2 Title 2/ })); i += 1) await null
  expect(await ui.find({ type: 'Text', text: /#2 Title 2/ })).toBeDefined()
  // The window is at the top: the file line names no file yet.
  expect(await ui.find({ type: 'Text', text: /^files$/ })).toBeDefined()
  await ui.unmount()
})

test('after the pane grows, the first move up starts from the top on screen', async ($, on) => {
  const lines = Array.from({ length: 200 }, (_, i) => `+l${i}`)
  on('command.register', () => ({ value: { command: 'prdiff' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('env.get', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', async (_, e) => {
    const s = e.argv.join(' ')
    if (s.includes('--raw')) return { value: result(inv(['long.txt'], 200) + `diff --git a/long.txt b/long.txt\n--- a/long.txt\n+++ b/long.txt\n@@ -0,0 +1,200 @@\n${lines.join('\n')}\n`) }
    return { value: await answer(e.argv, Promise.resolve()) }
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'prdiff', args: '1', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } })
  const firstLine = async (ui: { find: (q: { type: string }) => Promise<{ props: Record<string, unknown> } | undefined> }) =>
    String((await ui.find({ type: 'Code' }))?.props.source ?? '').split('\n')[1]
  const small = await $.ui.mount({ ...PANE, surface: 'terminal' })
  for (let i = 0; i < 30; i += 1) await small.press({ key: 'down' })
  await small.unmount()
  const tall = await $.ui.mount({ ...PANE, props: { ...PANE.props, scroll: { offset: 0, bodyRows: 120 } }, surface: 'terminal' })
  const before = await firstLine(tall)
  await tall.press({ key: 'up' })
  expect(await firstLine(tall)).not.toBe(before)
  await tall.unmount()
})

test('a failed refresh keeps the repository and current PR the list already showed', async ($, on) => {
  let lists = 0
  on('command.register', () => ({ value: { command: 'prdiff' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('env.get', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', async (_, e) => {
    const s = e.argv.join(' ')
    if (s.startsWith('gh pr list')) {
      lists += 1
      if (lists > 1) return { value: result('', 1) }
    }
    return { value: await answer(e.argv, Promise.resolve()) }
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'prdiff', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } })
  const ui = await listedPane(() => $.ui.mount({ ...PANE, surface: 'terminal' }))
  expect(await ui.find({ type: 'Text', text: /Pull requests · o\/r/ })).toBeDefined()
  await ui.press({ key: 'reload' })
  for (let i = 0; i < 200 && !(await ui.find({ type: 'Text', text: /Could not list PRs/ })); i += 1) await null
  expect(await ui.find({ type: 'Text', text: /Could not list PRs/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Pull requests · o\/r/ })).toBeDefined()
  await ui.unmount()
})

test('/prdiff N returns while its load is still running', async ($, on) => {
  let release = () => {}
  const gate = new Promise<void>(r => {
    release = r
  })
  on('command.register', () => ({ value: { command: 'prdiff' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('env.get', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', async (_, e) => ({ value: await answer(e.argv, gate) }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  let returned = false
  const ran = $.command
    .run({ command: 'prdiff', args: '1', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } })
    .then(r => {
      returned = true
      return r
    })
  for (let i = 0; i < 200 && !returned; i += 1) await null
  expect(returned).toBe(true)
  release()
  await ran
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  for (let i = 0; i < 200 && !(await ui.find({ type: 'Text', text: /#1 Title 1/ })); i += 1) await null
  expect(await ui.find({ type: 'Text', text: /#1 Title 1/ })).toBeDefined()
  await ui.unmount()
})

test('a move still running when another PR opens never writes its top over the new one', async ($, on) => {
  let release = () => {}
  const gate = new Promise<void>(r => {
    release = r
  })
  const many = Array.from({ length: 40 }, (_, i) => `f${i}.txt`)
  on('command.register', () => ({ value: { command: 'prdiff' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('env.get', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', async (_, e) => {
    const s = e.argv.join(' ')
    if (s.startsWith('gh pr view 2 ')) await gate
    if (s.includes('--raw')) {
      return { value: result(inv(many) + many.map(f => `diff --git a/${f} b/${f}\n--- a/${f}\n+++ b/${f}\n@@ -1 +1,2 @@\n x\n+y\n`).join('')) }
    }
    return { value: await answer(e.argv, Promise.resolve()) }
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'prdiff', args: '1', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  for (let i = 0; i < 200 && !(await ui.find({ type: 'Text', text: /#1 Title 1/ })); i += 1) await null
  const opening = $.command.run({ command: 'prdiff', args: '2', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } })
  for (let i = 0; i < 20; i += 1) await null
  const moving = ui.press({ key: 'next' })
  await Promise.all([moving, opening])
  release()
  for (let i = 0; i < 400 && !(await ui.find({ type: 'Text', text: /#2 Title 2/ })); i += 1) await null
  expect(await ui.find({ type: 'Text', text: /#2 Title 2/ })).toBeDefined()
  const fl = await ui.find({ type: 'Text', text: /^(files|file \d)/ })
  expect(fl?.text).toBe('files')
  await ui.unmount()
})

test('/prdiff with an argument that is not a PR number opens the list and says so', async ($, on) => {
  on('command.register', () => ({ value: { command: 'prdiff' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('env.get', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', async (_, e) => ({ value: await answer(e.argv, Promise.resolve()) }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const r = await $.command.run({ command: 'prdiff', args: '12abc', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } })
  expect(r.text).toBe('PR diff pane opened on the list: "12abc" is not a PR number.')
  const ui = await listedPane(() => $.ui.mount({ ...PANE, surface: 'terminal' }))
  expect(await ui.find({ key: 'pr:1' })).toBeDefined()
  await ui.unmount()
})
