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

Then launch without waiting for an answer. A correction that arrives later goes to the same run as a continuation (Phase 3), carrying the corrected intent and the goal condition restated to match it. Invoked with no question, ask once for it.

## Phase 2: Brief and Launch

**Goal condition**, which the run is held to and Phase 3 judges against, with `{use}` set to what the read-back stated:

> `{inquire}`'s collection on the research question has reached what Tavily and the sources it leads to can reach, toward {use}. Each claim the result rests on cites a source the run's own Tavily calls retrieved, or returns open with how far it reached and what would settle it; what only the person can settle is marked as theirs.

The brief, with `{inquire}` set to `/inquire` for `claude` and `$inquire` for `codex`, carries:

- the goal condition;
- the research question as the read-back quoted it, and the stated use;
- the session ground the run cannot reach on its own, and entry points — paths, ids, links — to what it can;
- that goal-research is already running in that session, delegated from here, so the run does not invoke it again;
- the workflow: invoke `{inquire}` — the skill call itself — on the question, collecting through Tavily search and extract; cite each source by its URL, and open the primary page a claim rests on; read `references/sources-academic.md`, `references/sources-community.md`, or both, as the question and its use call for;
- that no person answers inside the run, so what only the person can settle returns open as theirs;
- what to return: a compact result shaped by the stated use — what stands and on which sources, the weakest link the conclusions lean on, and each item left open with its question, how far it reached, and whose it is. The full working record stays in the run's own transcript.

Launch in the background, as a run this session can continue and whose transcript a verifier can read: a Claude subagent by default, or a Codex session through codex-plus when `codex` is designated ([invocation](references/codex-plus.md)). The goal turn follows the launch. For codex it is `/goal {goal condition}`, sent alone as its own turn, since the command reads everything after it as the objective. A Claude subagent receives no slash command through a message, so every continuation to it restates the goal condition in its text instead. A runner that cannot be launched is reported with what is missing, and the skill stops there.

## Phase 3: Check and Continue

After each pass whose substantive return changed, a verifier — a fresh context, neither this session nor the run — checks the return against the run's tool record. Give it the return it checks and the record's location:

- Claude subagent: `~/.claude/projects/<project>/<session>/subagents/agent-<id>.jsonl`, with the tool outputs persisted beside it;
- codex: the session's rollout file across every pass, and the rollout of any run it spawned ([invocation](references/codex-plus.md)).

The verifier reads each claim of the return against what the run's Tavily search and extract calls returned, and hands back only a verdict and the discrepancies, each marked as its reading: a cited source the record does not hold; a source retrieved that does not support the claim as the return words it, a qualification lost in compression included; a claim with no citation; a Tavily call attempted that did not succeed; a record it could not read, reported as unread rather than as absent. The same verifier may be continued for later passes.

Continue the same run while it is moving toward the goal condition, naming the discrepancies and what the condition still lacks. Stop when `{inquire}`'s collection has ended and no discrepancy stands, when the run has stopped moving toward the condition, or when execution fails — a pass that cannot start, a record that cannot be reached — and report a failure with its cause. A failure starts no new run and does not fall back to the other runner.

## Phase 4: Return

Give the person, in their language: the compact result as the stated use shapes it — what the research established and on which sources, the weakest link, and each item left open with its question, how far it reached, and whose it is; one line carrying the verifier's verdict; and the paths of the run's and the verifier's transcripts. The full record is opened when the person asks for it.

What follows the return — integrating the result into the work at hand, follow-up questions, settling what is the person's — is this session's, outside the skill.
