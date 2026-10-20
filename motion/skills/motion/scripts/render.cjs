#!/usr/bin/env node
// Render a seek(t) HTML page to preview PNGs or an mp4.
//
//   node render.cjs page.html --preview 0,2.5,7 [--size 1080x1920]
//   node render.cjs page.html [--out x.mp4] [--fps 30] [--subframes 1]
//                             [--size 1080x1920] [--audio track.mp3] [--overwrite]
//
// Page contract: window.DURATION (seconds) and window.seek(t), which draws the
// frame for time t (sync, or returning a promise). Optional window.renderAudio()
// resolves to a base64 WAV that is muxed when --audio is absent.
// Outputs land beside the page (preview/, <page>.mp4) unless --preview-dir/--out say otherwise.
// Preview PNGs are rewritten on every run; an existing mp4 or wav is replaced only with --overwrite.
// Audio is padded or trimmed to DURATION, so the mp4 is always the page's length.
// Exits 1 on any page error, font that fails to load, or mp4 whose probed length is off
// DURATION by more than one frame. Prints MOTION_PREVIEW=<png> per preview frame, or
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
  const a = { fps: "30", subframes: "1", size: "1080x1080", overwrite: false };
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
  a.fps = Number(a.fps);
  if (!(Number.isFinite(a.fps) && a.fps > 0)) throw new Error(`bad --fps ${a.fps}`);
  a.subframes = Number(a.subframes);
  if (!(Number.isInteger(a.subframes) && a.subframes >= 1)) throw new Error(`bad --subframes ${a.subframes}`);
  const [w, h] = a.size.split("x").map(Number);
  if (!w || !h) throw new Error(`bad --size ${a.size}`);
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
  p.stderr.on("data", (d) => (err += d));
  const done = new Promise((res, rej) =>
    p.on("close", (code) => (code === 0 ? res() : rej(new Error(`ffmpeg exited ${code}\n${err.slice(-2000)}`))))
  );
  return { stdin: p.stdin, done };
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
  const wavOut = a.out.replace(/\.mp4$/, "") + ".wav";
  if (!a.times) refuseExisting(a.out, a.overwrite);
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
  );
  const partial = a.out.replace(/\.mp4$/, "") + ".partial.mp4";
  try {
    const page = await browser.newPage({ viewport: { width: a.width, height: a.height } });
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e)));
    await page.goto(pathToFileURL(a.page).href, { waitUntil: "load" });
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
      return page.screenshot({ type: "png" });
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
        }
      }
      const rate = a.fps * a.subframes;
      const vf = [];
      if (a.subframes > 1) vf.push(`tmix=frames=${a.subframes}`, `select=not(mod(n\\,${a.subframes}))`, `setpts=N/${a.fps}/TB`);
      vf.push("format=yuv420p");
      const args = ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(rate), "-i", "-"];
      if (audio) args.push("-i", audio);
      args.push("-vf", vf.join(","), "-r", String(a.fps), "-c:v", "libx264", "-crf", "18");
      if (audio) args.push("-af", "apad", "-c:a", "aac");
      args.push("-t", String(duration), "-movflags", "+faststart", partial);
      const ff = ffmpeg(args);
      const total = Math.round(duration * rate);
      for (let i = 0; i < total; i++) {
        const buf = await shoot(i / rate);
        if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
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
    fs.rmSync(partial, { force: true });
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
