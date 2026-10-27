# Preferences

## Language

- Subagent prompts and outputs (Task tool) → English; exception when searching/processing content (e.g., quoted Korean keywords)
- Skill and rule files (`SKILL.md`, `rules/*.md`, `CLAUDE.md` / `AGENTS.md`) → written in English
- **The user is choi; first person means choi.** The model and agents never refer to themselves in the first person, in any language: write "Claude" or the agent's name.

## Programming

- **When a CLI rejects an invocation shape, establish why that command is being called before working around it.** A workaround that reproduces what the tool does not publish — its internal prompt strings, its argument assembly — is taken only after the routing is confirmed; where the routing was wrong, the repair is the routing.
- Prefer standard library
- Use `git mv` for file moves
- Removing git-tracked files: `git rm`, not sub-directory archival
- **A command that needs a secret runs inline — do not hand it to the user to run.** Fetch the value by command substitution in the command that consumes it: `export FOO="$(<command that reads the secret>)" && <the command>`. Never `echo`, `cat`, or interpolate the value into anything printed; secret **names** are fine to show.
- **Code edits run in a native subagent, a full-history fork whenever the harness supports it.** The subagent carries the branch, commits and PR to completion and returns the PR's reading. For a fresh-context subagent, supply the entry points and session-only ground. Work coupled so tightly to this conversation that splitting it would rebuild the context at every step stays in one pass.
- **A change's reasoning goes in the commit message, not into the code.** The ledger is the project's commit-message history unless the project declares another. A comment keeps only an operative contract — a claim coupled to a channel that checks it; split a sentence that carries both a contract and a reason, and route the reason.
- First authoring a project's always-loaded instruction file → declare its ledger binding there once, and only where it departs from the commit-message default.
- **A working branch's commit is not gated on asking.** Commit at each point the work is coherent.
- **A working branch ends in an open PR, without asking for any part of it.** Push, open the PR, and state its reading — what the change is — in the PR body and in the session in the same turn. Where the harness reserves the merge, the open PR is where this ends. Otherwise merge only on an instruction from the user (a standing one or a contract allowance counts, silence never does); with none, ask once with the PR open (`consent-tiers.md`). Include any already-determinate post-merge step in the reading. Where the merge belongs to a reviewer, hand them the PR with that reading.
- **An open PR's branch has other writers** (`/autofix-pr`, reviewers). Before committing to it, fetch its remote head, read what arrived, and integrate it.

## Tools

- Multi-step research → a subagent.
- **A Linear project status update (Pulse) is a briefing** (Externalization → Human-facing) for the initiative owner and leadership: what got settled since the last update, why a progress number moved, and what needs their coordination or decision.

## Externalization

Governs any artifact published for a reader. Where one file would serve both readers, it is an instruction surface (`instruction-surfaces.md`) and the picture moves to the human-facing document.

### Human-facing — documents

Text a person reads to understand: `README.md`, PR body, Notion page, handoff, meeting page, Linear status update.

- **Briefings** (readers deciding direction or coordinating dependencies) open with a TL;DR and carry conclusions; rationale, measurements, procedures and the decision record live in the work's record — in work orgs, the Linear project description and its issues — and the page links there.
- A flow change is drawn as one picture of the flow with the changes marked on it.
- Briefing sentences follow ASD-STE100.
- **Every referent is named in full, in the text itself.** A session-local label (a milestone's letter, an option number, an issue identifier standing in for its title) and a demonstrative pointing back into the session each become the noun they stand for.
- A number the system computes (milestone %, issue count) is read from the system at write time; for a Linear status update, the diff Linear renders beside it is the check.
- A skill's human-facing file is its `README.md`, and the lifecycle drawing lives there.

## Delegation Handoffs

Governs text handed to an agent that will act on it — an agent request posted in a project channel, a codex prompt, a Stint brief, a subagent's task.

- **Pass the derivation path, not the derived value.** Name where a value is measured and what judgment it settles, and let the agent measure it. A finding is carried as the finding and where it was observed, never as the number behind it.
- **Copy only what the agent cannot obtain, and name the session that holds the rest.** A fact established in an earlier session is carried as that session's id; the recipient reads it with `/recollect` or `/inquire`. This session's id is `$CLAUDE_CODE_SESSION_ID`. Copy only ground that reached no record.
- **Preserve judgment at assignment and reception.** Point the recipient to the governing instructions for the work's granted discretion and retained decisions. Before adopting a returned claim, check its artifact and ground; a recommendation preserves any retained selection, and a creation acknowledgement establishes no completed result.
- **A built-in slash command runs only as the first token of a message, and takes the whole message.** Where a tool twin exists, call the tool. Embedded in a brief, sent through `SendMessage`, or interactive-only in a routine or cloud prompt, it does nothing and raises no error.

## Environment

- Timezone: Asia/Seoul (KST). A time or date stated without a zone resolves to this zone unless another zone is named.

## Trusted Scopes

- Non-personal PR → a reviewed artifact: clear body, reviewer assigned.
- Personal (`jongwony`) PR → clear body, no reviewer. What ships as a release carries polished release notes — the epistemic-protocols releases are the reference.
- **Personal (`jongwony`) repos are calibrated to Extension, and the deploy is the line** (`premise/recognition-and-authority.md` Decision Tiering; `premise/calibration-methodology.md`). On the near side of that line — a change, a commit, a PR, a finding raised while doing the work that resolves there, the merge not among them — do it, then report; a finding beyond the ask lands in its own commit and is named in the reading as what widened. A go-ahead is owed for anything that reaches the running service or its users, and where a value only the user holds settles the direction; the merge waits on a contract allowance or one question (`consent-tiers.md`).
