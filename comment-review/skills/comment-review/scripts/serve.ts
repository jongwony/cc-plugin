#!/usr/bin/env bun
// @ts-nocheck — Bun runtime resolves node:* and Bun globals natively; skip TS-LSP noise.
// comment-review channel server (Bun): live preview + anchored feedback channel.
//
// Usage: bun scripts/serve.ts <draft.md|draft.html> [more...]
//
// Renders each artifact as an interactive preview — markdown via marked, or HTML served
// directly through a Shadow DOM. Either way the user right-clicks an element to anchor a
// comment by CSS selector, via a Medium/Hypothes.is-style popup. Each comment POSTs to
// /feedback and appends to feedback-{slug}.jsonl in the draft's directory.
// A WebSocket pushes 'reload' messages whenever the source file changes, so the next
// /comment-review round's edits appear immediately without manual refresh.
//
// Stop with Ctrl-C. No port collision: Bun.serve(port: 0) lets the OS pick.

import { closeSync, constants, existsSync, fstatSync, openSync, readFileSync, statSync, watch, writeSync } from "node:fs";
import { readFile, realpath } from "node:fs/promises";
import { basename, dirname, extname, resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("usage: bun scripts/serve.ts <draft.md|draft.html> [more...]");
  process.exit(1);
}

// Reject flag-shaped args so they don't become phantom draft paths via `resolve()`.
const unknownFlags = args.filter((a) => a.startsWith("-"));
if (unknownFlags.length > 0) {
  console.error(`unknown flag(s): ${unknownFlags.join(", ")}`);
  console.error("usage: bun scripts/serve.ts <draft.md|draft.html> [more...]");
  process.exit(1);
}

// An artifact's slug names both its URL and its feedback file. Two artifacts can yield the
// same bare filename — `draft.md` beside `draft.html`, or `a/draft.md` and `b/draft.md` —
// and a Map keyed on it silently dropped one: the user reviewed an artifact they never
// opened while their comments landed next to the survivor. Each artifact now takes the
// narrowest name no other artifact could also take, so a name that is already unique is
// kept exactly as before and only a colliding pair widens.
const SLUG_SEP = "-";
// Doubling the separator inside a component stops a directory literally named `a-b` from
// flattening to the same string as the pair `a/b` — the case that made two real artifacts
// exhaust every candidate between them, so the server refused to start and left BOTH
// unreviewable rather than silently dropping one.
// It does not make the join injective, and the comment on the guard below must not be read
// as saying it does: a run of separators at a component boundary is still ambiguous, since
// `["a-", "b"]` and `["a", "-b"]` both flatten to `a---b`. The guard stays load-bearing.
const escapeComponent = (c: string) => c.replaceAll(SLUG_SEP, SLUG_SEP + SLUG_SEP);
const slugCandidates = (abs: string): string[] => {
  const parts = abs.split(sep).filter(Boolean);
  // The first two rungs stay unescaped: an artifact with no collision must keep the exact
  // bare name it has today. Only a widened rung — which exists solely to separate a
  // collision — pays the escaping.
  const cands = [basename(abs, extname(abs)), parts[parts.length - 1]];
  // Widen by one leading path component at a time. Joined with SLUG_SEP rather than `sep`:
  // the slug becomes part of `feedback-{slug}.jsonl`, and a separator there would name a
  // subdirectory that does not exist.
  for (let i = parts.length - 2; i >= 0; i--) {
    cands.push(parts.slice(i).map(escapeComponent).join(SLUG_SEP));
  }
  // Last rung, reached only when every rung above it is taken. The ladder above exhausts
  // whenever one artifact's path is a tail of another's — `/tmp/draft.md` beside
  // `~/tmp/draft.md` — because then every name the shorter path can widen to is also a name
  // the longer one offers, and the shorter one runs out. A different trigger from the `a-b`
  // vs `a/b` case the escaping above handles.
  //
  // A hash of the path, not a counter. `{bare}-1` / `{bare}-2` would be shorter and would
  // terminate by construction, but it depends on argument order: the slug names
  // `feedback-{slug}.jsonl`, and Phase 0's carryover search only finds an earlier session's
  // queue if that name is stable for the same artifact. A counter gives the same artifact a
  // different queue name depending on what it was opened alongside, and the earlier queue
  // then goes quietly missing. This rung is a function of the absolute path alone.
  // sha256 rather than Bun.hash for the same reason: the name has to outlive Bun upgrades,
  // and Bun.hash carries no stability guarantee across them.
  cands.push(`${basename(abs, extname(abs))}-${createHash("sha256").update(abs).digest("hex").slice(0, 8)}`);
  return cands;
};

