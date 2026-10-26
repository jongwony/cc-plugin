import { expect, test, type TestBody } from 'claude-code/testing'

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
  paths.map(p => `:100644 100644 old-${p} new-${p} M\0${p}\0`).join('') + paths.map(p => `${added}\t${deleted}\t${p}\0`).join('') + '\0'

const result = (stdout: string, exitCode = 0) => ({
  exitCode,
  stdout: exitCode === 0 ? stdout : '',
  stderr: exitCode === 0 ? '' : stdout,
  isStdoutTruncated: false,
  isStderrTruncated: false,
})

function pr(n: number) {
  return { number: n, title: `Title ${n}`, url: `https://github.com/o/r/pull/${n}`, headRefName: `b${n}`, baseRefName: 'main' }
}

/** What the next answers hold: how many files a PR has, and whether a file read fails. */
const state = { files: 2, failRead: false }

/** Answers the host commands loadDiff makes; PR 1's view waits on `gate`. */
function answer(argv: readonly string[], gate: Promise<void>): Promise<ReturnType<typeof result>> | ReturnType<typeof result> {
  const s = argv.join(' ')
  if (s.startsWith('gh pr view 1 ')) return gate.then(() => result(JSON.stringify(pr(1))))
  if (s.startsWith('gh pr view 2 ')) return result(JSON.stringify(pr(2)))
  if (s.startsWith('gh pr view 3 ')) return result(JSON.stringify(pr(3)))
  if (s.startsWith('gh repo view')) return result(JSON.stringify({ nameWithOwner: 'o/r' }))
  if (s.includes('--show-toplevel')) return result('/repo')
  if (s.includes('remote -v')) return result('origin\thttps://github.com/o/r.git (fetch)\n')
  if (s.includes(' ls-remote ')) return result(argv.slice(argv.indexOf('ls-remote') + 2).map(n => `${'c'.repeat(40)}\t${n}`).join('\n'))
  if (s.includes(' fetch ')) return result('')
  if (s.includes('merge-base')) return result('m'.repeat(40))
  if (s.includes('--raw')) return result(state.files === 0 ? '' : inv(['src/one.ts', 'src/two.ts'], 1, 1))
  if (state.failRead && s.endsWith('new-src/one.ts')) return result('fatal: bad object', 128)
  if (s.endsWith('old-src/one.ts new-src/one.ts')) return result('diff --git a/src/one.ts b/src/one.ts\n--- a/src/one.ts\n+++ b/src/one.ts\n@@ -1 +1 @@\n-old\n+new\n')
  if (s.endsWith('old-src/two.ts new-src/two.ts')) return result('diff --git a/src/two.ts b/src/two.ts\n--- a/src/two.ts\n+++ b/src/two.ts\n@@ -1 +1 @@\n-two\n+TWO\n')
  return result(`unexpected ${s}`, 2)
}

/** A mount of the pane once it draws `text`: a pane mounted while a load runs is drawn again only on an act. */
async function paneWith<M extends { find(q: { type: string; text: RegExp }): Promise<unknown>; unmount(): Promise<void> }>(
  mount: () => Promise<M>,
  text: RegExp,
): Promise<M> {
  for (let i = 0; i < 200; i += 1) {
    const ui = await mount()
    if (await ui.find({ type: 'Text', text })) return ui
    await ui.unmount()
    await null
  }
  return mount()
}

const args = (a: string) => ({ command: 'prdiff', args: a, origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 160 } })

