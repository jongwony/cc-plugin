// Run: node --test coordinator-rules/scripts/coordinator-rules.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { detectRole, roleCore } from "./session-rules.mjs";
import { sharedPaths } from "./sync-shared.mjs";
import { slashCommands, build as briefLine } from "./thread-brief.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const COORD = "mcp__hearthbot__post_message,mcp__hearthbot__start_thread,mcp__hearthbot__no_reply_needed";
const THREAD = "mcp__hearthbot__post_message,mcp__hearthbot__message_coordinator,mcp__hearthbot__message_thread";

function run(env, script = "session-rules.mjs", stdin = "{}", pluginRoot = root) {
  const config = fs.mkdtempSync(path.join(os.tmpdir(), "cr-"));
  const clean = { ...process.env };
  delete clean.CLAUDE_CODE_TERMINAL_MCP_TOOLS;
  delete clean.CLAUDE_CODE_ENTRYPOINT;
  const r = spawnSync("node", [path.join(pluginRoot, "scripts", script)], {
    input: stdin,
    env: { ...clean, CLAUDE_CONFIG_DIR: config, CLAUDE_PLUGIN_ROOT: pluginRoot, ...env },
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

test("coordinator: the core, under the cap, every indexed path resolves", () => {
  const out = run({ CLAUDE_CODE_TERMINAL_MCP_TOOLS: COORD });
  assert.match(out, /# Project coordinator/);
  assert.ok(out.length < 10000, `core is ${out.length} chars`);
  assert.ok(!out.includes("{{root}}"));
  assert.ok(out.includes(path.join(root, "references", "delegation.md")));
  assert.deepEqual(roleCore("coordinator", root).missing, []);
});

test("thread or plain session: nothing", () => {
  assert.equal(run({ CLAUDE_CODE_TERMINAL_MCP_TOOLS: THREAD }), "");
  assert.equal(run({}), "");
});

test("unknown role in a projects session: one line, no rules", () => {
  assert.match(run({ CLAUDE_CODE_ENTRYPOINT: "remote_projects" }), /could not be told; no coordinator rules were loaded/);
});

test("copies: exactly the rules/ files the core indexes", () => {
  const want = sharedPaths(root).sort();
  assert.ok(want.length > 0);
  assert.deepEqual(fs.readdirSync(path.join(root, "rules")).map((f) => `rules/${f}`).sort(), want);
});

test("a lost copy is named under the core", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "crp-"));
  fs.cpSync(root, tmp, { recursive: true });
  fs.rmSync(path.join(tmp, "rules"), { recursive: true });
  const out = run({ CLAUDE_CODE_TERMINAL_MCP_TOOLS: COORD }, "session-rules.mjs", "{}", tmp);
  assert.match(out, /# Project coordinator/);
  assert.match(out, /these indexed files are missing under .*rules\/consent-tiers\.md/);
});

test("start_thread brief: slash commands are named, the reminder always goes out", () => {
  assert.deepEqual(slashCommands({ brief: "Do it.\n/inquire first\n- /unfold decide\nsee a/b path" }), ["/inquire", "/unfold"]);
  assert.deepEqual(slashCommands({ brief: "paths like /mnt/project-files/x stay" }), []);
  const line = briefLine({ tool_input: { text: "/elicit then work" } }, root);
  assert.match(line, /\/elicit/);
  assert.match(line, /message_thread/);
  const out = run({}, "thread-brief.mjs", JSON.stringify({ tool_input: { text: "plain brief" } }));
  assert.match(out, /The parts of a brief/);
});
