#!/usr/bin/env node
// Render a seek(t) HTML page to preview PNGs, a short clip, or an mp4.
//
//   node render.cjs page.html --size 1080x1920 --preview 0,2.5,7 [--audio track.mp3]...
//   node render.cjs page.html --size 1080x1920 --fps 30 --range 1,2.5 [--subframes n] [--audio track.mp3]...
//   node render.cjs page.html --size 1080x1920 --fps 30 [--out x.mp4] [--subframes n]
//                             [--audio track.mp3]... [--limit seconds] [--overwrite]
//   node render.cjs --check
//
// Page contract and behaviour: SKILL.md Phases 4–6.
"use strict";
const { spawn, execSync, execFileSync } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");

const USAGE =
  "usage: render.cjs page.html [--preview t1,t2] [--range a,b] [--preview-dir d] [--out x.mp4] [--fps n] " +
  "[--subframes n] --size WxH [--audio track] [--limit seconds] [--overwrite]   |   render.cjs --check";
const VALUE_FLAGS = new Set(["preview", "range", "preview-dir", "out", "fps", "subframes", "size", "audio", "limit"]);
const BOOL_FLAGS = new Set(["overwrite"]);
const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".wasm": "application/wasm", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
  ".wav": "audio/wav", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".mp4": "video/mp4", ".webm": "video/webm",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf",
};

function loadPlaywright() {
  try {
    return require("playwright");
  } catch {
    const root = execSync("npm root -g", { encoding: "utf8" }).trim();
    return require(path.join(root, "playwright"));
  }
}

const launch = (chromium) =>
  chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

