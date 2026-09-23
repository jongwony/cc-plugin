# Writing a prompt whose result you collect

Read this when the work is *not* a Stint — when this session must receive the
result, check it, and use it. That work is a prompt you write and run yourself,
against whatever CLI is at hand, and this file is what such a prompt owes.

A Stint's brief is a different document with a different contract; SKILL.md
carries it. What the two share is that neither has an approval step: a headless
run does what the prompt says and nothing checks it mid-flight.

## What the prompt carries

- **State the role the run acts in.** With no approval step, the declared role is
  the only thing holding the run to its lane. A reviewing role is what keeps a
  consult from editing.
- **Carry what the run cannot re-derive; point at everything else.** Test each
  item: can the run reach this with its own tools from the directory it runs in?
  Yes → pass a path, a pattern, or a command. No → copy it in.
- **Name the goal, the completion condition, the output destination, the
  permitted actions, and the decisions the user has kept.** Point at governing
  instructions rather than restating them.
- **For a decision it cannot make**, name where to park it, or a default those
  same sources authorize.
- **Carry the decision itself when the run is a consult**: what is being chosen,
  the approach so far and where it is still uncommitted, and what would change
  the answer.
- Verify a needed skill, plugin or MCP server exists in the target environment
  and name it in the prompt.
- All prompts sent to `claude` are written in English.

## Which model answers

Keep the answering model different from the one holding the question. A consult's
whole value is a judgment formed somewhere else; a second opinion from the model
that already has the opinion is not one.

## What establishes that the run succeeded

Four conditions, and a run passes only on all four:

1. the process exited 0,
2. the stream carried a result event,
3. that event's subtype is `success` and its `is_error` is not set, and
4. every non-empty line of the stream parsed.

Each exists because a real run defeated the check before it. An invalid model
exits 0 with subtype `success` and `is_error` true — condition 3 is the incident
the whole gate was built around. An unknown subtype fails closed rather than
being assumed good, so a CLI that renames the success subtype breaks loudly.
A line that does not parse stops the read, because what follows a corrupt line is
unknown: one observed stream put a truncated error result after a successful one,
and skipping the bad line left the success standing.

## Collecting it

- **A created session and a written output file are not completion.** Read the
  answer, then inspect the artifact it claims and run the checks its use calls
  for.
- **Keep three things distinct** in what you report: what the run claimed, what
  this session verified, and what neither covered.
- **Take the reviewer's own words** from a consult. A summary discards what
  mattered.
- **Before any mutating retry, confirm the prior process ended.**
- Give the session id and say whether the conversation was new or continued.

## Reference guide

- Read Anthropic's prompting best practices —
  https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
  — before writing a prompt file, and again whenever a run stopped early, asked a
  question instead of deciding, or returned a claim its artifacts do not support.
- Navigate that page by heading: `## Model-specific guidance` for per-model
  differences, `## General principles` for clarity, examples and XML structuring,
  `## Output and formatting`, `## Tool use`, `## Thinking and reasoning` for
  effort and extended thinking, `## Agentic systems` for unattended runs, stop
  conditions and subagents, `## Capability-specific tips`,
  `## Migration considerations`.
- For the technique index and interactive tutorials, read the prompt engineering
  overview —
  https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview
- For the harness a prompt runs against rather than the model it prompts, read
  Claude Code's programmatic-run page — https://code.claude.com/docs/en/headless —
  and its CLI reference — https://code.claude.com/docs/en/cli-reference. Verify a
  flag against the installed CLI's `--help` before relying on it.
