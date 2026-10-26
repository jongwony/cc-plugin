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
  paths.map(p => `:100644 100644 old-${p} new-${p} M\0${p}\0`).join('') + paths.map(p => `${added}\t${deleted}\t${p}\0`).join('')

const result = (stdout: string, exitCode = 0) => ({
  exitCode,
  stdout: exitCode === 0 ? stdout : '',
  stderr: exitCode === 0 ? '' : stdout,
  isStdoutTruncated: false,
  isStderrTruncated: false,
})

function pr(n: number) {
  return { number: n, title: `Title ${n}`, url: `https://github.com/o/r/pull/${n}`, headRefName: `b${n}`, headRefOid: 'c'.repeat(40), baseRefName: 'main' }
}

/** What the next answers hold: how many files a PR has, and whether a file read fails. */
const state: { files: number; failRead: boolean | string; readGate?: Promise<void>; patch?: string } = { files: 2, failRead: false }

/** Answers the host commands loadDiff makes; PR 1's view waits on `gate`. */
function answer(argv: readonly string[], gate: Promise<void>): Promise<ReturnType<typeof result>> | ReturnType<typeof result> {
  const s = argv.join(' ')
  if (s.startsWith('gh pr view 1 ')) return gate.then(() => result(JSON.stringify(pr(1))))
  if (s.startsWith('gh pr view 2 ')) return result(JSON.stringify(pr(2)))
  if (s.startsWith('gh pr view 3 ')) return result(JSON.stringify(pr(3)))
  if (s.includes('--show-toplevel')) return result('/repo')
  if (s.includes('remote -v')) return result('origin\thttps://github.com/o/r.git (fetch)\n')
  if (s.includes(' ls-remote ')) return result(argv.slice(argv.indexOf('ls-remote') + 3).map(n => `${'c'.repeat(40)}\t${n}`).join('\n'))
  if (s.includes(' fetch ')) return result('')
  if (s.includes('merge-base')) return result('m'.repeat(40))
  if (s.includes('--raw')) return result(state.files === 0 ? '' : inv(['src/one.ts', 'src/two.ts', ...Array.from({ length: state.files - 2 }, (_, i) => `src/f${i}.ts`)], 1, 1))
  if (state.failRead && s.endsWith(':src/one.ts')) return result(typeof state.failRead === 'string' ? state.failRead : 'fatal: bad object', 128)
  if (state.readGate && s.endsWith('.ts') && s.includes(':src/')) return state.readGate.then(() => answer(argv, gate))
  if (state.patch !== undefined && s.endsWith(':src/one.ts')) return result(state.patch)
  if (s.endsWith(':src/one.ts')) return result('diff --git a/old-src/one.ts b/new-src/one.ts\n--- a/old-src/one.ts\n+++ b/new-src/one.ts\n@@ -1 +1 @@\n-old\n+new\n')
  if (s.endsWith(':src/two.ts')) return result('diff --git a/old-src/two.ts b/new-src/two.ts\n--- a/old-src/two.ts\n+++ b/new-src/two.ts\n@@ -1 +1 @@\n-two\n+TWO\n')
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
    if (/^[0-9a-f]{40}:/.test(String(argv.at(-1)))) reads.push(String(argv.at(-1)).slice(41))
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(args('2'))
  const ui = await paneWith(() => $.ui.mount({ ...PANE, surface: 'terminal' }), /^1\/2 /)
  expect(reads).toEqual(['src/one.ts'])
  // Picking the file already open reads nothing.
  await ui.press({ key: 'prev' })
  expect(reads).toEqual(['src/one.ts'])
  // The kit implements no `$.ui.scroll`: each change of the shown file draws that failure beside the file it opened.
  await ui.press({ key: 'next' })
  expect(await ui.find({ type: 'Text', text: /no implementation for ui\.scroll/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^2\/2 M src\/two\.ts/ })).toBeDefined()
  expect(String((await ui.find({ type: 'Code' }))?.props.source)).toContain('+TWO')
  await ui.press({ key: 'goto:0' })
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

test('a file whose read failed is read again when picked again', async ($, on) => {
  const reads: string[] = []
  state.failRead = true
  engine(on, Promise.resolve(), argv => {
    if (/^[0-9a-f]{40}:/.test(String(argv.at(-1)))) reads.push(String(argv.at(-1)).slice(41))
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(args('2'))
  const ui = await paneWith(() => $.ui.mount({ ...PANE, surface: 'terminal' }), /fatal: bad object/)
  state.failRead = false
  await ui.press({ key: 'goto:0' })
  expect(reads).toEqual(['src/one.ts', 'src/one.ts'])
  expect(String((await ui.find({ type: 'Code' }))?.props.source)).toContain('+new')
  await ui.unmount()
})

test('picking a file whose read is still running does not read it again', async ($, on) => {
  const reads: string[] = []
  let open = () => {}
  state.readGate = new Promise<void>(r => {
    open = r
  })
  engine(on, Promise.resolve(), argv => {
    if (/^[0-9a-f]{40}:/.test(String(argv.at(-1)))) reads.push(String(argv.at(-1)).slice(41))
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(args('2'))
  const ui = await paneWith(() => $.ui.mount({ ...PANE, surface: 'terminal' }), /^1\/2 /)
  const picks = [ui.press({ key: 'goto:1' }), ui.press({ key: 'goto:0' }), ui.press({ key: 'goto:1' })]
  for (let i = 0; i < 50; i += 1) await null
  state.readGate = undefined
  open()
  await Promise.all(picks)
  expect([...reads].sort()).toEqual(['src/one.ts', 'src/two.ts'])
  await ui.unmount()
})

test('an error wraps whole so its diagnostics show, and is counted with everything else drawn', async ($, on) => {
  const tail = 'refs/pull/2/head on origin has xxxxxxx, fork has none'
  state.failRead = `fatal: ${'x'.repeat(200)} ${tail}`
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(args('2'))
  const ui = await paneWith(() => $.ui.mount({ ...PANE, surface: 'terminal' }), /^git diff: fatal: x/)
  const error = await ui.find({ type: 'Text', text: /^git diff: fatal: x/ })
  expect([error?.props.wrap, String(error?.text).endsWith(tail)]).toEqual(['wrap', true])
  await ui.unmount()
  // One of any length is cut where the budget ends, never past it.
  state.failRead = `fatal: ${'x'.repeat(200_000)}`
  await $.command.run(args('2'))
  const big = await paneWith(() => $.ui.mount({ ...PANE, surface: 'terminal' }), /^git diff: fatal: x/)
  const texts = (await big.findAll({ type: 'Text' })).map(t => t.text)
  const labels = (await big.findAll({ type: 'Button' })).map(t => String(t.props.label ?? t.text))
  expect([...texts, ...labels].reduce((n, t) => n + t.length, 0)).toBeLessThanOrEqual(100_000)
  await big.unmount()
  state.failRead = false
})

test('a file of many tiny hunks leaves the list its share: each drawn string is charged once', async ($, on) => {
  state.files = 200
  state.patch = 'diff --git a/x b/x\n--- a/x\n+++ b/x\n' + Array.from({ length: 20_000 }, (_, i) => `@@ -${i + 1} +${i + 1} @@\n-a\n+b\n`).join('')
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(args('2'))
  const ui = await paneWith(() => $.ui.mount({ ...PANE, surface: 'terminal' }), /^1\/200 /)
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  const codes = (await ui.findAll({ type: 'Code' })).map(c => String(c.props.source))
  const labels = (await ui.findAll({ type: 'Button' })).map(b => String(b.props.label ?? b.text))
  expect(labels.filter(l => /src\//.test(l)).length).toBeGreaterThan(100)
  expect([...texts, ...codes, ...labels].reduce((n, t) => n + t.length, 0)).toBeLessThanOrEqual(100_000)
  await ui.unmount()
  state.files = 2
  state.patch = undefined
})

test('the newest pick decides what is shown, even when an older read finishes beside it', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  for (let ticks = 0; ticks < 12; ticks += 1) {
    let open = () => {}
    state.readGate = undefined
    await $.command.run(args('2'))
    const ui = await paneWith(() => $.ui.mount({ ...PANE, surface: 'terminal' }), /^1\/2 /)
    state.readGate = new Promise<void>(r => {
      open = r
    })
    const a = ui.press({ key: 'goto:1' })
    for (let i = 0; i < 20; i += 1) await null
    state.readGate = undefined
    open()
    for (let i = 0; i < ticks; i += 1) await null
    const b = ui.press({ key: 'goto:0' })
    await Promise.all([a, b])
    for (let i = 0; i < 50; i += 1) await null
    await ui.unmount()
    const after = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect([ticks, (await after.find({ type: 'Text', text: /^\d\/2 / }))?.text]).toEqual([ticks, '1/2 M src/one.ts  +1 −1'])
    await after.unmount()
  }
})

test('a pick of a file whose read finishes as it is picked shows the file, not a lasting Loading', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  for (let ticks = 0; ticks < 16; ticks += 1) {
    let open = () => {}
    state.readGate = undefined
    await $.command.run(args('2'))
    const ui = await paneWith(() => $.ui.mount({ ...PANE, surface: 'terminal' }), /^1\/2 /)
    state.readGate = new Promise<void>(r => {
      open = r
    })
    const a = ui.press({ key: 'goto:1' })
    for (let i = 0; i < 20; i += 1) await null
    await ui.press({ key: 'goto:0' })
    state.readGate = undefined
    open()
    for (let i = 0; i < ticks; i += 1) await null
    await Promise.all([a, ui.press({ key: 'goto:1' })])
    for (let i = 0; i < 50; i += 1) await null
    await ui.unmount()
    const after = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect([ticks, (await after.find({ type: 'Text', text: /^\d\/2 / }))?.text, await after.find({ type: 'Text', text: /^Loading/ })]).toEqual([
      ticks,
      '2/2 M src/two.ts  +1 −1',
      undefined,
    ])
    await after.unmount()
  }
})

test('two loads started back to back leave the later one shown', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await Promise.all([$.command.run(args('1')), $.command.run(args('2'))])
  for (let i = 0; i < 300; i += 1) await null
  const ui = await paneWith(() => $.ui.mount({ ...PANE, surface: 'terminal' }), /^#\d Title/)
  expect(await ui.find({ type: 'Text', text: /^#2 Title 2/ })).toBeDefined()
  await ui.unmount()
})

test('two presses of j before a redraw move two files on', async ($, on) => {
  state.files = 3
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(args('2'))
  const ui = await paneWith(() => $.ui.mount({ ...PANE, surface: 'terminal' }), /^1\/3 /)
  await Promise.all([ui.press({ key: 'next' }), ui.press({ key: 'next' })])
  for (let i = 0; i < 100; i += 1) await null
  await ui.unmount()
  const after = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await after.find({ type: 'Text', text: /^\d\/3 / }))?.text).toBe('3/3 M src/f0.ts  +1 −1')
  await after.unmount()
  state.files = 2
})

test('a pick that changes nothing writes nothing', async ($, on) => {
  const writes: unknown[] = []
  engine(on)
  on('state.set', (_, e, next) => {
    writes.push(e)
    return next(e)
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(args('2'))
  const ui = await paneWith(() => $.ui.mount({ ...PANE, surface: 'terminal' }), /^1\/2 /)
  for (let i = 0; i < 50; i += 1) await null
  const before = writes.length
  await ui.press({ key: 'prev' })
  await ui.press({ key: 'goto:0' })
  expect(writes.length).toBe(before)
  await ui.unmount()
})

test('a load whose first state write fails is reported, not dropped', async ($, on) => {
  const notices: string[] = []
  let failed = false
  engine(on)
  on('state.set', (_, e, next) => {
    if (!failed && e.key === 'diff') {
      failed = true
      return { deny: 'state store unavailable' }
    }
    return next(e)
  })
  on('ui.log', (_, e, next) => {
    notices.push(e.text)
    return next(e)
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(args('2'))
  for (let i = 0; i < 200 && notices.length === 0; i += 1) await null
  expect(notices.some(n => n.includes('state store unavailable'))).toBe(true)
})
