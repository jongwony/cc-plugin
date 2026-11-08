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
const flag = (name, dflt) => { const i = argv.indexOf(`--${name}`); return i < 0 ? dflt : argv.splice(i, 2)[1]; };
const size = flag('size'), fps = +flag('fps', 30), audio = flag('audio'), stillsArg = flag('stills');
const jobs = +flag('jobs', Math.max(1, Math.min(8, Math.floor(availableParallelism() / 2))));
const [pageArg, outArg] = argv;
if (!pageArg || !size || (!outArg && !stillsArg)) {
  console.error('usage: render.mjs <page.html> <out.mp4> --size WxH [--fps 30] [--jobs N] [--audio FILE] | --stills t1,t2');
  process.exit(2);
}
const [W, H] = size.split('x').map(Number);
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
process.on('exit', () => chromes.forEach(c => c.proc.kill('SIGKILL')));
async function finish(code) {
  await Promise.all(chromes.map(({ proc }) => proc.exitCode !== null || proc.signalCode !== null ? null
    : new Promise(r => { proc.once('exit', r); proc.kill(); setTimeout(() => { proc.kill('SIGKILL'); r(); }, 3000); })));
  for (const { udd } of chromes) { try { rmSync(udd, { recursive: true, force: true }); } catch {} }
  process.exit(code);
}
for (const ev of ['unhandledRejection', 'uncaughtException']) process.on(ev, e => { console.error(e?.message || e); finish(1); });

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
  let id = 0; const pending = new Map(); const waiters = [];
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
    else if (m.method) waiters.splice(0).forEach(w => (w.method === m.method ? w.res(m.params) : waiters.push(w)));
  });
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async expression => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  const loaded = new Promise(res => waiters.push({ method: 'Page.loadEventFired', res }));
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
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
  ...(audio ? ['-i', resolve(audio), '-c:a', 'aac', '-b:a', '192k'] : []),
  '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-t', String(duration), '-movflags', '+faststart', out],
{ stdio: ['pipe', 'inherit', 'inherit'] });
const ffDone = new Promise((res, rej) => ff.on('close', c => (c === 0 ? res() : rej(new Error(`ffmpeg exited ${c}`)))));

const slots = new Array(frames);
let next = 0, written = 0, wake = null;
const writer = (async () => {
  while (written < frames) {
    if (!slots[written]) { await new Promise(r => (wake = r)); continue; }
    const buf = slots[written]; slots[written++] = null;
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
})();
const started = Date.now();
await Promise.all(browsers.map(async b => {
  for (let i; (i = next++) < frames;) {
    slots[i] = await b.shot(i / fps, { format: 'png', optimizeForSpeed: true });
    if (wake) { const w = wake; wake = null; w(); }
  }
}));
await writer;
await ffDone;
console.log(`${out}: ${frames} frames, ${duration}s, ${jobs} jobs, ${((Date.now() - started) / 1000).toFixed(1)}s`);
await finish(0);
