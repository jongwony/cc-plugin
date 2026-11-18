#!/usr/bin/env node
/**
 * Copy the shared rules a role core indexes into this plugin, or check that
 * the copies match.
 *
 * A core (`roles/*.md`) points to shared rules as `{{root}}/rules/<file>.md`.
 * The plugin ships a real copy of each such file from the repository's
 * `rules/`, and nothing else from it: account sync delivers each plugin as a
 * plain directory, and whether it carries a symlink's target is unverified, so
 * the plugin holds no links. The repository's `rules/` stays the one source:
 * edit a rule there, run this script, and commit both. A copy that changed is
 * a change under the plugin, so the version-bump check asks for a
 * `coordinator-rules` bump with it.
 *
 *   node coordinator-rules/scripts/sync-shared.mjs          # write the copies
 *   node coordinator-rules/scripts/sync-shared.mjs --check  # exit 1 on drift
 *
 * A copy no core indexes any more is removed (write) or reported (check).
 * Zero external dependencies: Node.js standard library only.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { indexedPaths } from "./session-rules.mjs";

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(pluginRoot, "..");
const SHARED = "rules";

/** The `rules/` files every role core indexes, in order of first mention. */
export function sharedPaths(root = pluginRoot) {
  const out = [];
  for (const f of fs.readdirSync(path.join(root, "roles")).filter((n) => n.endsWith(".md")).sort()) {
    const raw = fs.readFileSync(path.join(root, "roles", f), "utf8");
    for (const rel of indexedPaths(raw)) if (rel.startsWith(`${SHARED}/`) && !out.includes(rel)) out.push(rel);
  }
  return out;
}

function main() {
  const check = process.argv.includes("--check");
  const want = sharedPaths();
  const drift = [];

  for (const rel of want) {
    const body = fs.readFileSync(path.join(repoRoot, rel));
    const target = path.join(pluginRoot, rel);
    const same = fs.existsSync(target) && !fs.lstatSync(target).isSymbolicLink() && fs.readFileSync(target).equals(body);
    if (same) continue;
    drift.push(`${rel} differs from the repository's ${rel}`);
    if (!check) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.rmSync(target, { force: true });
      fs.writeFileSync(target, body);
    }
  }
  const dir = path.join(pluginRoot, SHARED);
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    const rel = `${SHARED}/${f}`;
    if (want.includes(rel)) continue;
    drift.push(`${rel} is indexed by no role core`);
    if (!check) fs.rmSync(path.join(pluginRoot, rel), { force: true });
  }

  if (check && drift.length) {
    console.error(`coordinator-rules copies are out of date:\n  ${drift.join("\n  ")}`);
    console.error("Run: node coordinator-rules/scripts/sync-shared.mjs, bump coordinator-rules' version, and commit.");
    process.exit(1);
  }
  if (!check) console.log(drift.length ? `Updated:\n  ${drift.join("\n  ")}` : "coordinator-rules copies are current.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
