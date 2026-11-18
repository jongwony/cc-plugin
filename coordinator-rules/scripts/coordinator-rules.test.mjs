// Run: node --test coordinator-rules/scripts/coordinator-rules.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { detectRole, roleCore } from "./session-rules.mjs";
import { slashCommands, build as briefLine } from "./thread-brief.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const COORD = "mcp__hearthbot__post_message,mcp__hearthbot__start_thread,mcp__hearthbot__no_reply_needed";
const THREAD = "mcp__hearthbot__post_message,mcp__hearthbot__message_coordinator,mcp__hearthbot__message_thread";

function run(part, env, script = "session-rules.mjs", stdin = "{}") {
  const config = fs.mkdtempSync(path.join(os.tmpdir(), "cr-"));
  const clean = { ...process.env };
  delete clean.CLAUDE_CODE_TERMINAL_MCP_TOOLS;
  delete clean.CLAUDE_CODE_ENTRYPOINT;
  const r = spawnSync("node", [path.join(here, script), part].filter(Boolean), {
    input: stdin,
    env: { ...clean, CLAUDE_CONFIG_DIR: config, CLAUDE_PLUGIN_ROOT: root, ...env },
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

test("coordinator: one part, under the cap, every indexed path resolves", () => {
  const env = { CLAUDE_CODE_TERMINAL_MCP_TOOLS: COORD };
  const first = run("1/4", env);
  assert.match(first, /# Project coordinator/);
  assert.ok(first.length < 10000, `core is ${first.length} chars`);
  assert.ok(!first.includes("{{root}}"));
  assert.ok(first.includes(path.join(root, "references", "delegation.md")));
  for (const p of ["2/4", "3/4", "4/4"]) assert.equal(run(p, env), "");
  assert.deepEqual(roleCore("coordinator", root).missing, []);
});

test("thread without installed rules: the full manifest, as before", () => {
  const env = { CLAUDE_CODE_TERMINAL_MCP_TOOLS: THREAD };
  const parts = ["1/4", "2/4", "3/4", "4/4"].map((p) => run(p, env));
  const all = parts.join("\n");
  assert.match(all, /<rule file="rules\/preferences.md">/);
  assert.doesNotMatch(all, /cloud-rules\//);
  for (const p of parts) assert.ok(p.length < 10000);
});

test("unknown role in a projects session: one line, no rules", () => {
  const env = { CLAUDE_CODE_ENTRYPOINT: "remote_projects" };
  assert.match(run("1/4", env), /could not be told; no coordinator rules were loaded/);
  assert.equal(run("2/4", env), "");
});

test("start_thread brief: slash commands are named, the reminder always goes out", () => {
  assert.deepEqual(slashCommands({ brief: "Do it.\n/inquire first\n- /unfold decide\nsee a/b path" }), ["/inquire", "/unfold"]);
  assert.deepEqual(slashCommands({ brief: "paths like /mnt/project-files/x stay" }), []);
  const line = briefLine({ tool_input: { text: "/elicit then work" } }, root);
  assert.match(line, /\/elicit/);
  assert.match(line, /message_thread/);
  const out = run(null, {}, "thread-brief.mjs", JSON.stringify({ tool_input: { text: "plain brief" } }));
  assert.match(out, /The parts of a brief/);
});
