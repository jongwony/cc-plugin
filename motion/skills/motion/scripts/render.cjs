#!/usr/bin/env node
// Render a seek(t) HTML page to preview PNGs or an mp4.
//
//   node render.cjs page.html --preview 0,2.5,7 [--size 1080x1920] [--audio track.mp3]...
//   node render.cjs page.html --fps 30 [--out x.mp4] [--subframes 1]
//                             [--size 1080x1920] [--audio track.mp3]... [--overwrite]
//
// Page contract: window.DURATION (seconds) and window.seek(t), which draws the
// frame for time t (sync, or returning a promise); DURATION > 0. A seek that has not settled
// after SEEK_LIMIT_MS prints MOTION_WARNING= and its frame is captured as drawn; after the first,
// later seeks get SEEK_GRACE_MS, so a page that never settles still renders. Page margins are reset to 0,
// so a canvas at the top-left starts at the frame's corner; whether it fills the frame is for
// the person to judge at the preview. Optional window.renderAudio() resolves to a base64 WAV.
// Every sound source (renderAudio and each --audio) is mixed at its own level, with a limiter
// against clipping; a preview writes that mix to sound.wav (MOTION_SOUND=) to listen to.
// Outputs land beside the page (preview-<page>/, <page>.mp4) unless --preview-dir/--out say otherwise.
// Preview files (PNGs, sound.wav) are rewritten on every run; an existing mp4 is replaced only
// with --overwrite. Synthesized sound is a temporary file, removed once it is muxed.
// Audio is padded or trimmed to DURATION, so the mp4 is always the page's length.
// A subresource or font that fails to load, or an HTTP response >= 400, prints MOTION_WARNING=<what>;
// it does not stop the run. Exits 1 on an uncaught page exception, a failing renderAudio(), a bad
// argument, SIGINT/SIGTERM (after removing its partial files), or an mp4 whose probed length is
// off DURATION by more than one frame. The mp4's picture is always the page (stream 0).
// Prints MOTION_PREVIEW=<png> per preview frame, or MOTION_OUTPUT_PATH=<mp4>, only on success.
"use strict";
const { spawn, execSync, execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const USAGE =
  "usage: render.cjs page.html [--preview t1,t2] [--preview-dir d] [--out x.mp4] [--fps n] " +
  "[--subframes n] [--size WxH] [--audio track] [--overwrite]";
const VALUE_FLAGS = new Set(["preview", "preview-dir", "out", "fps", "subframes", "size", "audio"]);
const BOOL_FLAGS = new Set(["overwrite"]);
const SEEK_LIMIT_MS = 20000;
const SEEK_GRACE_MS = 200;

function loadPlaywright() {
  try {
    return require("playwright");
  } catch {
    const root = execSync("npm root -g", { encoding: "utf8" }).trim();
    return require(path.join(root, "playwright"));
  }
}

function parseArgs(argv) {
  const a = { subframes: "1", size: "1080x1080", overwrite: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith("--")) {
      rest.push(k);
      continue;
    }
    const name = k.slice(2);
    if (BOOL_FLAGS.has(name)) a[name] = true;
    else if (VALUE_FLAGS.has(name)) {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) throw new Error(`${k} needs a value\n${USAGE}`);
      if (name === "audio") (a.audio = a.audio || []).push(v);
      else a[name] = v;
    } else throw new Error(`unknown flag ${k}\n${USAGE}`);
  }
  if (rest.length !== 1) throw new Error(USAGE);
  a.page = path.resolve(rest[0]);
  if (a.preview === undefined && a.fps === undefined) throw new Error(`an mp4 render needs --fps\n${USAGE}`);
  a.fps = Number(a.fps ?? 1);
  if (!(Number.isFinite(a.fps) && a.fps > 0)) throw new Error(`bad --fps ${a.fps}`);
  a.subframes = Number(a.subframes);
  if (!(Number.isInteger(a.subframes) && a.subframes >= 1)) throw new Error(`bad --subframes ${a.subframes}`);
  const [w, h] = a.size.split("x").map(Number);
  if (!w || !h) throw new Error(`bad --size ${a.size}`);
  if (w % 2 || h % 2) throw new Error(`bad --size ${a.size}: libx264 yuv420p needs even dimensions`);
  a.width = w;
  a.height = h;
  if (a.preview !== undefined) {
    a.times = a.preview.split(",").map((s) => (s.trim() === "" ? NaN : Number(s)));
    if (a.times.some((t) => !(Number.isFinite(t) && t >= 0))) throw new Error(`bad --preview ${a.preview}`);
    const names = a.times.map((t) => t.toFixed(2));
    if (new Set(names).size !== names.length) throw new Error(`--preview times collide at 2 decimals: ${a.preview}`);
  }
  const base = path.basename(a.page, path.extname(a.page));
  const dir = path.dirname(a.page);
  a.out = path.resolve(a.out || path.join(dir, `${base}.mp4`));
  a.previewDir = path.resolve(a["preview-dir"] || path.join(dir, `preview-${base}`));
  return a;
}