const drafts = new Map<string, string>(); // slug -> absolute path
const paths = [...new Set(args.map((a) => resolve(a)))]; // same file twice is one artifact
for (const abs of paths) {
  // resolve() accepts any string, so a mistyped path registers a slug and the index links it.
  // Phase 0 reads the "serving at" line as the start confirmation, which means the typo is
  // relayed to the user as a successful start and the real cause only appears later, as a 500
  // when they click. The watcher never fires for that path either — its identity() returns
  // null forever — so the channel is silently dead rather than visibly broken. Fail here.
  // isFile(), not mere existence: a directory argument registers and fails exactly the same
  // way, and the guard costs nothing extra.
  let readable = false;
  try { readable = statSync(abs).isFile(); } catch { /* missing, or unreadable parent */ }
  if (!readable) {
    console.error(`fatal: not a readable file: ${abs}`);
    process.exit(1);
  }
  const others = paths.filter((p) => p !== abs).map(slugCandidates);
  const slug = slugCandidates(abs).find((c) => !others.some((o) => o.includes(c)));
  if (!slug) {
    // Still reachable, and deliberately so. The hash rung does not make the ladder unique —
    // a truncated 32-bit digest is not injective by construction; it makes exhaustion require
    // two paths whose digests collide there, which is a different claim and a much smaller
    // probability, not zero. Do not rewrite this comment to say the ladder cannot exhaust.
    // Failing loudly here is the point: the alternative is the silent drop this block removes.
    console.error(`fatal: cannot derive a unique preview name for ${abs}`);
    process.exit(1);
  }
  drafts.set(slug, abs);
}

// fileURLToPath, not URL.pathname: pathname keeps percent-escapes, so an install path
// carrying a space or a non-ASCII character resolves to a literal %20 path that does not
// exist — and the failure surfaces as the template-missing message below, which points at
// the wrong cause.
const SCRIPT_DIR = fileURLToPath(new URL(".", import.meta.url));
const TEMPLATES_DIR = resolve(SCRIPT_DIR, "..", "templates");
const TEMPLATE_PATH = resolve(TEMPLATES_DIR, "preview.html");
// Vendored browser-side dependencies, served by name. marked renders markdown; DOMPurify
// sanitizes what it produced before it reaches innerHTML — see the markdown branch in
// preview.html for why that step is not optional.
const VENDOR_ASSETS: Record<string, string> = {
  "/marked.min.js": resolve(TEMPLATES_DIR, "marked.min.js"),
  "/purify.min.js": resolve(TEMPLATES_DIR, "purify.min.js"),
};

let template: string;
try {
  template = await readFile(TEMPLATE_PATH, "utf8");
} catch (e) {
  console.error(`fatal: cannot read template ${TEMPLATE_PATH}: ${(e as Error).message}`);
  console.error("the skill installation may be incomplete; verify templates/preview.html ships with the skill.");
  process.exit(1);
}

// Every `<` is neutralized, not just `</script`: inside a script element, `<!--` followed by
// `<script` drives the tokenizer into script-data-double-escaped state, where `</script>` no
// longer closes the element and the rest of the document is swallowed. \u003C is a valid
// escape in both JSON and JS string literals and decodes back to `<`, so the parsed value
// is unchanged.
// Append through a handle opened O_NOFOLLOW. `appendFile` follows a symlink at this path, so
// a reviewed checkout carrying a `feedback-{slug}.jsonl` symlink could redirect an ordinary
// comment append to any file the user can write — silently, with a 200 going back. The asset
// read path below deliberately allows a symlink that stays inside the artifact directory,
// because following one to read it is harmless; that argument does not carry to a write, so
// this side refuses to follow at all. O_CREAT still creates the file when it is absent —
// NOFOLLOW only fails when the final component is already a symlink — and an ELOOP surfaces
// through the existing catch, which reports the cause rather than swallowing it.
const appendNoFollow = (path: string, line: string) => {
  const fd = openSync(
    path,
    constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW,
    0o644,
  );
  try {
    writeSync(fd, line);
  } finally {
    closeSync(fd);
  }
};

