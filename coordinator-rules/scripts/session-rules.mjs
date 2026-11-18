#!/usr/bin/env node
/**
 * SessionStart hook: give each session the rules its role needs.
 *
 * Claude Code loads every file in <config>/rules/ at session start. Sessions
 * on choi's Mac get those files as symlinks, and cloud environments that run
 * scripts/cloud-setup.sh get them from scripts/install-rules.sh. A project
 * coordinator runs outside any cloud environment and a thread in an
 * environment without the setup script starts bare; both still receive the
 * plugins synced from the claude.ai account, so this plugin reaches them.
 *
 * Role first. A role is a session kind with its own always-loaded core,
 * `roles/<role>.md`. The core carries only what that role does, and indexes
 * the rest by absolute path for the session to read when the moment comes
 * (`references/` and the shared `rules/` copies). A role's core
 * is emitted whether or not <config>/rules/ is installed, because the role
 * decides what the session needs, not the install state.
 *
 *   coordinator — CLAUDE_CODE_TERMINAL_MCP_TOOLS names
 *     mcp__hearthbot__start_thread. Threads carry the same variable without
 *     that tool, and CLAUDE_CODE_ENTRYPOINT / CLAUDE_CODE_COORDINATOR_EXTRA_TOOLS
 *     hold the same values in both, so this is the one marker observed to
 *     differ (2026-11-18). It is an undocumented product value: where it is
 *     unset in a projects session, the role is unknown, no core is emitted
 *     (fail closed), and part 1 says so in one line.
 *
 * No role: the full rules. A session with no role and nothing installed gets
 * every file the plugin's `install-rules.manifest` lists — the `rules/`
 * entries of the repository's manifest (see sync-shared.mjs). Where any manifest
 * file name already exists in <config>/rules/, the rules arrived another way
 * and this path is silent; one present file is enough, since the Mac links
 * only the `rules/` entries and `cloud-rules/` must stay out of it.
 *
 * Size: the host caps each additionalContext string at 10,000 characters, and
 * one hook command hands back one string. hooks.json therefore registers this
 * script once per part, as `<part>/<parts>`; a role core is one part (entry
 * 1), and the full rules pack into as many parts as they need, with the last
 * entry naming any file that did not fit.
 *
 * Every failure path is open: whatever goes wrong, the hook exits 0, and the
 * session starts. A path the core indexes that does not resolve (the synced
 * copy lost a file) is named in one line under the core.
 *
 * The shared rules are copies of the repository's own, kept equal by
 * scripts/sync-shared.mjs (CI runs its --check), because account sync delivers
 * a plugin as a plain directory.
 * Zero external dependencies: Node.js standard library only.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CAP = 9500; // under the host's 10,000, with room for the part header
const ROOT_TOKEN = "{{root}}";

const pluginRoot =
  process.env.CLAUDE_PLUGIN_ROOT ||
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
const installedDir = path.join(configDir, "rules");

/** The session's role: a name with a `roles/<name>.md`, null for none, "unknown" when undecidable. */
export function detectRole(env) {
  const tools = env.CLAUDE_CODE_TERMINAL_MCP_TOOLS;
  if (tools === undefined) {
    return env.CLAUDE_CODE_ENTRYPOINT === "remote_projects" ? "unknown" : null;
  }
  const names = tools.split(",").map((s) => s.trim());
  if (names.includes("mcp__hearthbot__start_thread")) return "coordinator";
  return null;
}

/** The role's core with every `{{root}}` made absolute, and the indexed paths that do not resolve. */
export function roleCore(role, root = pluginRoot) {
  const raw = fs.readFileSync(path.join(root, "roles", `${role}.md`), "utf8").trim();
  const body = raw.split(ROOT_TOKEN).join(root);
  const missing = [];
  const re = new RegExp(`${ROOT_TOKEN.replace(/[{}]/g, "\\$&")}/([\\w./-]+\\.md)`, "g");
  for (const m of raw.matchAll(re)) {
    if (!fs.existsSync(path.join(root, m[1])) && !missing.includes(m[1])) missing.push(m[1]);
  }
  return { body, missing };
}

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

function buildRole(role, index) {
  if (index !== 0) return "";
  let core;
  try {
    core = roleCore(role);
  } catch {
    return `coordinator-rules: roles/${role}.md is missing under ${pluginRoot}; no ${role} rules were loaded.`;
  }
  const lines = [
    `choi's ${role} rules from cc-plugin (coordinator-rules). This session was identified as the ${role}; ` +
      `the paths below are absolute — Read each one at the moment its line names.`,
    "",
    core.body,
  ];
  if (core.missing.length) {
    lines.push("", `coordinator-rules: these indexed files are missing under ${pluginRoot}: ${core.missing.join(", ")}.`);
  }
  return lines.join("\n");
}

function header(i, total) {
  return (
    `choi's rules from cc-plugin (coordinator-rules), part ${i + 1} of ${total}. ` +
    `This session has no ${installedDir}/ copy of these files, so they arrive here; ` +
    `hold them as the rules Claude Code would load from that directory.`
  );
}

function buildFull(index, count) {
  let collected;
  try {
    collected = collect();
  } catch {
    return index === 0
      ? `coordinator-rules: install-rules.manifest is missing under ${pluginRoot}; so no rules were loaded.`
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

export function build(index, count, env = process.env) {
  const role = detectRole(env);
  if (role === "unknown") {
    return index === 0
      ? "coordinator-rules: CLAUDE_CODE_TERMINAL_MCP_TOOLS is unset, so whether this session is the project coordinator " +
          "could not be told; no coordinator rules were loaded."
      : "";
  }
  if (role) return buildRole(role, index);
  return buildFull(index, count);
}

/** `<part>/<parts>`, 1-based, into a 0-based index and a count; anything else is 1/1. */
function parsePart(arg) {
  const m = /^(\d+)\/(\d+)$/.exec(arg ?? "");
  const part = m ? Number(m[1]) : 1;
  const parts = m ? Number(m[2]) : 1;
  return part >= 1 && part <= parts ? { index: part - 1, count: parts } : { index: 0, count: 1 };
}

function main() {
  try {
    fs.readFileSync(0); // drain the hook payload; nothing in it is needed
  } catch {}
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