function refuseExisting(file, overwrite) {
  if (!overwrite && fs.existsSync(file)) throw new Error(`${file} exists; pass --overwrite to replace it`);
}

function ffmpeg(args) {
  const p = spawn("ffmpeg", args, { stdio: ["pipe", "inherit", "pipe"] });
  let err = "";
  let exited = false;
  p.stderr.on("data", (d) => (err += d));
  // A write after ffmpeg exits raises EPIPE here; the exit itself is reported through `done`.
  p.stdin.on("error", () => {});
  const done = new Promise((res, rej) => {
    p.on("error", rej);
    p.on("close", (code, signal) => {
      exited = true;
      code === 0 ? res() : rej(new Error(`ffmpeg exited ${code ?? signal}\n${err.slice(-2000)}`));
    });
  });
  done.catch(() => {}); // awaited by the caller; this only keeps an early exit from crashing Node
  return { stdin: p.stdin, done, exited: () => exited, kill: () => p.kill("SIGKILL") };
}

// ffmpeg args that map inputs first..first+n-1 to one audio stream padded to the video's -t.
function audioMapArgs(first, n) {
  if (n === 0) return [];
  if (n === 1) return ["-map", `${first}:a:0`, "-af", "apad"];
  const ins = Array.from({ length: n }, (_, i) => `[${first + i}:a]apad[a${i}]`).join(";");
  const refs = Array.from({ length: n }, (_, i) => `[a${i}]`).join("");
  return ["-filter_complex", `${ins};${refs}amix=inputs=${n}:normalize=0,alimiter=limit=0.95[mix]`, "-map", "[mix]"];
}

function probeDuration(file) {
  const out = execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file],
    { encoding: "utf8" }
  );
  return Number(out.trim());
}