const escapeForScriptTag = (s: string) => s.replace(/</g, "\\u003C");
const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// Validation caps: protect disk + JSONL schema integrity
// Retained without a current call site: no code path takes a slug from a client today, so
// there is nothing to cap. It is here as the value to reach for if one ever does.
const MAX_SLUG_LEN = 200;
const MAX_SELECTOR_LEN = 500;
const MAX_ANCHOR_TEXT_LEN = 300;
const MAX_COMMENT_LEN = 5000;

const renderIndex = () => {
  const items = [...drafts.keys()]
    .map((s) => `<li><a href="/preview/${encodeURIComponent(s)}">${escapeHtml(s)}</a></li>`)
    .join("\n");
  return `<!doctype html><html><head><meta charset=utf-8>
<title>comment-review</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:600px;margin:3em auto;padding:0 1em;line-height:1.6;color:#222}
  ul{padding-left:1.2em}li{margin:.4em 0}
  a{color:#2c7be5;text-decoration:none}a:hover{text-decoration:underline}
  code{background:#f3f3f3;padding:.1em .3em;border-radius:3px;font-family:ui-monospace,monospace;font-size:.9em}
</style>
</head><body><h1>comment-review drafts</h1><ul>${items}</ul>
<p>Right-click an element in the rendered draft and leave a comment in the popup. Each comment
appends to <code>feedback-{slug}.jsonl</code> next to the source file. The next
<code>/comment-review</code> round ingests these as selector-anchored edit directives.</p>
</body></html>`;
};

// Strip YAML frontmatter so marked.js renders body only. Anchors are element selectors
// computed over the rendered body, so stripped frontmatter never enters a selector path.
const stripFrontmatter = (md: string) => {
  const m = md.match(/^---\r?\n[\s\S]*?\r?\n---\r?(?:\n|$)/);
  return m ? md.slice(m[0].length) : md;
};

const renderPreview = async (slug: string) => {
  const path = drafts.get(slug);
  if (!path) return null;
  // Render mode keys off the file extension: .html/.htm render the raw file through a
  // Shadow DOM (CSS-isolated, innerHTML-inserted scripts inert); everything else renders
  // as markdown via marked. Frontmatter is stripped for markdown only — HTML passes raw.
  const ext = extname(path).toLowerCase();
  const renderMode = ext === ".html" || ext === ".htm" ? "html" : "markdown";
  const raw = await readFile(path, "utf8");
  const body = renderMode === "markdown" ? stripFrontmatter(raw) : raw;
  // title goes into HTML context, where escapeHtml handles `<`. Slug and body both land inside
  // real script elements — a slug is a filename minus its extension, and a filename may contain
  // `<!--<script` — so each is JSON-stringified and then run through escapeForScriptTag;
  // JSON.parse and the JS parser reverse it losslessly.
  const values: Record<string, string> = {
    __TITLE_PLACEHOLDER__: escapeHtml(slug),
    __SLUG_PLACEHOLDER__: escapeForScriptTag(JSON.stringify(slug)),
    __RENDER_MODE_PLACEHOLDER__: JSON.stringify(renderMode),
    __MARKDOWN_CONTENT_PLACEHOLDER__: escapeForScriptTag(JSON.stringify(body)),
  };
  // One pass over the template, so a value is never re-entered into the substitution it was
  // the output of. Sequential replaces failed twice on these same few lines before this:
  // once because `$&` in a replacement string is expansion syntax, and once because an
  // inserted slug carried a later slot's placeholder, which left that slot bare and killed
  // the client script. Both are the same shape — a value being read as syntax by the step
  // that placed it. The function form also keeps `$` inert, so this subsumes the earlier
  // repair rather than sitting beside it.
  return template.replace(
    /__(?:TITLE|SLUG|RENDER_MODE|MARKDOWN_CONTENT)_PLACEHOLDER__/g,
    (match) => values[match],
  );
};

