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

import { accessSync, closeSync, constants, existsSync, fstatSync, openSync, statSync, watch, writeSync } from "node:fs";
import { readdir, readFile, realpath } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, resolve, sep } from "node:path";
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

// The browser-side dependencies are checked here, beside the template, instead of being left to
// fail at request time. preview.html loads BOTH scripts unconditionally, and calls
// DOMPurify.addHook at module top level — ahead of the render-mode branch — so one missing file
// throws before anything renders, whichever mode the artifact is.
// What earns this a startup check rather than a 404 is how the failure LOOKS. The page still
// paints its static shell, and the status pill's markup already says "live", so a page whose
// whole inline script died is indistinguishable at a glance from a working one. The only report
// is in the browser console, which is where the person who launched this is not looking.
// Checked unconditionally, not per render mode. Conditioning on "does any artifact render as
// markdown" was considered and rejected on two grounds: the template's two <script> tags do not
// branch, so a mode-aware check would mirror a condition that does not exist and could drift
// from it; and one server serves several artifacts at once, so `a.html b.md` with marked absent
// leaves the HTML page working and the markdown page dead behind a single "serving at" line —
// the hardest shape of all to diagnose. An incomplete install is a fact about the install rather
// than about this invocation, which is the same reason the template above is read before
// anything has asked for it.
for (const vendorPath of Object.values(VENDOR_ASSETS)) {
  try {
    if (!statSync(vendorPath).isFile()) throw new Error("not a regular file");
    accessSync(vendorPath, constants.R_OK);
  } catch (e) {
    console.error(`fatal: cannot read vendored browser dependency: ${vendorPath}`);
    console.error(`  ${(e as Error).message}`);
    console.error("the skill installation is incomplete; verify templates/marked.min.js and templates/purify.min.js ship with the skill.");
    console.error("without them the preview page's inline script dies while the page still looks alive, and the only other report is in the browser console.");
    process.exit(1);
  }
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
    // writeSync is one write(2): it reports how many bytes went out and does not retry the
    // rest. Dropping that number means a short write appends a truncated JSONL line while the
    // handler still answers 200 {ok:true} — and a truncated line is then skipped as malformed
    // by both the apply step and the DELETE existence check, so the comment is gone while the
    // user has been told it saved.
    // Buffer rather than the string overload: resuming by offset on a string counts UTF-16
    // code units, which splits a multi-byte character. Korean comments are the normal case
    // here, not the edge one.
    // The resumed part is a second append, so a line is only guaranteed contiguous while the
    // server is the sole appender — which it is. Not looping does not buy that guarantee
    // back; it trades a rare split line for a guaranteed truncated one.
    const buf = Buffer.from(line, "utf8");
    let off = 0;
    while (off < buf.length) off += writeSync(fd, buf, off, buf.length - off);
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
//
// The match is returned alongside the body because this pattern also matches a document that
// merely OPENS with a thematic break: `---`, a blank line, a paragraph, `---` is a leading
// horizontal rule and prose, not frontmatter, and everything up to the second `---` is taken.
// The page names what was taken instead of tightening the pattern, so a reader who is about to
// comment on a truncated document can see the piece that is missing and recognise it as their
// own prose. A pattern narrow enough to never misfire is a different change with its own
// trade-offs; being visible when it does misfire is not.
const stripFrontmatter = (md: string): { body: string; stripped: string } => {
  const m = md.match(/^---\r?\n[\s\S]*?\r?\n---\r?(?:\n|$)/);
  return m ? { body: md.slice(m[0].length), stripped: m[0] } : { body: md, stripped: "" };
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
  const { body, stripped } =
    renderMode === "markdown" ? stripFrontmatter(raw) : { body: raw, stripped: "" };
  // title goes into HTML context, where escapeHtml handles `<`. Slug and body both land inside
  // real script elements — a slug is a filename minus its extension, and a filename may contain
  // `<!--<script` — so each is JSON-stringified and then run through escapeForScriptTag;
  // JSON.parse and the JS parser reverse it losslessly.
  const values: Record<string, string> = {
    __TITLE_PLACEHOLDER__: escapeHtml(slug),
    __SLUG_PLACEHOLDER__: escapeForScriptTag(JSON.stringify(slug)),
    __RENDER_MODE_PLACEHOLDER__: JSON.stringify(renderMode),
    __MARKDOWN_CONTENT_PLACEHOLDER__: escapeForScriptTag(JSON.stringify(body)),
    __FRONTMATTER_PLACEHOLDER__: escapeForScriptTag(JSON.stringify(stripped)),
  };
  // One pass over the template, so a value is never re-entered into the substitution it was
  // the output of. Sequential replaces failed twice on these same few lines before this:
  // once because `$&` in a replacement string is expansion syntax, and once because an
  // inserted slug carried a later slot's placeholder, which left that slot bare and killed
  // the client script. Both are the same shape — a value being read as syntax by the step
  // that placed it. The function form also keeps `$` inert, so this subsumes the earlier
  // repair rather than sitting beside it.
  return template.replace(
    /__(?:TITLE|SLUG|RENDER_MODE|MARKDOWN_CONTENT|FRONTMATTER)_PLACEHOLDER__/g,
    (match) => values[match],
  );
};

interface FeedbackBody {
  slug: string;
  selector: string; // CSS path down to the right-clicked element — a path, not a unique address
  comment: string;
  anchorText?: string; // rendered text of that element when the comment was made
  // Sent only when anchorText came out empty. An <img>, an <hr>, a figure holding only a
  // picture, an empty cell: those have no text LEGITIMATELY, and treating that emptiness as
  // "no evidence" left them permanently unconfirmable. This carries source-authored attributes
  // instead — never anything the render computed, which would move whenever the source did.
  anchorSig?: string;
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
// Each entry says TWO things, because the table was already deciding both and only showing one:
// what the bytes are, and whether a browser may treat them as a DOCUMENT — that is, whether
// navigating to this asset can put script on this origin, where it passes the cross-origin check
// on /feedback and writes into the queue the next apply round turns into edits.
//
// The second property is why `.html` went in and came back out, and why `.svg` sat here
// unnoticed while it did. Adding a header to one extension would leave the shape that produced
// both, and the next extension added would go the same way. So the property is declared per
// entry, and the response path acts on the declaration rather than on a list of special cases.
//
// MEASURED, not assumed, and measured for EVERY entry rather than for one and generalised: the
// same SVG-carrying-a-script payload was served under each type in this table and navigated to.
// Exactly one ran. Where a `document` flag is absent below it is because that measurement said
// so — not because the extension looked harmless.
//
// The measurement's limit, stated because it is a security boundary: it varies the DECLARED TYPE
// over fixed bytes, which is the property this table controls. It does not exercise a scripting
// facility built into a format's own bytes. `.pdf` is the one such format here, so it is flagged
// too — not because PDF script was shown to reach this origin, but because it was not shown not
// to, and the header costs nothing there (a real PDF still renders in the viewer with it on).
type AssetType = { mime: string; document?: true };
const ASSET_TYPES: Record<string, AssetType> = {
  ".css": { mime: "text/css" }, ".js": { mime: "text/javascript" }, ".mjs": { mime: "text/javascript" },
  ".png": { mime: "image/png" }, ".jpg": { mime: "image/jpeg" }, ".jpeg": { mime: "image/jpeg" },
  ".gif": { mime: "image/gif" },
  // The one that ran. A navigated SVG is an XML document and executes its own <script>; as an
  // <img> source it does not, which is why the entry stays and the header goes on instead.
  ".svg": { mime: "image/svg+xml", document: true },
  ".webp": { mime: "image/webp" }, ".avif": { mime: "image/avif" }, ".ico": { mime: "image/x-icon" },
  ".woff": { mime: "font/woff" }, ".woff2": { mime: "font/woff2" }, ".ttf": { mime: "font/ttf" },
  ".otf": { mime: "font/otf" },
  ".json": { mime: "application/json" }, ".map": { mime: "application/json" },
  ".txt": { mime: "text/plain" }, ".csv": { mime: "text/csv" },
  // THERE IS NO `.html` / `.htm` ENTRY, AND THAT IS THE DECISION — not an oversight.
  // An earlier revision added them, which turned a sibling page from a download into a rendered
  // top-level document and was meant to make a multi-page artifact navigable. It was reverted.
  // Two costs, and the second is what settled it:
  //
  // EXECUTION BOUNDARY. A rendered sibling sits on the preview's own ORIGIN, so a script inside
  // it passes the cross-origin check on /feedback and can write to the queue — which the next
  // apply round turns into edits to the user's file. Neither guard nearby reaches that path:
  // the markdown sanitizer only cleans markdown, and the origin check only refuses OTHER
  // origins. This one would be same-origin by construction.
  //
  // IT WIDENS THE REFERER GAP. A sibling asset is located from the Referer page's slug, and a
  // rendered sibling's own URL is not a slug. So every relative asset ON such a page 404s, and
  // with more than one artifact open there is no single-draft fallback to cover it. Rendering
  // the page therefore delivers a navigable dead end rather than a navigable artifact: the
  // thing the entry was added for is the thing it does not actually give.
  //
  // What did NOT change: the user's premise that they only ever open artifacts they wrote
  // themselves still stands. This revert is a second cost landing on this side of the ledger,
  // not the premise falling. The Bun.file(path) streaming below trades that same premise for a
  // memory bound and is unaffected — do not read this line as a reason to revisit it too.
  //
  // Putting these entries back means fixing the Referer-based lookup first, which is a change
  // to the URL structure and does not live on this line.
  ".mp4": { mime: "video/mp4" }, ".webm": { mime: "video/webm" }, ".mp3": { mime: "audio/mpeg" },
  // Flagged on the limit above, not on a measurement of PDF's own scripting.
  ".pdf": { mime: "application/pdf", document: true },
};

// What goes on a response the table calls a document. `default-src 'none'` was measured against
// the SVG case: navigating to a script-carrying SVG stops running it, and the same file used as
// an <img> source still renders. Anything not flagged gets no header and is served as before.
const DOCUMENT_CSP = "default-src 'none'";

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

// `bytes=start-end`, plus the open-ended and suffix forms a media element actually sends.
// A multi-range request (comma-separated) is deliberately not answered as multipart: returning
// the whole file with 200 is a valid answer to a Range request, and a half-built multipart
// encoder is worse than not offering one.
const parseRange = (header: string | null, size: number): { start: number; end: number } | "invalid" | null => {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null; // unparseable or multi-range → ignore it and send the whole file
  const [, rawStart, rawEnd] = m;
  if (rawStart === "" && rawEnd === "") return null;
  let start: number;
  let end: number;
  if (rawStart === "") {
    const suffix = Number(rawEnd); // last N bytes
    if (!Number.isFinite(suffix) || suffix === 0) return "invalid";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === "" ? size - 1 : Math.min(Number(rawEnd), size - 1);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return "invalid";
  return { start, end };
};

const serveSiblingAsset = async (assetPath: string, referer: string | null, rangeHeader: string | null): Promise<Response> => {
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
  // Open the file and verify the OPENED object rather than trusting the path string alone:
  // capture the contained file's identity (device + inode), open a handle, require the fd's
  // identity to match. O_NOFOLLOW covers the final component (a swapped-in symlink fails with
  // ELOOP). A legitimate symlink that was already inside the dir at check time still works,
  // because realpath() resolved it to its real in-dir target — that target is what is stat'd and
  // opened. A swapped *intermediate* directory is caught too: the opened object's inode would
  // differ from the captured one.
  //
  // WHAT THIS NO LONGER BUYS. An earlier revision read the bytes out of this pinned fd, and said
  // so: "we read from the pinned fd, never by re-resolving the path". That sentence is now false
  // and has been removed rather than left to authorise a wrong reading of the code below. The
  // body is produced by Bun.file(canonFile), which opens the path a second time. So what survives
  // is: at the moment of the check, this path resolved to a regular file inside the artifact
  // directory, reached without following a symlink out of it. What does NOT survive is any
  // guarantee that the bytes sent are that same object's — a swap of canonFile between this check
  // and Bun's own open is no longer excluded.
  //
  // That was traded knowingly. Reading the whole file into a buffer holds it resident for the
  // length of the transfer (+201 MiB for a 200 MiB asset, per concurrent request), and every
  // form that both streams and manages its own descriptor names a path. The trade rests on the
  // user's stated premise that they only ever open artifacts they wrote themselves: the window
  // needs someone else able to swap files in the artifact's own directory mid-request, so a
  // directory the user controls is one where this guards against itself. If that premise stops
  // holding, this is where to look. (An earlier revision named the .html entry in the asset table as
  // the first place; that entry has since been reverted, so this is now the only one.)
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
  // The fd is the verification handle, not the read source — see the note above. Nothing outside
  // this scope holds it, so it closes here on every path.
  try {
    const s1 = fstatSync(fd);
    if (!s1.isFile() || s1.dev !== id.dev || s1.ino !== id.ino) {
      return new Response("not found", { status: 404 }); // swapped between check and open
    }
    const size = s1.size;
    const assetType = ASSET_TYPES[extname(canonFile).toLowerCase()];
    const ct = assetType?.mime ?? "application/octet-stream";
    const range = parseRange(rangeHeader, size);
    if (range === "invalid") {
      return new Response("range not satisfiable", {
        status: 416,
        headers: { "Content-Range": `bytes */${size}`, "Cache-Control": "no-store" },
      });
    }
    // Bun.file streams: the body never becomes a resident copy of the file. Reading it into a
    // buffer instead peaked at +201 MiB for a 200 MiB asset while the response was in flight —
    // per concurrent request. Measuring that requires sampling DURING the transfer against a
    // throttled consumer on a real interface; after it completes, buffered and streamed report
    // the same near-zero number, and an earlier revision of this file drew the wrong conclusion
    // from exactly that.
    // Hand-built streams are not the alternative: a push-based ReadableStream peaked at
    // +979 MiB and a BYOB byte stream at +1015 MiB, because this runtime pulls a script-driven
    // body ahead regardless of the source's backpressure signal. Bun.file(fd) would keep the
    // pinned descriptor and costs +0 MiB, but never closes the descriptor it is handed — 100
    // requests, 100 open descriptors, none reclaimed by a forced GC.
    const start = range ? range.start : 0;
    const end = range ? range.end : size - 1;
    const file = Bun.file(canonFile);
    const body = range ? file.slice(start, end + 1) : file;
    return new Response(body, {
      status: range ? 206 : 200,
      headers: {
        "Content-Type": ct,
        "Cache-Control": "no-store",
        "Accept-Ranges": "bytes",
        // Attached from the table's own declaration, so a type added later is covered by the
        // answer its entry gives rather than by anyone remembering this line exists.
        ...(assetType?.document ? { "Content-Security-Policy": DOCUMENT_CSP } : {}),
        ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
      },
    });
  } finally {
    closeSync(fd);
  }
};

// Cross-origin writes are refused. `text/plain` makes a POST a CORS simple request, so no
// preflight is sent and any page the user happens to have open can reach this port while a
// review channel is up: it drops an instruction into the queue, and the next apply round turns
// that into an edit of the user's own file. Measured before this guard: a POST carrying
// `Origin: https://evil.example` returned 200 and appended, and the matching DELETE tombstoned
// a real comment — so the write side was open in both directions.
//
// What this buys: the browser sets `Origin` itself and page script cannot forge it, so a page
// on another origin cannot write here.
//
// What it does NOT buy: this is not authentication. A client that sends no `Origin` at all —
// curl, a script, anything that is not a browser — still writes, deliberately, because that is
// the local-tooling path. The tailnet exposure recorded as H9 is therefore UNCHANGED by this
// check; do not read it as having closed that. Read paths (/preview/, sibling assets, vendored
// assets) are untouched on purpose: what was decided here was the write side.
//
// `Origin: null` — a sandboxed iframe, or a page loaded from file:// — arrives as the literal
// string "null" rather than as an absent header, so it falls outside the allow-list and is
// refused. That is the intended answer for it.
const writeOriginAllowed = (req: Request, port: number): boolean => {
  const origin = req.headers.get("origin");
  if (origin === null) return true; // not a browser write — see above
  const allowed = [`http://${bindHost}:${port}`, `http://localhost:${port}`];
  // The startup banner advertises the MagicDNS name alongside the IP, and a phone that opens
  // THAT url sends it as its origin. An allow-list built from the IP alone would refuse
  // exactly the path the tailnet bind exists to serve, and the only symptom would be that
  // saving quietly stopped working.
  if (tailnet?.dnsName) allowed.push(`http://${tailnet.dnsName}:${port}`);
  return allowed.includes(origin);
};

// ── The live queue, computed the way the APPLY step computes it ─────────────────────────────
//
// WHICH RULE THIS IS, AND WHY IT IS NOT THE DELETE CHECK'S. The sidebar this feeds is a preview
// of what the apply step will act on, so it has to agree with the apply step. Agreeing with the
// tombstone guard below instead would let the list and the edit disagree — the same "two
// screens, two facts" failure this endpoint exists to end, moved one layer down. The DELETE
// existence check keeps its own tie-break because it asks a different question (is there a live
// entry to tombstone?) and SKILL.md states why that divergence is safe there. Two rules, not
// three: this one and the DELETE check. Do not add a third by inventing a display rule.
//
// The rule, from SKILL.md "The Queue File": entries sharing an `id` are an edit history and the
// latest timestamp wins; a line is live when its latest non-marker entry is not a tombstone AND
// no consumed-marker for that `id` carries a `consumedThrough` at or after that entry's
// timestamp. Where the latest timestamp is a tie between entries of DIFFERENT KINDS, the one
// that produces no edit wins — a tombstone beats an edit of the same millisecond.
type QueueEntry = { id: string; selector: string; anchorText: string; anchorSig: string; comment: string; timestamp: string };

const liveQueueEntries = async (slug: string, draft: string): Promise<QueueEntry[]> => {
  const dir = dirname(draft);
  const entries: any[] = [];

  // Every queue file beside the source, not only the one named for the current slug. A slug
  // widens when two artifacts would otherwise share one, so THIS artifact can have left a queue
  // under a different name in an earlier session — Phase 0 surfaces it and the apply step acts
  // on it, and a sidebar reading one filename would show 0 over a queue that is not empty. That
  // is the same "two screens, two facts" this endpoint exists to end, and the markers loop below
  // already handles the identical case for its own files.
  //
  // TWO KINDS OF EVIDENCE, because SKILL.md's Phase 0 uses two clauses. The current slug's file
  // is read BY NAME — the filename is what says the lines are this artifact's, which is why a
  // line in it with no `artifact` field is kept rather than dropped: it shows today, and nothing
  // about it changed. Any OTHER file is selected by its entries carrying this artifact's path,
  // so there a missing `artifact` field is not weak evidence of membership but none at all, and
  // the line is skipped. Same reasoning the anchor guard runs on: absence of the field is the
  // absence of the evidence, not a reason to assume the answer.
  // An `artifact` field that disagrees excludes the line wherever it sits, own file included —
  // it is a positive statement that the line belongs somewhere else. That test only means
  // anything for an ABSOLUTE path, which is what this server writes. A relative one makes no
  // statement this code can evaluate: it is relative to a working directory the line does not
  // record, and resolving it against the artifact's own directory would be a guess dressed as a
  // comparison. So a relative path is treated like a missing one — unevaluable, falling back to
  // the filename. Only a hand-edited queue produces one, and dropping a hand-written line in
  // silence is precisely the failure this endpoint exists to remove.
  const ownQueue = `feedback-${slug}.jsonl`;
  let queueFiles: string[] = [];
  try {
    queueFiles = (await readdir(dir)).filter((n) =>
      n.startsWith("feedback-") && n.endsWith(".jsonl") &&
      // The apply step writes both of these beside the source and both match the glob. Counting
      // them would report retired markers and archived copies back as queued comments.
      !n.endsWith(".markers.jsonl") && !n.endsWith(".consumed.jsonl"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  // Read by name even if the directory could not be listed: losing the current queue because a
  // readdir failed would be a far worse failure than missing a carryover.
  if (!queueFiles.includes(ownQueue)) queueFiles.push(ownQueue);

  for (const name of queueFiles) {
    const isOwnQueue = name === ownQueue;
    let content: string;
    try {
      content = await readFile(resolve(dir, name), "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw e;
    }
    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      // Malformed lines are skipped rather than fatal, matching the DELETE scan — the queue is
      // a file a person may have edited by hand.
      let e: any;
      try { e = JSON.parse(line); } catch { continue; }
      const claimsArtifact = typeof e?.artifact === "string" && isAbsolute(e.artifact);
      if (claimsArtifact) { if (e.artifact !== draft) continue; }
      else if (!isOwnQueue) continue;
      entries.push(e);
    }
  }

  const latest = new Map<string, any>();
  for (const e of entries) {
    if (typeof e?.id !== "string" || e.consumed === true) continue; // a marker is not an entry
    const prev = latest.get(e.id);
    if (!prev) { latest.set(e.id, e); continue; }
    const a = typeof e.timestamp === "string" ? e.timestamp : "";
    const b = typeof prev.timestamp === "string" ? prev.timestamp : "";
    if (a > b) latest.set(e.id, e);
    // The tie, and the only place this differs from a plain "latest wins": same timestamp,
    // different kinds → the tombstone. See the note above for why it leans this way.
    else if (a === b && e.deleted === true && prev.deleted !== true) latest.set(e.id, e);
  }

  // Consumed markers retire lines an apply round already turned into edits. Without this the
  // sidebar re-lists applied comments as if they were still pending, which is worse than the
  // empty list it replaces. Every `feedback-*.markers.jsonl` in the directory is read, not just
  // this slug's: markers are keyed by `id`, ids are unique, and a carried-over queue's markers
  // can sit under an earlier slug's name.
  const consumedThrough = new Map<string, string>();
  try {
    for (const name of await readdir(dir)) {
      if (!name.startsWith("feedback-") || !name.endsWith(".markers.jsonl")) continue;
      let text: string;
      try { text = await readFile(resolve(dir, name), "utf8"); } catch { continue; }
      for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        try {
          const m = JSON.parse(line);
          if (m?.consumed !== true || typeof m.id !== "string") continue;
          const t = typeof m.consumedThrough === "string" ? m.consumedThrough : "";
          const prev = consumedThrough.get(m.id);
          if (!prev || t > prev) consumedThrough.set(m.id, t);
        } catch { }
      }
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }

  const live: QueueEntry[] = [];
  for (const [id, e] of latest) {
    if (e.deleted === true) continue;
    const t = typeof e.timestamp === "string" ? e.timestamp : "";
    const through = consumedThrough.get(id);
    if (through !== undefined && through >= t) continue; // retired by an apply round
    live.push({
      id,
      selector: typeof e.selector === "string" ? e.selector : "",
      anchorText: typeof e.anchorText === "string" ? e.anchorText : "",
      anchorSig: typeof e.anchorSig === "string" ? e.anchorSig : "",
      comment: typeof e.comment === "string" ? e.comment : "",
      timestamp: t,
    });
  }
  live.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));
  return live;
};

// Which artifacts' watchers have died, for the life of this process. A death is a fact about
// the session, not about whichever socket happened to be connected when it happened, and the
// publish below reaches only the latter. Recorded here so `websocket.open` can tell a page
// that arrives afterwards — including the page the notice itself asked the user to open.
const deadWatchers = new Set<string>();

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
      return await serveSiblingAsset(seg, req.headers.get("referer"), req.headers.get("range"));
    }

    const vendorPath = VENDOR_ASSETS[url.pathname];
    if (vendorPath) {
      return new Response(Bun.file(vendorPath), {
        headers: { "Content-Type": "application/javascript; charset=utf-8" },
      });
    }

    // Reading the queue. No Origin allow-list here, and that is a decision rather than an
    // omission on the write guard's part:
    //   Against a hostile PAGE, the browser already refuses to hand the response body to a
    //   cross-origin script, because no CORS header is sent. An allow-list would be a second
    //   lock on a door the browser holds shut, and would suggest a protection this endpoint
    //   does not otherwise have.
    //   Against anything that can simply REACH the port — which is the exposure the tailnet
    //   bind creates — an Origin check does nothing at all: a client that omits the header is
    //   treated as "not a browser write" and allowed, so the check is not a barrier there.
    // What it DOES change, measured: the same bytes are already served from
    // /preview/feedback-{slug}.jsonl as a sibling asset, but only for a request carrying a
    // Referer that names a known slug. With one artifact there is a single-draft fallback, so
    // that file already answers a request with no Referer at all and this endpoint adds no
    // reach. With several artifacts it does not, so this endpoint IS newly readable without a
    // Referer. That step was never a security control — any client can send any Referer — but
    // it is a real difference and saying "no new exposure" flatly would be false.
    if (url.pathname === "/feedback" && (req.method === "GET" || req.method === "HEAD")) {
      const slug = url.searchParams.get("slug") ?? "";
      const draft = drafts.get(slug);
      if (!draft) return new Response("unknown slug", { status: 400 });
      try {
        const live = await liveQueueEntries(slug, draft);
        return new Response(JSON.stringify({ ok: true, slug, entries: live }), {
          headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
        });
      } catch (e) {
        const msg = (e as Error).message;
        console.error(`[feedback] queue read failed for ${slug}: ${msg}`);
        return new Response(`queue read failed: ${msg}`, { status: 500 });
      }
    }

    // Server is tag-agnostic: it persists every comment as one JSONL line and interprets
    // nothing in it. What a comment's text means is settled at apply time by the AI reading
    // it, not by any tag vocabulary here — the layer that once parsed such tags was removed
    // when this plugin was ported, and nothing replaced it.
    if (url.pathname === "/feedback" && req.method === "POST") {
      if (!writeOriginAllowed(req, srv.port)) {
        return new Response("cross-origin write refused", { status: 403 });
      }
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
        // Same cap as anchorText, and for the same reason: the page truncates before sending, so
        // a comparison against an uncapped value would fail on every long one.
        anchorSig: isStr(body.anchorSig) ? body.anchorSig.slice(0, MAX_ANCHOR_TEXT_LEN) : "",
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
      // Every page on this slug re-reads the queue. Scoped to the slug for the same reason the
      // watcher notice is: another artifact's page has no business changing because this one's
      // queue moved. NOT a reload — a reload would destroy a comment being written on the other
      // device, which is the failure this whole endpoint is downstream of.
      publishToSlug(body.slug, "queue-changed");
      return Response.json({ ok: true, id, path: feedbackPath });
    }

    if (url.pathname === "/feedback" && req.method === "DELETE") {
      if (!writeOriginAllowed(req, srv.port)) {
        return new Response("cross-origin write refused", { status: 403 });
      }
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
        anchorSig: typeof liveEntry.anchorSig === "string" ? liveEntry.anchorSig : "",
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
      publishToSlug(body.slug, "queue-changed");
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
      // Replay the watcher deaths already seen, TO THIS SOCKET ONLY.
      //
      // Without this the notice is erased by the action it asks for. It says "reload
      // manually"; a reload builds a fresh page whose `watchStale` starts false and whose
      // `onopen` writes "live" back, so the warning vanishes while the watcher stays dead and
      // the page stays permanently stale. Instructing the user to perform the one action that
      // destroys the warning is worse than not warning them at all.
      // A second path needs it too: a watcher that dies before any page has connected
      // publishes to zero subscribers, and the fact is then gone for the whole session.
      //
      // Sent per socket rather than through publishToSlug, because a broadcast would mark
      // every OTHER artifact's page as dead as well — watchers are per artifact. The frame is
      // byte-identical to what the publish path sends: the client already drops frames whose
      // slug is not its own, so one wire format and one client branch cover both deliveries.
      for (const slug of deadWatchers) ws.send(JSON.stringify({ slug, type: "watch-error" }));
    },
    message() {
      // no inbound traffic expected
    },
  },
});

const lastFire = new Map<string, number>();
const WATCH_DEBOUNCE_MS = 150;
// Both notices to the page go out through here. Keeping one publish path means the reload
// regression exercises the wiring the watcher-death notice also travels on, and what differs
// between them is a single argument rather than a second call site that can rot unnoticed.
const publishToSlug = (slug: string, type: "reload" | "watch-error" | "queue-changed") =>
  server.publish("reload", JSON.stringify({ slug, type }));
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
    publishToSlug(slug, "reload");
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
    // The watcher is not rebuilt — but the page must stop claiming it is live, because from
    // here on no edit will ever reach it. Logging alone left the status pill reading "live"
    // over a page that could never update again, which is the one state where that indicator
    // is not merely unhelpful but actively wrong. Scoped to this artifact's slug: watchers are
    // per artifact and one dying says nothing about the others.
    // Two deliveries, because neither one alone covers the session: the publish reaches the
    // pages open at this instant, and the set reaches every page that connects after it. Drop
    // either and a real case goes unwarned — see the note in `websocket.open`.
    deadWatchers.add(slug);
    publishToSlug(slug, "watch-error");
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
