#!/usr/bin/env node
/**
 * SessionStart hook: give a project coordinator its rules.
 *
 * A project coordinator runs outside any cloud environment, so no setup script
 * installs choi's rules into its <config>/rules/; it still receives the
 * plugins synced from the claude.ai account, so this plugin reaches it.
 *
 * A role is a session kind with its own always-loaded core, `roles/<role>.md`.
 * The core carries only what that role does and indexes the rest by absolute
 * path for the session to read when the moment comes (`references/` and the
 * `rules/` copies). It is one string under the host's 10,000-character cap,
 * so hooks.json registers one entry. A session with no role gets nothing.
 *
 *   coordinator — CLAUDE_CODE_TERMINAL_MCP_TOOLS names
 *     mcp__hearthbot__start_thread. Threads carry the same variable without
 *     that tool, and CLAUDE_CODE_ENTRYPOINT / CLAUDE_CODE_COORDINATOR_EXTRA_TOOLS
 *     hold the same values in both, so this is the one marker observed to
 *     differ (2026-11-18). It is an undocumented product value: where it is
 *     unset in a projects session, the role is unknown, no core is emitted
 *     (fail closed), and one line says so.
 *
 * Every failure path is open: whatever goes wrong, the hook exits 0, and the
 * session starts. A path the core indexes that does not resolve (the synced
 * copy lost a file) is named in one line under the core.
 * Zero external dependencies: Node.js standard library only.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_TOKEN = "{{root}}";

const pluginRoot =
  process.env.CLAUDE_PLUGIN_ROOT ||
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

/** Plugin-relative paths a core indexes as `{{root}}/<path>.md`, in order of first mention. */
export function indexedPaths(raw) {
  const re = new RegExp(`${ROOT_TOKEN.replace(/[{}]/g, "\\$&")}/([\\w./-]+\\.md)`, "g");
  const out = [];
  for (const m of raw.matchAll(re)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

/** The role's core with every `{{root}}` made absolute, and the indexed paths that do not resolve. */
export function roleCore(role, root = pluginRoot) {
  const raw = fs.readFileSync(path.join(root, "roles", `${role}.md`), "utf8").trim();
  const body = raw.split(ROOT_TOKEN).join(root);
  const missing = indexedPaths(raw).filter((rel) => !fs.existsSync(path.join(root, rel)));
  return { body, missing };
}

export function build(env = process.env) {
  const role = detectRole(env);
  if (role === "unknown") {
    return (
      "coordinator-rules: CLAUDE_CODE_TERMINAL_MCP_TOOLS is unset, so whether this session is the project coordinator " +
      "could not be told; no coordinator rules were loaded."
    );
  }
  if (!role) return "";
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

function main() {
  try {
    fs.readFileSync(0); // drain the hook payload; nothing in it is needed
  } catch {}
  let context = "";
  try {
    context = build();
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
