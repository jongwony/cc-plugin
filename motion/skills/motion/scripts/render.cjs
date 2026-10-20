#!/usr/bin/env node
// Render a seek(t) HTML page to preview PNGs or an mp4.
//
//   node render.cjs page.html --preview 0,2.5,7 [--size 1080x1920]
//   node render.cjs page.html --fps 30 [--out x.mp4] [--subframes 1]
//                             [--size 1080x1920] [--audio track.mp3] [--overwrite]
//
// Page contract: window.DURATION (seconds) and window.seek(t), which draws the
// frame for time t (sync, or returning a promise). Page margins are reset to 0, so the
// canvas at the top-left fills the --size viewport. Optional window.renderAudio()
// resolves to a base64 WAV that is muxed when --audio is absent.
// Outputs land beside the page (preview/, <page>.mp4) unless --preview-dir/--out say otherwise.
// Preview PNGs are rewritten on every run; an existing mp4 or wav is replaced only with --overwrite.
// Audio is padded or trimmed to DURATION, so the mp4 is always the page's length.
// Exits 1 on any page error, font that fails to load, or mp4 whose probed length is off
// DURATION by more than one frame or whose picture is not --size; the mp4's picture is
// always the page (stream 0) and its sound the track (stream 1). Prints MOTION_PREVIEW=<png> per preview frame, or
// MOTION_OUTPUT_PATH=<mp4>, only once every check has passed.
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
      a[name] = v;
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
  }
  const base = path.basename(a.page, path.extname(a.page));
  const dir = path.dirname(a.page);
  a.out = path.resolve(a.out || path.join(dir, `${base}.mp4`));
  a.previewDir = path.resolve(a["preview-dir"] || path.join(dir, "preview"));
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

function probe(file) {
  const out = execFileSync(
    "ffprobe",
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "format=duration:stream=width,height", "-of", "json", file],
    { encoding: "utf8" }
  );
  const j = JSON.parse(out);
  const v = (j.streams || [])[0] || {};
  return { duration: Number(j.format && j.format.duration), width: v.width, height: v.height };
}

function failOnPageErrors(pageErrors) {
  if (pageErrors.length) throw new Error("page errors:\n" + pageErrors.join("\n"));
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const wavOut = a.out.replace(/\.mp4$/, "") + ".wav";
  if (!a.times) refuseExisting(a.out, a.overwrite);
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
  );
  const partial = a.out.replace(/\.mp4$/, "") + ".partial.mp4";
  let ff = null;
  let wroteWav = false;
  let finished = false;
  try {
    const page = await browser.newPage({ viewport: { width: a.width, height: a.height } });
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e)));
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
    pageErrors.push(...fontFailures);
    const duration = await page.evaluate(() =>
      typeof window.seek === "function" && Number.isFinite(window.DURATION) ? window.DURATION : null
    );
    if (duration === null) throw new Error("page must define window.seek(t) and a finite window.DURATION");
    failOnPageErrors(pageErrors);
    const shoot = async (t) => {
      await page.evaluate((t) => window.seek(t), t);
      const png = await page.screenshot({ type: "png" });
      failOnPageErrors(pageErrors);
      return png;
    };

    if (a.times) {
      fs.mkdirSync(a.previewDir, { recursive: true });
      const written = [];
      for (const t of a.times) {
        const f = path.join(a.previewDir, `t=${t.toFixed(2)}.png`);
        fs.writeFileSync(f, await shoot(Math.min(t, duration)));
        written.push(f);
      }
      failOnPageErrors(pageErrors);
      for (const f of written) console.log(`MOTION_PREVIEW=${f}`);
    } else {
      fs.mkdirSync(path.dirname(a.out), { recursive: true });
      let audio = a.audio ? path.resolve(a.audio) : null;
      if (!audio) {
        const wav = await page.evaluate(async () =>
          typeof window.renderAudio === "function" ? await window.renderAudio() : null
        );
        if (wav) {
          refuseExisting(wavOut, a.overwrite);
          audio = wavOut;
          fs.writeFileSync(audio, Buffer.from(wav, "base64"));
          wroteWav = true;
        }
      }
      const rate = a.fps * a.subframes;
      const vf = [];
      if (a.subframes > 1) vf.push(`tmix=frames=${a.subframes}`, `select=not(mod(n\\,${a.subframes}))`, `setpts=N/${a.fps}/TB`);
      vf.push("format=yuv420p");
      const args = ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(rate), "-i", "-"];
      if (audio) args.push("-i", audio);
      args.push("-map", "0:v:0");
      if (audio) args.push("-map", "1:a:0");
      args.push("-vf", vf.join(","), "-r", String(a.fps), "-c:v", "libx264", "-crf", "18");
      if (audio) args.push("-af", "apad", "-c:a", "aac");
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
      const probed = probe(partial);
      if (!(Math.abs(probed.duration - duration) <= 1 / a.fps))
        throw new Error(`rendered ${probed.duration}s but the page declares DURATION=${duration}s`);
      if (probed.width !== a.width || probed.height !== a.height)
        throw new Error(`rendered ${probed.width}x${probed.height} but --size is ${a.width}x${a.height}`);
      fs.renameSync(partial, a.out);
      finished = true;
      console.log(`MOTION_OUTPUT_PATH=${a.out}`);
    }
  } finally {
    if (ff && !ff.exited()) {
      ff.kill();
      await ff.done.catch(() => {});
    }
    fs.rmSync(partial, { force: true });
    if (wroteWav && !finished) fs.rmSync(wavOut, { force: true });
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