/** The engine answers every test needs from beneath the plugin. */
function engine(
  on: Parameters<TestBody>[1],
  gate: Promise<void> = Promise.resolve(),
  saw: (argv: readonly string[]) => void = () => {},
) {
  on('command.register', () => ({ value: { command: 'prdiff' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('env.get', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', async (_, e) => {
    saw(e.argv)
    return { value: await answer(e.argv, gate) }
  })
}

test('/prdiff N lists the PR\'s files and draws the first one', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(args('2'))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await paneWith(() => $.ui.mount({ ...PANE, surface }), /^1\/2 /)
    expect(await ui.find({ type: 'Text', text: /#2 Title 2/ })).toBeDefined()
    expect(await ui.find({ key: 'goto:0' })).toBeDefined()
    expect(await ui.find({ key: 'goto:1' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^1\/2 M src\/one\.ts/ })).toBeDefined()
    const code = await ui.find({ type: 'Code' })
    expect(String(code?.props.source)).toBe('@@ -1,1 +1,1 @@\n-old\n+new')
    await ui.unmount()
  }
})

test('j and a file in the list each draw that file, read only when it is opened', async ($, on) => {
  const reads: string[] = []
  engine(on, Promise.resolve(), argv => {
    if (String(argv.at(-1)).startsWith('new-')) reads.push(String(argv.at(-1)).slice(4))
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(args('2'))
  const ui = await paneWith(() => $.ui.mount({ ...PANE, surface: 'terminal' }), /^1\/2 /)
  expect(reads).toEqual(['src/one.ts'])
  // The kit implements no `$.ui.scroll`: a pick's scroll to the pane's start fails here after the file is open.
  const noScroll = 'no implementation for ui.scroll'
  await expect(ui.press({ key: 'next' })).rejects.toThrow(noScroll)
  expect(await ui.find({ type: 'Text', text: /^2\/2 M src\/two\.ts/ })).toBeDefined()
  expect(String((await ui.find({ type: 'Code' }))?.props.source)).toContain('+TWO')
  await expect(ui.press({ key: 'goto:0' })).rejects.toThrow(noScroll)
  expect(await ui.find({ type: 'Text', text: /^1\/2 M src\/one\.ts/ })).toBeDefined()
  // A file already read is not read again.
  expect(reads).toEqual(['src/one.ts', 'src/two.ts'])
  await ui.unmount()
})

test('a slower earlier load never overwrites the PR asked for later', async ($, on) => {
  let release = () => {}
  const gate = new Promise<void>(r => {
    release = r
  })
  engine(on, gate)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(args('1'))
  await $.command.run(args('2'))
  const ui = await paneWith(() => $.ui.mount({ ...PANE, surface: 'terminal' }), /#2 Title 2/)
  release()
  for (let i = 0; i < 200; i += 1) await null
  await ui.unmount()
  const after = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await after.find({ type: 'Text', text: /#2 Title 2/ })).toBeDefined()
  expect(await after.find({ type: 'Text', text: /Title 1/ })).toBe(undefined)
  await after.unmount()
})

test('/prdiff N returns while its load is still running', async ($, on) => {
  let release = () => {}
  const gate = new Promise<void>(r => {
    release = r
  })
  engine(on, gate)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  let returned = false
  const ran = $.command.run(args('1')).then(r => {
    returned = true
    return r
  })
  for (let i = 0; i < 200 && !returned; i += 1) await null
  expect(returned).toBe(true)
  release()
  await ran
  const ui = await paneWith(() => $.ui.mount({ ...PANE, surface: 'terminal' }), /#1 Title 1/)
  expect(await ui.find({ type: 'Text', text: /#1 Title 1/ })).toBeDefined()
  await ui.unmount()
})

test('/prdiff without a PR number says how to use it and opens nothing', async ($, on) => {
  const opened: string[] = []
  on('command.register', () => ({ value: { command: 'prdiff' } }))
  on('ui.open', (_, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  for (const a of ['', '12abc']) expect((await $.command.run(args(a))).text).toBe('Usage: /prdiff <PR number>')
  expect(opened).toEqual([])
})

test('a new PR starts with no file state from the last one, and a late read of the last one is not shown', async ($, on) => {
  state.failRead = true
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(args('2'))
  const first = await paneWith(() => $.ui.mount({ ...PANE, surface: 'terminal' }), /fatal: bad object/)
  await first.unmount()
  state.failRead = false
  state.files = 0
  await $.command.run(args('3'))
  const ui = await paneWith(() => $.ui.mount({ ...PANE, surface: 'terminal' }), /#3 Title 3/)
  expect(await ui.find({ type: 'Text', text: /fatal: bad object/ })).toBe(undefined)
  expect(await ui.find({ type: 'Text', text: /Loading/ })).toBe(undefined)
  // With no files there is nothing for j and k to move through.
  expect(await ui.find({ key: 'next' })).toBe(undefined)
  expect(await ui.find({ key: 'reload' })).toBeDefined()
  await ui.unmount()
  state.files = 2
})

test('before any PR is open the pane offers no keys', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Run \/prdiff <PR number>/ })).toBeDefined()
  expect(await ui.findAll({ type: 'Button' })).toEqual([])
  await ui.unmount()
})