function failOnPageErrors(pageErrors) {
  if (pageErrors.length) throw new Error("page errors:\n" + pageErrors.join("\n"));
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  if (!a.times) refuseExisting(a.out, a.overwrite);
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
  );
  let partial = null;
  let wavTemp = null;
  let ff = null;
  const cleanup = async () => {
    if (ff && !ff.exited()) {
      ff.kill();
      await ff.done.catch(() => {});
    }
    if (partial) fs.rmSync(partial, { force: true });
    if (wavTemp) fs.rmSync(wavTemp, { force: true });
    await browser.close().catch(() => {});
  };
  for (const sig of ["SIGINT", "SIGTERM"])
    process.once(sig, () => cleanup().finally(() => process.exit(1)));
  try {
    const page = await browser.newPage({ viewport: { width: a.width, height: a.height } });
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e)));
    page.on("requestfailed", (r) => console.log(`MOTION_WARNING=failed to load ${r.url()}`));
    page.on("response", (r) => r.status() >= 400 && console.log(`MOTION_WARNING=HTTP ${r.status()} ${r.url()}`));
    await page.goto(pathToFileURL(a.page).href, { waitUntil: "load" });
    await page.addStyleTag({ content: "html,body{margin:0;padding:0;overflow:hidden}" });
    // Canvas only requests a face when it first draws with it, so load every declared face up front.
    const fontFailures = await page.evaluate(async () => {
      if (!document.fonts) return [];
      const fails = [];
      await Promise.all(
        [...document.fonts].map((f) => f.load().catch((e) => fails.push(`font ${f.family}: ${e}`)))
      );
      await document.fonts.ready;
      return fails;
    });
    for (const f of fontFailures) console.log(`MOTION_WARNING=${f}`);
    failOnPageErrors(pageErrors);
    const duration = await page.evaluate(() =>
      typeof window.seek === "function" && Number.isFinite(window.DURATION) && window.DURATION > 0
        ? window.DURATION
        : null
    );
    if (duration === null) throw new Error("page must define window.seek(t) and a window.DURATION > 0");
    const tracks = (a.audio || []).map((f) => path.resolve(f));
    // The page's synthesized sound, written to `file`; false when the page has none.
    const synthesize = async (file) => {
      const r = await page.evaluate(async () =>
        typeof window.renderAudio === "function" ? { wav: await window.renderAudio() } : null
      );
      if (r === null) return false;
      const wav = r.wav;
      if (typeof wav !== "string" || !wav) throw new Error("renderAudio() must resolve to a base64 WAV string");
      fs.writeFileSync(file, Buffer.from(wav, "base64"));
      return true;
    };
    let seekLimit = SEEK_LIMIT_MS;
    const shoot = async (t) => {
      const seek = page.evaluate((t) => window.seek(t), t);
      seek.catch(() => {}); // a seek left unsettled rejects when the browser closes
      let timer;
      const late = new Promise((r) => (timer = setTimeout(() => r(true), seekLimit)));
      if (await Promise.race([seek.then(() => false), late])) {
        if (seekLimit === SEEK_LIMIT_MS)
          console.log(`MOTION_WARNING=seek(${t}) did not settle within ${SEEK_LIMIT_MS / 1000}s; frame captured as drawn, later seeks wait ${SEEK_GRACE_MS / 1000}s`);
        seekLimit = SEEK_GRACE_MS;
      }
      clearTimeout(timer);
      const png = await page.screenshot({ type: "png" });
      failOnPageErrors(pageErrors);
      return png;
    };

    if (a.times) {
      const late = a.times.filter((t) => t > duration);
      if (late.length) throw new Error(`--preview ${late.join(",")} past DURATION=${duration}s`);
      fs.mkdirSync(a.previewDir, { recursive: true });
      const written = [];
      for (const t of a.times) {
        const f = path.join(a.previewDir, `t=${t.toFixed(2)}.png`);
        fs.writeFileSync(f, await shoot(t));
        written.push(f);
      }
      const sound = path.join(a.previewDir, "sound.wav");
      wavTemp = path.join(a.previewDir, `.synth-${process.pid}.wav`);
      const sources = (await synthesize(wavTemp)) ? [...tracks, wavTemp] : tracks;
      if (sources.length) {
        partial = path.join(a.previewDir, `.sound-${process.pid}.wav`);
        ff = ffmpeg(["-y", "-loglevel", "error", ...sources.flatMap((f) => ["-i", f]),
          ...audioMapArgs(0, sources.length), "-t", String(duration), partial]);
        ff.stdin.end();
        await ff.done;
        fs.renameSync(partial, sound);
      }
      failOnPageErrors(pageErrors);
      for (const f of written) console.log(`MOTION_PREVIEW=${f}`);
      if (sources.length) console.log(`MOTION_SOUND=${sound}`);
    } else {
      fs.mkdirSync(path.dirname(a.out), { recursive: true });
      partial = a.out.replace(/\.mp4$/, "") + `.partial-${process.pid}.mp4`;
      const audio = [...tracks];
      wavTemp = a.out.replace(/\.mp4$/, "") + `.partial-${process.pid}.wav`;
      if (await synthesize(wavTemp)) audio.push(wavTemp);
      const rate = a.fps * a.subframes;
      const vf = [];
      // Output frame k blends captures kN..kN+N-1: a forward shutter, so frame 0 is blurred like the rest.
      if (a.subframes > 1)
        vf.push(`tmix=frames=${a.subframes}`, `select=eq(mod(n\\,${a.subframes})\\,${a.subframes - 1})`, `setpts=N/${a.fps}/TB`);
      vf.push("format=yuv420p");
      const args = ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(rate), "-i", "-"];
      for (const f of audio) args.push("-i", f);
      args.push("-map", "0:v:0", ...audioMapArgs(1, audio.length));
      args.push("-vf", vf.join(","), "-r", String(a.fps), "-c:v", "libx264", "-crf", "18");
      if (audio.length) args.push("-c:a", "aac");
      args.push("-t", String(duration), "-movflags", "+faststart", partial);
      ff = ffmpeg(args);
      const total = Math.round(duration * rate);
      for (let i = 0; i < total && !ff.exited(); i++) {
        const buf = await shoot(i / rate);
        if (!ff.stdin.write(buf)) await Promise.race([new Promise((r) => ff.stdin.once("drain", r)), ff.done]);
      }
      ff.stdin.end();
      await ff.done;
      failOnPageErrors(pageErrors);
      const probed = probeDuration(partial);
      if (!(Math.abs(probed - duration) <= 1 / a.fps))
        throw new Error(`rendered ${probed}s but the page declares DURATION=${duration}s`);
      fs.renameSync(partial, a.out);
      console.log(`MOTION_OUTPUT_PATH=${a.out}`);
    }
  } finally {
    await cleanup();
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