// The skill's preflight: everything a render needs, resolved the way a render resolves it.
async function check() {
  const fail = (m) => {
    console.error(`check failed: ${m}`);
    process.exit(1);
  };
  if (Number(process.versions.node.split(".")[0]) < 18) fail(`Node ${process.versions.node}; 18 or newer is needed`);
  const run = (cmd, args) => {
    try {
      return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch {
      return null;
    }
  };
  if (run("ffprobe", ["-version"]) === null) fail("ffprobe not found");
  const encoders = run("ffmpeg", ["-hide_banner", "-encoders"]);
  if (encoders === null) fail("ffmpeg not found");
  for (const enc of ["libx264", "libvpx-vp9", "libopus"])
    if (!new RegExp(`\\b${enc}\\b`).test(encoders)) fail(`ffmpeg has no ${enc} encoder`);
  if (!/normalize/.test(run("ffmpeg", ["-hide_banner", "-h", "filter=amix"]) || ""))
    fail("ffmpeg's amix filter has no normalize option; a newer ffmpeg is needed");
  let chromium;
  try {
    ({ chromium } = loadPlaywright());
  } catch {
    fail("Playwright not found (npm i -g playwright)");
  }
  let browser;
  try {
    browser = await launch(chromium);
  } catch (e) {
    fail(`Chromium does not launch: ${String(e.message).split("\n")[0]}`);
  }
  // Informational: a supplied file the page plays in a codec this Chromium lacks is transcoded (SKILL.md Phase 4).
  const plays = await (await browser.newPage()).evaluate(() => {
    const v = document.createElement("video");
    const yes = (t) => (v.canPlayType(t) ? "yes" : "no");
    return `h264:${yes('video/mp4; codecs="avc1.42E01E"')} aac:${yes('audio/mp4; codecs="mp4a.40.2"')}`;
  });
  await browser.close();
  console.log(`MOTION_CHECK_CODECS=${plays}`);
  console.log("MOTION_CHECK=ok");
}

function parseArgs(argv) {
  const a = { subframes: "1", limit: "20", overwrite: false };
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
  try {
    fs.accessSync(a.page, fs.constants.R_OK);
    if (!fs.statSync(a.page).isFile()) throw 0;
  } catch {
    throw new Error(`page not found or unreadable: ${a.page}`);
  }
  if (a.preview !== undefined && a.range !== undefined) throw new Error(`--preview and --range exclude each other\n${USAGE}`);
  if (a.preview === undefined && a.fps === undefined) throw new Error(`an mp4 render needs --fps\n${USAGE}`);
  a.fps = Number(a.fps === undefined ? 1 : a.fps);
  if (!(Number.isFinite(a.fps) && a.fps > 0)) throw new Error(`bad --fps ${a.fps}`);
  a.subframes = Number(a.subframes);
  if (!(Number.isInteger(a.subframes) && a.subframes >= 1)) throw new Error(`bad --subframes ${a.subframes}`);
  // Every call into the page settles within --limit seconds or fails the run.
  a.limitMs = Number(a.limit) * 1000;
  if (!(a.limitMs > 0)) throw new Error(`bad --limit ${a.limit}`);
  for (const f of a.audio || []) {
    try {
      fs.accessSync(f, fs.constants.R_OK);
    } catch {
      throw new Error(`--audio not found or unreadable: ${path.resolve(f)}`);
    }
  }
  if (a.size === undefined) throw new Error(`--size WxH is needed\n${USAGE}`);
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
  // Output paths given relative are relative to the page's folder, this run's output folder.
  a.previewDir = path.resolve(dir, a["preview-dir"] || `preview-${base}`);
  if (a.range !== undefined) {
    const r = a.range.split(",").map(Number);
    if (r.length !== 2 || !r.every(Number.isFinite) || r[0] < 0 || r[1] <= r[0]) throw new Error(`bad --range ${a.range}`);
    if (r[1] - r[0] < 1 / a.fps) throw new Error(`--range ${a.range} is shorter than one frame at ${a.fps} fps`);
    a.span = r;
  }
  const clip = a.span && path.join(a.previewDir, `clip-${a.span.map((t) => t.toFixed(2)).join("-")}.mp4`);
  a.out = path.resolve(dir, a.out || clip || `${base}.mp4`);
  return a;
}

function refuseExisting(file, overwrite) {
  if (!overwrite && fs.existsSync(file)) throw new Error(`${file} exists; pass --overwrite to replace it`);
}

// Serves the page's folder on loopback, so fetch() and module imports load as they would on the web.
function serve(root) {
  const server = http.createServer((req, res) => {
    let st;
    let file;
    try {
      file = path.join(root, decodeURIComponent(new URL(req.url, "http://x").pathname));
      st = (file === root || file.startsWith(root + path.sep)) && fs.statSync(file);
    } catch {}
    if (!st || !st.isFile()) return res.writeHead(st === false ? 403 : 404).end();
    const type = TYPES[path.extname(file).toLowerCase()] || "application/octet-stream";
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, st.size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1;
      if (start > end) return res.writeHead(416, { "Content-Range": `bytes */${st.size}` }).end();
      res.writeHead(206, { "Content-Type": type, "Accept-Ranges": "bytes",
        "Content-Range": `bytes ${start}-${end}/${st.size}`, "Content-Length": end - start + 1 });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { "Content-Type": type, "Accept-Ranges": "bytes", "Content-Length": st.size });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((res) => server.listen(0, "127.0.0.1", () => res(server)));
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
      code === 0 ? res() : rej(new Error(`ffmpeg exited ${code !== null ? code : signal}\n${err.slice(-2000)}`));
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
  return ["-filter_complex", `${ins};${refs}amix=inputs=${n}:normalize=0[mix]`, "-map", "[mix]"];
}

// The length of the mp4's video stream; an mp4 with no video frames is an error, never a length of 0.
function probeVideoDuration(file) {
  const out = execFileSync(
    "ffprobe",
    ["-v", "error", "-count_packets", "-select_streams", "v:0", "-show_entries", "stream=duration,nb_read_packets",
      "-of", "json", file],
    { encoding: "utf8" }
  );
  const s = (JSON.parse(out).streams || [])[0];
  const duration = s ? Number(s.duration) : NaN;
  if (!s || !(Number(s.nb_read_packets) >= 1) || !Number.isFinite(duration)) throw new Error(`${file} has no video frames`);
  return duration;
}

function failOnPageErrors(pageErrors) {
  if (pageErrors.length) throw new Error("page errors:\n" + pageErrors.join("\n"));
}

async function main() {
  if (process.argv[2] === "--check") return check();
  const a = parseArgs(process.argv.slice(2));
  if (!a.times) refuseExisting(a.out, a.overwrite);
  const { chromium } = loadPlaywright();
  const browser = await launch(chromium);
  const server = await serve(path.dirname(a.page));
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
    server.close();
  };
  for (const sig of ["SIGINT", "SIGTERM"])
    process.once(sig, () => {
      console.error(`interrupted by ${sig}`);
      cleanup().finally(() => process.exit(1));
    });
  try {
    const page = await browser.newPage({ viewport: { width: a.width, height: a.height } });
    const cdp = await page.context().newCDPSession(page);
    const pageErrors = [];
    // One warning per failing file (its URL without the query, so a per-frame request counts once) or page message.
    const warnings = new Map();
    const warn = (key, w) => {
      if (warnings.has(key)) return;
      warnings.set(key, w);
      console.log(`MOTION_WARNING=${w}`);
    };
    const bare = (u) => u.split(/[?#]/)[0];
    page.on("pageerror", (e) => pageErrors.push(String(e)));
    // A media element cancels its own in-flight range requests when the page seeks it; that is not a failed load.
    page.on("requestfailed", (r) => {
      const media = r.resourceType() === "media" || "range" in r.headers();
      if (media && /ERR_ABORTED/.test((r.failure() || {}).errorText || "")) return;
      warn(bare(r.url()), `failed to load ${bare(r.url())}`);
    });
    page.on("response", (r) => r.status() >= 400 && warn(bare(r.url()), `HTTP ${r.status()} ${bare(r.url())}`));
    // The page reports a failure it caught itself (a decode, a parse, missing data) through window.motionWarn.
    await page.exposeFunction("motionWarn", (m) => warn(`page: ${m}`, `page: ${String(m)}`));
    // Every call into the page goes through here: it settles within --limit, or the run fails naming the call.
    const bounded = (label, p) => {
      let timer;
      const late = new Promise((_, rej) => {
        timer = setTimeout(() => {
          const seen = warnings.size ? `\nwarnings so far:\n${[...warnings.values()].join("\n")}` : "";
          rej(new Error(`${label} did not settle within ${a.limit}s (--limit)${seen}`));
        }, a.limitMs);
      });
      p.catch(() => {}); // past the limit the run is failing; the browser's close rejects p
      return Promise.race([p, late]).finally(() => clearTimeout(timer));
    };
    const { port } = server.address();
    const url = `http://127.0.0.1:${port}/${encodeURIComponent(path.basename(a.page))}`;
    await bounded("loading the page", page.goto(url, { waitUntil: "load", timeout: 0 }));
    await bounded("styling the page", page.addStyleTag({ content: "html,body{margin:0;padding:0;overflow:hidden}" }));
    // A module may define seek and DURATION after a top-level await, so wait for them.
    const notReady = await bounded(
      "the page's window.seek(t) and window.DURATION > 0 (it must define both)",
      page.waitForFunction(
        () => typeof window.seek === "function" && Number.isFinite(window.DURATION) && window.DURATION > 0,
        null,
        { timeout: 0 }
      )
    ).then(() => null, (e) => e);
    // Canvas only requests a face when it first draws with it, so load every declared face up front.
    // A font is an asset: one that fails or is still loading at --limit is a warning, and frames draw
    // with the fallback (captures do not wait on fonts; see shoot).
    const fontFailures = await page.evaluate(async (ms) => {
      if (!document.fonts) return [];
      const P = (async () => {})().constructor; // the native Promise, even where the page replaced window.Promise
      const faces = [...document.fonts];
      const expiry = new P((r) => setTimeout(r, ms));
      await P.race([P.all(faces.map((f) => f.load().catch(() => {}))), expiry]);
      return faces
        .filter((f) => f.status !== "loaded")
        .map((f) => `font ${f.family}: ${f.status === "error" ? "failed to load" : "still loading at --limit"}`);
    }, a.limitMs);
    for (const f of fontFailures) warn(f, f);
    failOnPageErrors(pageErrors);
    if (notReady) throw notReady;
    const duration = await bounded("window.DURATION", page.evaluate(() => window.DURATION));
    const tracks = (a.audio || []).map((f) => path.resolve(f));
    // The page's synthesized sound, written to `file`; false when the page has none.
    const synthesize = async (file) => {
      const r = await bounded(
        "renderAudio()",
        page.evaluate(async () => (typeof window.renderAudio === "function" ? { wav: await window.renderAudio() } : null))
      );
      if (r === null) return false;
      const wav = r.wav;
      if (typeof wav !== "string" || !wav) throw new Error("renderAudio() must resolve to a base64 WAV string");
      fs.writeFileSync(file, Buffer.from(wav, "base64"));
      return true;
    };
    // One seek at a time: each settles, rejects, or fails the run at the limit before the next starts.
    const shoot = async (t) => {
      // Only a real Promise is waited on; any other return value (a GSAP timeline is a thenable) is dropped.
      await bounded(
        `seek(${t})`,
        page.evaluate((t) => {
          const r = window.seek(t);
          // Checked by tag, not instanceof: a page may replace window.Promise.
          return Object.prototype.toString.call(r) === "[object Promise]" ? r.then(() => {}) : undefined;
        }, t)
      );
      // Captured over CDP: Playwright's screenshot waits on document.fonts.ready, which a font still
      // loading at --limit never resolves.
      const shot = await bounded(`capturing ${t}`, cdp.send("Page.captureScreenshot", { format: "png" }));
      const png = Buffer.from(shot.data, "base64");
      failOnPageErrors(pageErrors);
      return png;
    };

    if (a.times) {
      const past = a.times.filter((t) => t > duration);
      if (past.length) throw new Error(`--preview ${past.join(",")} past DURATION=${duration}s`);
      fs.mkdirSync(a.previewDir, { recursive: true });
      // This run's stills and sound replace the last run's; clips are left alone.
      for (const f of fs.readdirSync(a.previewDir))
        if (/^t=.*\.png$/.test(f) || f === "sound.wav") fs.rmSync(path.join(a.previewDir, f));
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
      const [from, to] = a.span || [0, duration];
      if (to > duration) throw new Error(`--range ${a.range} past DURATION=${duration}s`);
      const length = to - from;
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
      for (const f of audio) args.push("-ss", String(from), "-i", f);
      args.push("-map", "0:v:0", ...audioMapArgs(1, audio.length));
      args.push("-vf", vf.join(","), "-r", String(a.fps), "-c:v", "libx264", "-crf", "18");
      if (audio.length) args.push("-c:a", "aac");
      args.push("-t", String(length), "-movflags", "+faststart", partial);
      ff = ffmpeg(args);
      const total = Math.round(length * rate);
      for (let i = 0; i < total && !ff.exited(); i++) {
        const buf = await shoot(from + i / rate);
        if (!ff.stdin.write(buf)) await Promise.race([new Promise((r) => ff.stdin.once("drain", r)), ff.done]);
      }
      ff.stdin.end();
      await ff.done;
      failOnPageErrors(pageErrors);
      const probed = probeVideoDuration(partial);
      if (!(Math.abs(probed - length) <= 1 / a.fps))
        throw new Error(`rendered ${probed}s of video but ${length}s were asked for`);
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
