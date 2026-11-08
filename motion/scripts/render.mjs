#!/usr/bin/env node
// Render a motion page to mp4: every frame t = i/fps drawn by window.seek(t), captured from
// headless Chrome over the DevTools protocol, encoded with ffmpeg.
//
//   node render.mjs <page.html> <out.mp4> --size WxH [--fps 30] [--jobs N] [--audio FILE]
//   node render.mjs <page.html> --size WxH --stills 0.5,1.8,4.5     (PNGs beside the page)
//
// Needs Node >= 22 (built-in WebSocket), Chrome or Chromium (CHROME=path to override the
// lookup), and ffmpeg on PATH. Nothing is installed.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { join, parse, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const USAGE = 'usage: render.mjs <page.html> <out.mp4> --size WxH [--fps 30] [--jobs N] [--audio FILE] | --stills t1,t2';
const flag = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return dflt;
  const v = argv.splice(i, 2)[1];
  if (v === undefined || v.startsWith('--')) { console.error(USAGE); process.exit(2); }
  return v;
};
const size = flag('size', ''), fps = +flag('fps', 30), audio = flag('audio'), stillsArg = flag('stills');
const jobs = +flag('jobs', Math.max(1, Math.min(8, Math.floor(availableParallelism() / 2))));
const [pageArg, outArg] = argv;
const dims = size.match(/^(\d+)x(\d+)$/);
const posInt = n => Number.isInteger(n) && n > 0;
if (!pageArg || !dims || (!outArg && !stillsArg) || !(fps > 0) || !posInt(jobs)) {
  console.error(USAGE);
  process.exit(2);
}
const [W, H] = [+dims[1], +dims[2]];
if (!posInt(W) || !posInt(H)) { console.error('--size needs positive WxH'); process.exit(2); }
const url = pathToFileURL(resolve(pageArg)).href;

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const candidates = {
    darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'],
    win32: [`${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`, `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`, `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`],
  }[process.platform] || [];
  for (const c of candidates) if (existsSync(c)) return c;
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome']) {
    const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [name], { encoding: 'utf8' });
    if (r.status === 0) return r.stdout.split(/\r?\n/)[0].trim();
  }
  throw new Error('Chrome or Chromium not found; set CHROME to its executable');
}
const CHROME = findChrome();
const chromes = [];
let ff = null, finishing = false;
process.on('exit', () => { chromes.forEach(c => c.proc.kill('SIGKILL')); ff?.kill('SIGKILL'); });
async function finish(code) {
  if (finishing) return;
  finishing = true;
  if (code !== 0) ff?.kill('SIGKILL');
  await Promise.all(chromes.map(({ proc }) => proc.exitCode !== null || proc.signalCode !== null ? null
    : new Promise(r => { proc.once('exit', r); proc.kill(); setTimeout(() => { proc.kill('SIGKILL'); r(); }, 3000); })));
  for (const { udd } of chromes) { try { rmSync(udd, { recursive: true, force: true }); } catch {} }
  process.exit(code);
}
for (const ev of ['unhandledRejection', 'uncaughtException']) process.on(ev, e => { console.error(e?.message || e); finish(1); });
process.on('SIGINT', () => finish(130));
process.on('SIGTERM', () => finish(143));

async function open() {
  const udd = mkdtempSync(join(tmpdir(), 'motion-render-'));
  const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', '--hide-scrollbars', '--force-device-scale-factor=1',
    `--window-size=${W},${H}`, `--user-data-dir=${udd}`, '--no-first-run', '--no-default-browser-check', 'about:blank'],
  { stdio: ['ignore', 'ignore', 'pipe'] });
  chromes.push({ proc, udd });
  const wsUrl = await new Promise((res, rej) => {
    let buf = '';
    proc.stderr.on('data', d => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) res(m[1]); });
    proc.on('exit', c => rej(new Error(`chrome exited (${c}) before DevTools came up`)));
  });
  const port = new URL(wsUrl).port;
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page'); } catch {}
    if (!target) await sleep(100);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
  let id = 0, dead = null; const pending = new Map(); const waiters = [];
  const fail = e => {
    if (dead) return;
    dead = e;
    for (const p of pending.values()) p.rej(e);
    pending.clear();
    waiters.splice(0).forEach(w => w.rej(e));
    if (!finishing) { console.error(e.message); finish(1); }
  };
  ws.addEventListener('close', () => fail(new Error('DevTools connection closed')));
  proc.on('exit', c => fail(new Error(`chrome exited (${c}) during the render`)));
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
    else if (m.method) waiters.splice(0).forEach(w => (w.method === m.method ? w.res(m.params) : waiters.push(w)));
  });
  const send = (method, params = {}) => dead ? Promise.reject(dead)
    : new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async expression => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  const loaded = new Promise((res, rej) => waiters.push({ method: 'Page.loadEventFired', res, rej }));
  await send('Page.navigate', { url });
  await loaded;
  await evaluate('document.fonts.ready.then(() => 1)');
  const shot = async (t, params) => {
    await evaluate(`window.seek(${t}); 1`);
    return Buffer.from((await send('Page.captureScreenshot', params)).data, 'base64');
  };
  return { evaluate, shot };
}

if (stillsArg) {
  const b = await open();
  const { dir, name } = parse(resolve(pageArg));
  for (const t of stillsArg.split(',').map(Number)) {
    const file = join(dir, `${name}-${t}s.png`);
    writeFileSync(file, await b.shot(t, { format: 'png' }));
    console.log(file);
  }
  await finish(0);
}

const out = resolve(outArg);
const browsers = await Promise.all(Array.from({ length: jobs }, open));
const duration = await browsers[0].evaluate('window.DURATION');
const frames = Math.round(duration * fps);
ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
  ...(audio ? ['-i', resolve(audio), '-c:a', 'aac', '-b:a', '192k'] : []),
  '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-t', String(duration), '-movflags', '+faststart', out],
{ stdio: ['pipe', 'inherit', 'inherit'] });
const ffDone = new Promise((res, rej) => ff.on('close', c => (c === 0 ? res() : rej(new Error(`ffmpeg exited ${c}`)))));

const slots = new Array(frames);
const window_ = jobs * 4;
let next = 0, written = 0, wake = null, room = [];
const writer = (async () => {
  while (written < frames) {
    if (!slots[written]) { await new Promise(r => (wake = r)); continue; }
    const buf = slots[written]; slots[written++] = null;
    room.splice(0).forEach(r => r());
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
})();
const started = Date.now();
await Promise.all(browsers.map(async b => {
  for (;;) {
    while (next - written >= window_) await new Promise(r => room.push(r));
    const i = next++;
    if (i >= frames) break;
    slots[i] = await b.shot(i / fps, { format: 'png', optimizeForSpeed: true });
    if (wake) { const w = wake; wake = null; w(); }
  }
}));
await writer;
await ffDone;
console.log(`${out}: ${frames} frames, ${duration}s, ${jobs} jobs, ${((Date.now() - started) / 1000).toFixed(1)}s`);
await finish(0);