interface FeedbackBody {
  slug: string;
  selector: string; // unique CSS selector / DOM path of the right-clicked element
  comment: string;
  anchorText?: string; // rendered text of that element when the comment was made
  id?: string; // optional on POST: present for edits (re-uses original id), absent for new entries
}

interface DeleteBody {
  slug: string;
  id: string;
}

const MAX_ID_LEN = 128;

// Resolve the tailscale CLI: PATH lookup first (cross-platform). On macOS only,
// fall back to the app-bundle CLI, since GUI / App Store builds ship it inside
// the bundle rather than on PATH. The bundle fallback is darwin-scoped so the
// platform-specific paths stay isolated from the generic PATH resolution.
function tailscaleBin(): string | null {
  const onPath = Bun.which("tailscale");
  if (onPath) return onPath;
  if (process.platform === "darwin") {
    for (const p of [
      "/Applications/Tailscale.app/Contents/MacOS/Tailscale",
      `${homedir()}/Applications/Tailscale.app/Contents/MacOS/Tailscale`,
    ]) {
      if (existsSync(p)) return p;
    }
  }
  return null;
}

// When the tailscale CLI is present and the device is on a tailnet, return its
// Tailscale IPv4 and MagicDNS name; otherwise null. Degrades silently on any
// probe failure (CLI absent, logged out, unexpected JSON).
function detectTailscale(): { ip: string; dnsName: string } | null {
  const tsBin = tailscaleBin();
  if (!tsBin) return null;
  try {
    const proc = Bun.spawnSync([tsBin, "status", "--json"]);
    if (proc.exitCode !== 0) return null;
    const status = JSON.parse(proc.stdout.toString());
    // Stopped/disconnected daemon still reports stale TailscaleIPs that aren't bound locally.
    if (status?.BackendState !== "Running") return null;
    const self = status?.Self;
    const ip = (self?.TailscaleIPs ?? []).find((a: string) => /^\d+\.\d+\.\d+\.\d+$/.test(a));
    if (!ip) return null; // tailscale present but not connected to a tailnet
    return { ip, dnsName: (self?.DNSName ?? "").replace(/\.$/, "") };
  } catch {
    return null;
  }
}

// Loopback keeps drafts/feedback strictly local. When tailscale is detected we
// bind to the tailnet interface instead, exposing the preview to the user's own
// tailnet devices (e.g. mobile) — a deliberate widening from loopback-private to
// tailnet-private, scoped to that single interface (not 0.0.0.0/all networks).
const tailnet = detectTailscale();
const bindHost = tailnet ? tailnet.ip : "127.0.0.1";

// ── Static sibling-asset serving for rendered HTML artifacts ──
// Relative URLs in an HTML artifact (`<link href="x.css">`, `<img src="img/y.png">`) resolve
// under /preview/..., so a /preview/ request that is NOT a known slug is a sibling asset. We
// serve it READ-ONLY and STRICTLY SCOPED to the requesting artifact's OWN directory:
//   - the artifact is identified by the Referer page (/preview/{slug}); single-draft fallback otherwise
//   - reject ".." path segments and NUL before touching the filesystem
//   - resolve against the artifact dir, then realpath() both and assert the canonical file stays
//     inside the canonical artifact dir — this defeats path traversal AND symlink escape
// Anything that resolves outside the artifact dir → 404. GET/HEAD only, no directory listing, no write.
const ASSET_MIME: Record<string, string> = {
  ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".svg": "image/svg+xml", ".webp": "image/webp", ".avif": "image/avif", ".ico": "image/x-icon",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf",
  ".json": "application/json", ".map": "application/json", ".txt": "text/plain", ".csv": "text/csv",
  ".mp4": "video/mp4", ".webm": "video/webm", ".mp3": "audio/mpeg", ".pdf": "application/pdf",
};

