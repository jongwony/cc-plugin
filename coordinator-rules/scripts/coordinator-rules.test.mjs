// Run: node --test coordinator-rules/scripts/coordinator-rules.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { detectRole } from "./session-rules.mjs";
import { slashCommands, build as briefLine } from "./thread-brief.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const COORD = "mcp__hearthbot__post_message,mcp__hearthbot__start_thread,mcp__hearthbot__no_reply_needed";
const THREAD = "mcp__hearthbot__post_message,mcp__hearthbot__message_coordinator,mcp__hearthbot__message_thread";

function run(env, script = "session-rules.mjs", stdin = "{}", pluginRoot = root) {
  const clean = { ...process.env };
  delete clean.CLAUDE_CODE_TERMINAL_MCP_TOOLS;
  delete clean.CLAUDE_CODE_ENTRYPOINT;
  const r = spawnSync("node", [path.join(pluginRoot, "scripts", script)], {
    input: stdin,
    env: { ...clean, CLAUDE_PLUGIN_ROOT: pluginRoot, ...env },
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.additionalContext : "";
}

test("role: start_thread marks the coordinator, a thread has none", () => {
  assert.equal(detectRole({ CLAUDE_CODE_TERMINAL_MCP_TOOLS: COORD }), "coordinator");
  assert.equal(detectRole({ CLAUDE_CODE_TERMINAL_MCP_TOOLS: THREAD }), null);
  assert.equal(detectRole({ CLAUDE_CODE_ENTRYPOINT: "remote_projects" }), "unknown");
  assert.equal(detectRole({}), null);
});

test("coordinator: the core, well under the cap", () => {
  const out = run({ CLAUDE_CODE_TERMINAL_MCP_TOOLS: COORD });
  assert.match(out, /# Project coordinator/);
  assert.ok(out.length < 4000, `core is ${out.length} chars`);
});

test("thread or plain session: nothing", () => {
  assert.equal(run({ CLAUDE_CODE_TERMINAL_MCP_TOOLS: THREAD }), "");
  assert.equal(run({}), "");
});

test("unknown role in a projects session: one line, no rules", () => {
  assert.match(run({ CLAUDE_CODE_ENTRYPOINT: "remote_projects" }), /could not be told; no coordinator rules were loaded/);
});

test("a missing core is named in one line", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "crp-"));
  fs.cpSync(root, tmp, { recursive: true });
  fs.rmSync(path.join(tmp, "roles"), { recursive: true });
  assert.match(run({ CLAUDE_CODE_TERMINAL_MCP_TOOLS: COORD }, "session-rules.mjs", "{}", tmp), /roles\/coordinator\.md is missing/);
});

test("start_thread brief: a line only when a slash command opens a brief line", () => {
  assert.deepEqual(slashCommands({ brief: "Do it.\n/inquire first\n- /unfold decide\nsee a/b path" }), ["/inquire", "/unfold"]);
  assert.deepEqual(slashCommands({ brief: "paths like /mnt/project-files/x stay" }), []);
  assert.match(briefLine({ tool_input: { text: "/elicit then work" } }), /\/elicit.*message_thread/s);
  assert.equal(run({}, "thread-brief.mjs", JSON.stringify({ tool_input: { text: "plain brief" } })), "");
  assert.match(run({}, "thread-brief.mjs", JSON.stringify({ tool_input: { text: "/inquire first" } })), /\/inquire/);
});
