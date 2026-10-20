#!/usr/bin/env node
// Render a seek(t) HTML page to preview PNGs or an mp4.
//
//   node render.cjs page.html --preview 0,2.5,7 [--size 1080x1920]
//   node render.cjs page.html [--out x.mp4] [--fps 30] [--subframes 1]
//                             [--size 1080x1920] [--audio track.mp3]
//
// Page contract: window.DURATION (seconds) and window.seek(t), which draws the
// frame for time t (sync, or returning a promise). Optional window.renderAudio()
// resolves to a base64 WAV that is muxed when --audio is absent.
// Outputs land beside the page (preview/, <page>.mp4) unless --preview-dir/--out say otherwise.
// Prints MOTION_PREVIEW=<png> per preview frame, or MOTION_OUTPUT_PATH=<mp4>.
"use strict";
const { spawn, execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function loadPlaywright() {
  try {
    return require("playwright");
  } catch {
    const root = execSync("npm root -g", { encoding: "utf8" }).trim();
    return require(path.join(root, "playwright"));
  }
}

function parseArgs(argv) {
  const a = { fps: 30, subframes: 1, size: "1080x1080" };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k.startsWith("--")) a[k.slice(2)] = argv[++i];
    else rest.push(k);
  }
  if (rest.length !== 1) throw new Error("usage: render.cjs page.html [--preview t1,t2] [--out x.mp4] ...");
  a.page = path.resolve(rest[0]);
  a.fps = Number(a.fps);
  a.subframes = Math.max(1, Number(a.subframes));
  const [w, h] = a.size.split("x").map(Number);
  if (!w || !h) throw new Error(`bad --size ${a.size}`);
  a.width = w;
  a.height = h;
  const base = path.basename(a.page, path.extname(a.page));
  const dir = path.dirname(a.page);
  a.out = path.resolve(a.out || path.join(dir, `${base}.mp4`));
  a.previewDir = path.resolve(a["preview-dir"] || path.join(dir, "preview"));
  return a;
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

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
  );
  try {
    const page = await browser.newPage({ viewport: { width: a.width, height: a.height } });
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e)));
    await page.goto("file://" + a.page, { waitUntil: "load" });
    await page.evaluate(() => document.fonts && document.fonts.ready);
    const duration = await page.evaluate(() =>
      typeof window.seek === "function" && Number.isFinite(window.DURATION) ? window.DURATION : null
    );
    if (duration === null) throw new Error("page must define window.seek(t) and a finite window.DURATION");
    const shoot = async (t) => {
      await page.evaluate((t) => window.seek(t), t);
      return page.screenshot({ type: "png" });
    };

    if (a.preview) {
      fs.mkdirSync(a.previewDir, { recursive: true });
      for (const t of a.preview.split(",").map(Number)) {
        const f = path.join(a.previewDir, `t=${t.toFixed(2)}.png`);
        fs.writeFileSync(f, await shoot(Math.min(t, duration)));
        console.log(`MOTION_PREVIEW=${f}`);
      }
    } else {
      fs.mkdirSync(path.dirname(a.out), { recursive: true });
      let audio = a.audio ? path.resolve(a.audio) : null;
      if (!audio) {
        const wav = await page.evaluate(async () =>
          typeof window.renderAudio === "function" ? await window.renderAudio() : null
        );
        if (wav) {
          audio = a.out.replace(/\.mp4$/, "") + ".wav";
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
      if (audio) args.push("-c:a", "aac", "-shortest");
      args.push("-movflags", "+faststart", a.out);
      const ff = ffmpeg(args);
      const total = Math.round(duration * rate);
      for (let i = 0; i < total; i++) {
        const buf = await shoot(i / rate);
        if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
      }
      ff.stdin.end();
      await ff.done;
      console.log(`MOTION_OUTPUT_PATH=${a.out}`);
    }
    if (pageErrors.length) console.error("page errors:\n" + pageErrors.join("\n"));
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
