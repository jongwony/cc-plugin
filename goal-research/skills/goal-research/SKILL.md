---
name: goal-research
description: Delegate a research question to a background Claude or Codex run that reaches external sources through Aitesis (/inquire) and Tavily, hold the run to its stated goal, and have a separate context check its citations against the run's own tool record. User-invoked via /goal-research.
skills:
  - aitesis:inquire
---

# Goal Research

Invoke directly with `/goal-research [runner] <research question>` when the person wants a question investigated against external sources — papers, official documentation, specifications, issue trackers, community discussion — by a background run, and wants back what the research reached without this session carrying the run's whole record.

`/inquire` carries the epistemic contract: its reading of each uncertainty, what collection reached, and what stays open for the person. This skill adds the delegation, a goal the run is held to, and a check whose ground is the run's own tool record, never its account of itself: a cited source absent from that record is unestablished, not thereby false.

## Dependency

- **Aitesis** (`/inquire`; `$inquire` on Codex) — the run drives it, so the
  epistemic-protocols `aitesis` plugin must be installed where the run executes.
- **codex-plus** (this marketplace) — the `codex` runner is launched, continued, and
  read through it; install it to designate `codex`.

## Runner

```
/goal-research [runner?] <research question>

runner : claude | codex        (claude when none is designated)
```

Read the designation from the request's words as well as its arguments. A leading `claude` or `codex` designates the runner only when it stands as a separate leading argument and what follows reads as the whole question; where the leading word could instead open the question — `Claude Shannon's 1948 paper…`, `codex CLI sandbox defaults` — ask once which it is.

## Phase 1: Intent Read-back

Before launching, show the person once, in their language:

- the research question, quoted from their own words in this session, which are what the run receives wherever the skill's arguments differ from them;
- how the question is read;
- what the research is for and what should come back, as far as the context says;
- the runner.

Then launch without waiting for an answer. A correction that arrives later stops any pass in flight. For a Claude subagent it then goes to the same run as a continuation (Phase 3), carrying the corrected intent and the goal condition restated to match it. For codex, a correction, or research resumed after the loop has stopped, starts a new thread whose brief carries the corrected intent and the rollout path of every earlier thread. Invoked with no question, ask once for it.

## Phase 2: Brief and Launch

**Goal condition**, which the run is held to and Phase 3 judges against, with `{use}` set to what the read-back stated, or to the question itself where the context states no use:

> `{inquire}`'s collection on the research question has reached what Tavily and the sources it leads to can reach, toward {use}. Each claim the result rests on cites a source the run's own Tavily search and extract calls retrieved, rests on session ground marked as such, or returns open with how far it reached and what would settle it; what only the person can settle is marked as theirs.

The brief, with `{inquire}` set to `/inquire` for `claude` and `$inquire` for `codex`, carries:

- the goal condition;
- the read-back as shown — the question quoted, how it is read, what it is for and what should come back;
- the session ground the run cannot reach on its own, and entry points — paths, ids, links — to what it can;
- that goal-research is already running in that session, delegated from here, so the run does not invoke it again;
- the workflow: invoke `{inquire}` — the skill call itself — on the question, collecting external sources through Tavily search and extract; cite each source by its URL; read `${CLAUDE_PLUGIN_ROOT}/skills/goal-research/references/sources-academic.md`, `${CLAUDE_PLUGIN_ROOT}/skills/goal-research/references/sources-community.md`, or both, as the question and its use call for;
- that the run researches and reports only, changing no repository or external system;
- that no person answers inside the run;
- what to return: a compact result in the person's language, shaped by the stated use — what stands and on which sources, the weakest link the conclusions lean on, and each item left open with its question, how far it reached, and whose it is. The full working record stays in the run's own transcript.

Launch in the background, as a run this session can continue and whose transcript a verifier can read: a Claude subagent by default, or a Codex session through codex-plus when `codex` is designated ([invocation](references/codex-plus.md)). For codex, the goal turn follows the launch as its own turn, once per thread, setting the goal condition through codex-plus's goal route ([invocation](references/codex-plus.md)). A Claude subagent gets no separate goal turn: it receives no slash command through a message, so every continuation to it restates the goal condition in its text. A runner that cannot be launched is reported with what is missing, and the skill stops there.

## Phase 3: Check and Continue

After each pass that returns a whole result, a verifier — a fresh context, neither this session nor the run — checks the result. This session gives it the whole compact result and the run's record, which carries the brief and every continuation:

- Claude subagent: `${CLAUDE_CONFIG_DIR:-~/.claude}/projects/<the session's project>/<session>/subagents/agent-<id>.jsonl`, and the transcripts of agents it spawned — each `agent-<id>.meta.json` names its parent as `parentAgentId`;
- codex: the rollout of every pass and of each earlier thread, and the rollouts of runs it spawned ([invocation](references/codex-plus.md)).

The verifier reads every claim of the result, cited or not, against the record, and hands back only a verdict and the discrepancies, each marked as its reading: a cited source no Tavily search or extract call retrieved — what a call retrieved is what its response returned, structured or as formatted text, and a completed extract can still name a URL it failed to fetch; a source that does not support the claim as the result words it — its scope, a qualification lost in compression; a claim with no citation; a failed call a claim leans on; a claim on session ground that the brief and continuations do not carry. What it cannot read it reports as unread rather than as absent. The same verifier may be continued for later passes.

Continue the same run while it is moving toward the goal condition, naming the discrepancies and what the condition still lacks, and asking for the compact result again, whole and updated. An acknowledgement, or a reply carrying only what changed, is not a result: the latest whole result stays current. Stop when the goal condition holds with no discrepancy standing, when the run has stopped moving toward the condition, or when execution fails — a pass that cannot start, a pass that ends without a return (a non-zero exit, an abort, a pass this session stopped as stalled), a run that reports, after trying, that it cannot reach Tavily (a tool missing from a listing establishes nothing), a record of the run that cannot be reached — and report a failure with its cause. A failure starts no new run and does not fall back to the other runner.

## Phase 4: Return

Give the person the run's result as it returned it, shaped by the brief (Phase 2) — its open items with how far each reached and whose it is, and its detections, not a summary of them; how it is shown is this session's judgment. A claim a discrepancy still stands on is shown beside that discrepancy rather than among what was established. With the result go one line carrying the verifier's verdict, the passes run, and why the loop stopped; and the paths of the run's and the verifier's transcripts. The full record is opened when the person asks for it.

What follows the return — integrating the result into the work at hand, follow-up questions, and what the person settles — happens in this session, outside the skill.
