#!/usr/bin/env node
/**
 * Copy the shared rules into this plugin, or check that the copies match.
 *
 * The plugin ships real copies of `scripts/install-rules.manifest` and every
 * file it lists, at the same repository-relative paths under the plugin
 * (`rules/…`, `cloud-rules/…`). Account sync delivers each plugin as a plain
 * directory, and whether it carries a symlink's target is unverified, so the
 * plugin holds no links. The repository's `rules/`, `cloud-rules/` and manifest
 * stay the one source: edit them there, run this script, and commit both. A
 * copy that changed is a change under the plugin, so the version-bump check
 * asks for a `coordinator-rules` bump with it.
 *
 *   node coordinator-rules/scripts/sync-shared.mjs          # write the copies
 *   node coordinator-rules/scripts/sync-shared.mjs --check  # exit 1 on drift
 *
 * A file the manifest no longer lists is removed from the copy (write) or
 * reported (check). Zero external dependencies: Node.js standard library only.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(pluginRoot, "..");
const MANIFEST = "scripts/install-rules.manifest";
const COPY_MANIFEST = "install-rules.manifest";
const COPY_DIRS = ["rules", "cloud-rules"];

export function listed(manifestText) {
  return manifestText
    .split("\n")
    .map((l) => l.replace(/#.*/, "").trim())
    .filter(Boolean);
}

function copiedFiles() {
  const out = [];
  for (const d of COPY_DIRS) {
    const dir = path.join(pluginRoot, d);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) out.push(`${d}/${f}`);
  }
  return out;
}

function main() {
  const check = process.argv.includes("--check");
  const manifestText = fs.readFileSync(path.join(repoRoot, MANIFEST), "utf8");
  const pairs = [[MANIFEST, COPY_MANIFEST], ...listed(manifestText).map((rel) => [rel, rel])];
  const want = new Set(pairs.map(([, dst]) => dst));
  const drift = [];

  for (const [src, dst] of pairs) {
    const body = fs.readFileSync(path.join(repoRoot, src));
    const target = path.join(pluginRoot, dst);
    const same = fs.existsSync(target) && !fs.lstatSync(target).isSymbolicLink() && fs.readFileSync(target).equals(body);
    if (same) continue;
    drift.push(`${dst} differs from ${src}`);
    if (!check) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.rmSync(target, { force: true });
      fs.writeFileSync(target, body);
    }
  }
  for (const dst of copiedFiles()) {
    if (want.has(dst)) continue;
    drift.push(`${dst} is not in ${MANIFEST}`);
    if (!check) fs.rmSync(path.join(pluginRoot, dst), { force: true });
  }

  if (check && drift.length) {
    console.error(`coordinator-rules copies are out of date:\n  ${drift.join("\n  ")}`);
    console.error("Run: node coordinator-rules/scripts/sync-shared.mjs, bump coordinator-rules' version, and commit.");
    process.exit(1);
  }
  if (!check) console.log(drift.length ? `Updated:\n  ${drift.join("\n  ")}` : "coordinator-rules copies are current.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
