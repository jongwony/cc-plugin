#!/usr/bin/env node
/**
 * PostToolUse hook on mcp__hearthbot__start_thread: one line back to the
 * coordinator about the brief it just sent.
 *
 * Only a project coordinator has start_thread, so the matcher alone scopes
 * this hook to the coordinator role. A hook's context reaches the model on the
 * request after the call, so the thread has already started when the line is
 * read; the line is therefore phrased as what to send next with
 * `message_thread`, never as a gate on the call.
 *
 * What the hook decides without reading intent: a line of the brief that
 * opens with a slash command (it does not run inside a brief). Everything else
 * — whether the brief carried pointers, the judgment boundary, the grants —
 * needs the brief read for meaning, so the line names the reference that
 * holds that checklist instead of judging it here.
 *
 * Every failure path is open: whatever goes wrong, the hook exits 0 silently.
 * Zero external dependencies: Node.js standard library only.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pluginRoot =
  process.env.CLAUDE_PLUGIN_ROOT ||
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function strings(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) strings(v, out);
  else if (value && typeof value === "object") for (const v of Object.values(value)) strings(v, out);
  return out;
}

/** Slash commands that open a line of the brief, in order of first appearance. */
export function slashCommands(input) {
  const found = [];
  for (const s of strings(input)) {
    for (const line of s.split("\n")) {
      const m = /^\s*(?:[-*]\s+)?(\/[a-z][\w:-]*)(?=\s|$)/.exec(line);
      if (m && !found.includes(m[1])) found.push(m[1]);
    }
  }
  return found;
}

export function build(payload, root = pluginRoot) {
  const ref = path.join(root, "references", "delegation.md");
  const lines = [];
  const slash = slashCommands(payload?.tool_input ?? {});
  if (slash.length) {
    lines.push(
      `coordinator-rules: the brief opens a line with ${slash.join(", ")}; a slash command does not run inside a brief. ` +
        "Send the thread the skill or tool to use instead, with message_thread.",
    );
  }
  lines.push(
    `coordinator-rules: if the brief left out a pointer, the judgment boundary, a grant choi gave, or where the result lands ` +
      `(${ref} §The parts of a brief), send it now with message_thread.`,
  );
  return lines.join("\n");
}

function main() {
  let payload = {};
  try {
    payload = JSON.parse(fs.readFileSync(0, "utf8") || "{}");
  } catch {}
  let context = "";
  try {
    context = build(payload);
  } catch {
    context = "";
  }
  if (!context) return;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: context },
    }) + "\n",
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