// Resolve which artifact directory a sibling-asset request belongs to, via the Referer page.
const artifactDirFromReferer = (referer: string | null): string | null => {
  let slug: string | null = null;
  if (referer) {
    try {
      const rp = new URL(referer).pathname;
      if (rp.startsWith("/preview/")) {
        const s = decodeURIComponent(rp.slice("/preview/".length));
        if (drafts.has(s)) slug = s;
      }
    } catch { /* malformed referer → ignore */ }
  }
  // Fallback: exactly one artifact served → its directory is unambiguous even without a Referer.
  if (!slug && drafts.size === 1) slug = [...drafts.keys()][0];
  return slug ? dirname(drafts.get(slug)!) : null;
};

const serveSiblingAsset = async (assetPath: string, referer: string | null): Promise<Response> => {
  const dir = artifactDirFromReferer(referer);
  if (!dir) return new Response("not found", { status: 404 });
  // Fast-fail traversal/NUL defense before any filesystem access.
  if (!assetPath || assetPath.includes("\0") || assetPath.split("/").includes("..")) {
    return new Response("not found", { status: 404 });
  }
  const requested = resolve(dir, assetPath);
  // Canonicalize both sides (follows symlinks) and require containment — defeats residual
  // traversal and any symlink that points outside the artifact directory.
  let canonDir: string;
  let canonFile: string;
  try {
    canonDir = await realpath(dir);
    canonFile = await realpath(requested);
  } catch {
    return new Response("not found", { status: 404 }); // missing target or broken symlink
  }
  if (canonFile !== canonDir && !canonFile.startsWith(canonDir + sep)) {
    return new Response("not found", { status: 404 }); // escaped the artifact directory
  }
  // Close the time-of-check/time-of-use window by verifying the OPENED object's identity, not a
  // re-resolved path string. Capture the contained file's identity (device + inode) now, open a
  // handle, then require the fd's identity to match — a swap of canonFile between the check and
  // the read yields a different fd identity → 404, instead of letting the read follow the swapped
  // path outside the directory. We read from the pinned fd, never by re-resolving the path.
  // O_NOFOLLOW is defense-in-depth for the final component (a swapped-in symlink fails with ELOOP).
  // A legitimate symlink that was already inside the dir at check time still works, because
  // realpath() resolved it to its real in-dir target — that target is what we stat and open.
  // A post-check swap of an *intermediate* directory is also caught: the opened object's inode would
  // differ from the captured one → 404. The only residual is dev+ino reuse, which is not attacker-controllable.
  let id: { dev: number; ino: number };
  try {
    const s0 = statSync(canonFile);
    if (!s0.isFile()) return new Response("not found", { status: 404 }); // no directories/specials
    id = { dev: s0.dev, ino: s0.ino };
  } catch {
    return new Response("not found", { status: 404 });
  }
  let fd: number;
  try {
    fd = openSync(canonFile, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch {
    return new Response("not found", { status: 404 }); // missing, or final component is now a symlink
  }
  try {
    const s1 = fstatSync(fd);
    if (!s1.isFile() || s1.dev !== id.dev || s1.ino !== id.ino) {
      return new Response("not found", { status: 404 }); // swapped between check and open
    }
    const ct = ASSET_MIME[extname(canonFile).toLowerCase()] || "application/octet-stream";
    return new Response(readFileSync(fd), { headers: { "Content-Type": ct, "Cache-Control": "no-store" } });
  } finally {
    closeSync(fd);
  }
};

const server = Bun.serve({
  hostname: bindHost,
  port: 0,
  async fetch(req, srv) {
    const url = new URL(req.url);

    if (url.pathname === "/") {
      return new Response(renderIndex(), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
    }

    if (url.pathname.startsWith("/preview/")) {
      // Guarded the same way the Referer twin in artifactDirFromReferer is. A bare `%` in a
      // path is not a server fault — an HTML artifact referencing `chart 50%.png` sends one,
      // and some editors emit that unencoded. Unguarded, decodeURIComponent throws out of the
      // handler, so a request that should have been a plain 404 comes back 500 with a stack
      // trace and serveSiblingAsset never runs.
      let seg: string;
      try {
        seg = decodeURIComponent(url.pathname.slice("/preview/".length));
      } catch {
        return new Response("not found", { status: 404 });
      }
      // A known slug renders the artifact preview; anything else under /preview/ is a sibling
      // asset request from a rendered HTML page (relative URLs resolve here) — served read-only,
      // scoped to that artifact's own directory.
      if (drafts.has(seg)) {
        try {
          const html = await renderPreview(seg);
          if (!html) return new Response("not found", { status: 404 });
          return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
        } catch (e) {
          console.error(`[preview] render failed for slug=${seg}: ${(e as Error).message}`);
          return new Response("render failed", { status: 500 });
        }
      }
      if (req.method !== "GET" && req.method !== "HEAD") return new Response("method not allowed", { status: 405 });
      return await serveSiblingAsset(seg, req.headers.get("referer"));
    }

    const vendorPath = VENDOR_ASSETS[url.pathname];
    if (vendorPath) {
      return new Response(Bun.file(vendorPath), {
        headers: { "Content-Type": "application/javascript; charset=utf-8" },
      });
    }

    // Server is tag-agnostic: it persists every comment as one JSONL line and interprets
    // nothing in it. What a comment's text means is settled at apply time by the AI reading
    // it, not by any tag vocabulary here — the layer that once parsed such tags was removed
    // when this plugin was ported, and nothing replaced it.
    if (url.pathname === "/feedback" && req.method === "POST") {
      let body: FeedbackBody;
      try {
        body = (await req.json()) as FeedbackBody;
      } catch {
        return new Response("invalid JSON", { status: 400 });
      }
      // type guards + length caps to protect disk and JSONL schema
      const isStr = (v: unknown): v is string => typeof v === "string";
      if (!isStr(body.slug) || !isStr(body.selector) || !isStr(body.comment)) {
        return new Response("missing or non-string fields (slug, selector, comment)", { status: 400 });
      }
      if (body.selector.length === 0 || body.comment.length === 0) {
        return new Response("selector and comment must be non-empty", { status: 400 });
      }
      const draft = drafts.get(body.slug);
      if (!draft) return new Response("unknown slug", { status: 400 });
      // No length cap on the slug: the lookup above already rejects anything the server did
      // not derive, so a cap here restrains only the server's own value. A path deep enough
      // to overflow the filesystem's name limit surfaces as a caught ENAMETOOLONG below.
      // selector and comment stay capped — those are genuinely client-supplied.
      if (body.selector.length > MAX_SELECTOR_LEN) return new Response(`selector exceeds ${MAX_SELECTOR_LEN} chars`, { status: 413 });
      if (body.comment.length > MAX_COMMENT_LEN) return new Response(`comment exceeds ${MAX_COMMENT_LEN} chars`, { status: 413 });
      // Edit case: client supplies the original id so the new entry shares the dedup key
      // (latest-timestamp wins). New case: server mints a UUID — guarantees uniqueness so
      // two comments on the same element never collide.
      let id: string;
      if (isStr(body.id) && body.id.length > 0 && body.id.length <= MAX_ID_LEN) {
        id = body.id;
      } else if (body.id != null) {
        return new Response(`id must be string ≤${MAX_ID_LEN} chars`, { status: 400 });
      } else {
        id = crypto.randomUUID();
      }
      const entry = {
        id,
        slug: body.slug,
        // The slug widens on collision and then no longer maps back to a filename, so the
        // artifact it belongs to is carried explicitly — the apply step edits this path.
        artifact: draft,
        selector: body.selector,
        // Client-supplied, so capped here: a positional selector outlives the block it was
        // written about, and this is what the apply step compares against to notice.
        anchorText: isStr(body.anchorText) ? body.anchorText.slice(0, MAX_ANCHOR_TEXT_LEN) : "",
        comment: body.comment,
        timestamp: new Date().toISOString(),
      };
      const feedbackPath = resolve(dirname(draft), `feedback-${body.slug}.jsonl`);
      // surface I/O failures (disk full, permission denied) instead of silent loss
      try {
        appendNoFollow(feedbackPath, JSON.stringify(entry) + "\n");
      } catch (e) {
        const msg = (e as Error).message;
        console.error(`[feedback] FAILED to append ${feedbackPath}: ${msg}`);
        return new Response(`feedback write failed: ${msg}`, { status: 500 });
      }
      console.error(`[feedback] ${body.slug} id=${id.slice(0, 8)}… ← "${body.selector.slice(0, 50)}${body.selector.length > 50 ? "…" : ""}"`);
      return Response.json({ ok: true, id, path: feedbackPath });
    }

    if (url.pathname === "/feedback" && req.method === "DELETE") {
      // Tombstone strategy keyed by stable id. Existence check guards against ghost
      // tombstones (DELETE for non-matching key would silently no-op under the prior
      // tuple-based contract). Append-only invariant preserved.
      let body: Partial<DeleteBody>;
      try {
        body = (await req.json()) as Partial<DeleteBody>;
      } catch {
        return new Response("invalid JSON", { status: 400 });
      }
      const isStr = (v: unknown): v is string => typeof v === "string";
      if (!isStr(body.slug) || !isStr(body.id)) {
        return new Response("missing or non-string fields (slug, id)", { status: 400 });
      }
      if (body.id.length === 0) return new Response("id must be non-empty", { status: 400 });
      const draft = drafts.get(body.slug);
      if (!draft) return new Response("unknown slug", { status: 400 });
      // No length cap on the slug, for the same reason as POST above.
      if (body.id.length > MAX_ID_LEN) return new Response(`id exceeds ${MAX_ID_LEN} chars`, { status: 413 });
      const feedbackPath = resolve(dirname(draft), `feedback-${body.slug}.jsonl`);

      // Existence check: scan JSONL, find latest entry for this id, ensure it is a live
      // (non-tombstoned) annotation. Linear scan acceptable — feedback files are per-draft,
      // typically <1 MB.
      let liveEntry: any = null;
      try {
        const content = await readFile(feedbackPath, "utf8");
        let latest: any = null;
        for (const line of content.split("\n")) {
          if (!line.trim()) continue;
          try {
            const e = JSON.parse(line);
            if (e.id !== body.id) continue;
            if (!latest || (typeof e.timestamp === "string" && (typeof latest.timestamp !== "string" || e.timestamp > latest.timestamp))) {
              latest = e;
            }
          } catch {
            // skip malformed lines — preserves resilience to manual edits
          }
        }
        if (latest && !latest.deleted) liveEntry = latest;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
          const msg = (e as Error).message;
          console.error(`[feedback] DELETE existence check failed for ${feedbackPath}: ${msg}`);
          return new Response(`existence check failed: ${msg}`, { status: 500 });
        }
        // ENOENT — file does not exist, so target id cannot exist; fall through to 404
      }
      if (!liveEntry) {
        return new Response(JSON.stringify({ ok: false, deleted: false, reason: "not found or already deleted" }), {
          status: 404,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        });
      }

      const tombstone = {
        id: body.id,
        slug: body.slug,
        artifact: draft,
        selector: liveEntry.selector ?? "",
        anchorText: typeof liveEntry.anchorText === "string" ? liveEntry.anchorText : "",
        comment: "",
        deleted: true,
        timestamp: new Date().toISOString(),
      };
      try {
        appendNoFollow(feedbackPath, JSON.stringify(tombstone) + "\n");
      } catch (e) {
        const msg = (e as Error).message;
        console.error(`[feedback] FAILED to append tombstone ${feedbackPath}: ${msg}`);
        return new Response(`tombstone write failed: ${msg}`, { status: 500 });
      }
      console.error(`[feedback] DELETE ${body.slug} id=${body.id.slice(0, 8)}… ← "${(liveEntry.selector ?? "").slice(0, 50)}${(liveEntry.selector ?? "").length > 50 ? "…" : ""}"`);
      return Response.json({ ok: true, id: body.id, deleted: true, path: feedbackPath });
    }

    if (url.pathname === "/ws") {
      if (srv.upgrade(req)) return;
      return new Response("upgrade failed", { status: 400 });
    }

    return new Response("not found", { status: 404 });
  },
  websocket: {
    open(ws) {
      ws.subscribe("reload");
    },
    message() {
      // no inbound traffic expected
    },
  },
});

const lastFire = new Map<string, number>();
const WATCH_DEBOUNCE_MS = 150;
for (const [slug, path] of drafts) {
  // Watch the containing directory, not the file. `watch(path)` binds the inode, so a single
  // atomic save (write-temp + rename) leaves the watcher on the replaced inode: it goes silent
  // for the rest of the session while the status pill still reads "live", and the user keeps
  // commenting on a render that no longer matches the source.
  const dir = dirname(path);
  const name = basename(path);
  // mtime + inode, so a replacement that happened to preserve the timestamp still registers.
  const identity = () => {
    try { const s = statSync(path); return `${s.mtimeMs}:${s.ino}`; } catch { return null; }
  };
  let lastIdentity = identity();
  let trailing: ReturnType<typeof setTimeout> | null = null;

  const fire = () => {
    // Identity is checked at fire time, not at event time: this directory also carries the
    // artifact's feedback JSONL, its consumed-archive, and any temp file an atomic writer
    // leaves behind, and none of those change the artifact's own identity. That check is
    // what keeps a comment from reloading the page out from under the user still typing.
    const cur = identity();
    if (cur === null || cur === lastIdentity) return;
    lastIdentity = cur;
    lastFire.set(slug, Date.now());
    console.error(`[watch] ${slug} changed → publish reload`);
    server.publish("reload", JSON.stringify({ slug }));
  };

  const watcher = watch(dir, (_event, filename) => {
    // The event type is deliberately NOT consulted. macOS reports an in-place append as
    // "rename" too, so narrowing to "change" would put this watcher straight back to the
    // silent-death this directory watch exists to fix.
    // A platform that supplies no filename falls through the name test on purpose; the
    // identity check inside fire() is what decides there, so there is no second code path
    // to keep working.
    if (filename && filename !== name) return;
    const now = Date.now();
    const prev = lastFire.get(slug) ?? 0;
    if (now - prev < WATCH_DEBOUNCE_MS) {
      // Suppressed, not dropped. A save landing inside the window is still a real change,
      // and with a leading-edge-only debounce its content would never reach the browser:
      // the page would sit on the previous save with nothing further scheduled, and the
      // user would keep commenting on a render that no longer matches the source.
      if (trailing === null) {
        trailing = setTimeout(() => { trailing = null; fire(); }, WATCH_DEBOUNCE_MS - (now - prev));
      }
      return;
    }
    fire();
  });
  watcher.on("error", (err: NodeJS.ErrnoException) => {
    console.error(`[watch] error on ${dir}: ${err.message} (code=${err.code ?? "unknown"})`);
  });
}

// Open the artifact itself when there is only one — Phase 0 promises the browser opens to
// the rendered preview, and the index is not that. With several, the index is the entry
// point: auto-opening a tab per artifact is intrusive, and Rule 4's promise is each artifact
// having its own preview page, which it does either way.
const openPath = drafts.size === 1 ? `preview/${encodeURIComponent([...drafts.keys()][0])}` : "";
// Bound to the tailnet IP, the device reaches its own address locally, so this
// URL also opens on this machine — no separate localhost URL needed.
const url = `http://${bindHost}:${server.port}/${openPath}`;
console.error(`serving at ${url}`);
console.error(`drafts: ${[...drafts.keys()].join(", ")}`);
if (tailnet) {
  console.error(`tailnet: reachable from your tailnet devices (e.g. mobile) at ${url}`);
  if (tailnet.dnsName) console.error(`  or via MagicDNS: http://${tailnet.dnsName}:${server.port}/`);
}
console.error("Ctrl-C to stop.");

const opener = Bun.which("open") ?? Bun.which("xdg-open");
if (opener) {
  Bun.spawn([opener, url], { stdout: "ignore", stderr: "ignore" });
}
