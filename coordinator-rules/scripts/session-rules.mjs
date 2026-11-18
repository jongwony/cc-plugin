#!/usr/bin/env node
/**
 * SessionStart hook: put choi's rules into a session that has none installed.
 *
 * Claude Code loads every file in <config>/rules/ at session start. Sessions
 * on choi's Mac get those files as symlinks, and cloud environments that run
 * scripts/cloud-setup.sh get them from scripts/install-rules.sh. Some sessions
 * have neither: a project coordinator runs outside any cloud environment, so
 * no setup script reaches it, and a thread in an environment without the setup
 * script starts bare. Both still receive the plugins synced from the claude.ai
 * account, so this plugin carries the rules there as hook context.
 *
 * One source: the plugin's `rules`, `cloud-rules` and `install-rules.manifest`
 * are symlinks to the repository's own, so the manifest stays the one list
 * every surface reads and no copy can drift.
 *
 * No double load: where any manifest file name already exists in
 * <config>/rules/, the rules arrived another way and this hook is silent. One
 * present file is enough, not each file its own check: the Mac links only the
 * `rules/` entries, and `cloud-rules/` must stay out of it.
 *
 * Size: the host caps each additionalContext string at 10,000 characters and
 * past it substitutes a file path and a preview, and one hook command can hand
 * back only one such string. hooks.json therefore registers this script once
 * per part, as `<part>/<parts>` (`1/4` is part 1 of 4): every entry packs the
 * same files in manifest order into parts under the cap and emits its own
 * part, or nothing when the rules need fewer parts. The last entry names any
 * file that did not fit.
 *
 * Every failure path is open: whatever goes wrong, the hook exits 0, and the
 * session starts. Where the plugin's links did not survive (the synced copy
 * dropped them), the first entry says so in one line, so the gap is visible.
 * Zero external dependencies: Node.js standard library only.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CAP = 9500; // under the host's 10,000, with room for the part header

const pluginRoot =
  process.env.CLAUDE_PLUGIN_ROOT ||
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
const installedDir = path.join(configDir, "rules");

function readManifest() {
  const text = fs.readFileSync(path.join(pluginRoot, "install-rules.manifest"), "utf8");
  return text
    .split("\n")
    .map((l) => l.replace(/#.*/, "").trim())
    .filter(Boolean);
}

/** The rule files, read from the plugin in manifest order; none where any is installed. */
function collect() {
  const rules = [];
  const missing = [];
  const manifest = readManifest();
  if (manifest.some((rel) => fs.existsSync(path.join(installedDir, path.basename(rel))))) {
    return { rules, missing };
  }
  for (const rel of manifest) {
    try {
      const body = fs.readFileSync(path.join(pluginRoot, rel), "utf8").trim();
      if (body) rules.push({ rel, block: `<rule file="${rel}">\n${body}\n</rule>` });
      else missing.push(rel);
    } catch {
      missing.push(rel);
    }
  }
  return { rules, missing };
}

/** Greedy packing in manifest order; a file over the cap alone gets its own part. */
function pack(rules) {
  const parts = [];
  let cur = [];
  let size = 0;
  for (const r of rules) {
    const len = r.block.length + 1;
    if (cur.length && size + len > CAP) {
      parts.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(r);
    size += len;
  }
  if (cur.length) parts.push(cur);
  return parts;
}

function header(i, total) {
  return (
    `choi's rules from cc-plugin (coordinator-rules), part ${i + 1} of ${total}. ` +
    `This session has no ${installedDir}/ copy of these files, so they arrive here; ` +
    `hold them as the rules Claude Code would load from that directory.`
  );
}

function build(index, count) {
  let collected;
  try {
    collected = collect();
  } catch {
    return index === 0
      ? `coordinator-rules: install-rules.manifest is missing under ${pluginRoot}; the plugin's links did not survive, so no rules were loaded.`
      : "";
  }
  const { rules, missing } = collected;
  const parts = pack(rules);
  const lines = [];
  if (index < parts.length) {
    lines.push(header(index, parts.length), "", ...parts[index].map((r) => r.block));
  }
  if (index === count - 1) {
    const unsent = parts.slice(count).flat().map((r) => r.rel);
    if (unsent.length) lines.push(`coordinator-rules: these rules did not fit and were not loaded: ${unsent.join(", ")}.`);
  }
  if (index === 0 && missing.length) {
    lines.push(`coordinator-rules: these manifest files could not be read under ${pluginRoot}: ${missing.join(", ")}.`);
  }
  return lines.join("\n");
}

/** `<part>/<parts>`, 1-based, into a 0-based index and a count; anything else is 1/1. */
function parsePart(arg) {
  const m = /^(\d+)\/(\d+)$/.exec(arg ?? "");
  const part = m ? Number(m[1]) : 1;
  const parts = m ? Number(m[2]) : 1;
  return part >= 1 && part <= parts ? { index: part - 1, count: parts } : { index: 0, count: 1 };
}

function main() {
  const { index, count } = parsePart(process.argv[2]);
  let context = "";
  try {
    context = build(index, count);
  } catch {
    context = "";
  }
  if (!context) return;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context },
    }) + "\n",
  );
}

try {
  fs.readFileSync(0); // drain the hook payload; nothing in it is needed
} catch {}
main();
