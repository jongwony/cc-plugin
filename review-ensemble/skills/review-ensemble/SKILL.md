---
name: review-ensemble
description: |
  This skill should be used when the user asks to "ensemble review", "multi-model review", "cross-model review", "review-ensemble", or wants multiple independent reviewers to analyze changes in parallel. Orchestrates /frame (Claude multi-perspective review with agent-aware mapping) + Codex (cross-model independent review), then aggregates into a unified verdict.
skills:
  - prothesis:frame
---

# Review Ensemble

Orchestrate cross-model code review by composing /frame (Claude multi-perspective) with Codex (independent model), then aggregate findings at the cross-model boundary.

**Architecture**:
```
review-ensemble
├── /frame Mode 2 (Claude: perspective selection + AgentMap? + investigation + Lens L)
├── Codex CLI (cross-model: independent review, parallel)
└── Cross-model aggregation (Lens L + Codex findings → unified verdict)
```

**Principle**: /frame owns Claude-side orchestration (perspective selection, agent mapping, investigation, synthesis). review-ensemble adds the cross-model dimension — independent findings from a different model family provide the highest-confidence signal when they converge with /frame's Lens.

## Phase 1: Scope Detection

1. If PR number provided as argument: `gh pr view {NUMBER} --json number,title,headRefName,changedFiles`
2. If no argument: `gh pr view --json number,title,headRefName,changedFiles 2>/dev/null`
3. PR exists: scope = PR diff (`gh pr diff {NUMBER}`)
4. No PR: scope = working tree (`git diff HEAD`)
5. No changes: ask the user what to review

Record scope type, PR number, changed files list.

## Phase 2: Parallel Launch

Launch Codex in background FIRST, then invoke /frame (interactive). This maximizes parallelism — Codex runs independently while /frame engages the user for perspective selection.

### Step 1: Launch Codex Reviewers (background)

Check `which codex 2>/dev/null`. If available, launch review in background.

Write review prompt to `/tmp/ensemble_codex_review_<suffix>.txt`:

```
Review the code changes in this repository for correctness, security, and edge cases.

Changed files:
{file_list}

Focus: logic errors, security vulnerabilities, missing error handling, edge cases, API contract violations.

Report each finding as:
- [{severity}] {file}:{line_range} — {description}

Severity: critical | high | medium | low | suggestion
Report only high-confidence findings.
End with: VERDICT: approve | needs-attention
```

Execute:
```bash
codex exec --skip-git-repo-check -m gpt-5.4 --config model_reasoning_effort="high" --sandbox read-only < /tmp/ensemble_codex_review_<suffix>.txt
```

Run via `Bash(run_in_background: true)`.

**Optional: codex-adversarial** — If the user requests adversarial review or the change is large/architectural, also launch an adversarial prompt in background:

```
You are a skeptical reviewer. Challenge the implementation approach and design choices.

Changed files:
{file_list}

Question: Is this the right approach? What assumptions does it depend on? Where could this fail under real-world conditions?

Report each finding as:
- [{severity}] {file}:{line_range} — {description}

End with: VERDICT: approve | needs-attention
```

### Step 2: Invoke /frame Mode 2 (foreground, interactive)

```
Skill("prothesis:frame", args: "Assemble a code review team for these changes. Scope: {scope_description}. Changed files: {file_list}")
```

/frame will:
1. **Phase 0**: Mission Brief (elidable — explicit argument provided)
2. **Phase 1**: Context gathering (codebase exploration)
3. **Phase 2**: Perspective selection (always_gated — user selects review perspectives)
4. **Phase 3**: AgentMap? → map perspectives to available agents → team investigation
5. **Phase 4**: Cross-dialogue + synthesis → **Lens L** (convergence, divergence, assessment)

The Lens L output contains:
- **Convergence**: Where Claude perspectives agree — robust findings
- **Divergence**: Where perspectives disagree — different values or evidence
- **Assessment**: Integrated analysis with attribution to contributing perspectives

## Phase 3: Collection

After /frame completes (Lens L in context):
1. Collect Codex background results via `BashOutput`
2. Parse Codex findings: `[severity] file:line — description` format + VERDICT
3. Record both Lens L and Codex findings for aggregation

## Phase 4: Cross-Model Aggregation

Combine /frame's Lens L (Claude multi-perspective synthesis) with Codex findings (independent model review).

### Cross-Model Agreements

Identify findings that appear in BOTH /frame's Lens L AND Codex output:
- Same file + overlapping concern = cross-model agreement
- Use semantic judgment — different wording about the same logical concern counts
- Cross-model agreements have the **highest confidence** — two independent model families converged on the same issue

### Unified Verdict

- ANY `critical` finding from either source → `needs-attention`
- Cross-model agreement on `high` severity → `needs-attention`
- Both /frame assessment AND Codex verdict say `needs-attention` → `needs-attention`
- Otherwise → `approve`

## Phase 5: Output

```markdown
## Review Ensemble Results

### Verdict: {approve | needs-attention}
Scope: {PR #N | working tree} | Changed files: {N}

### Cross-Model Agreements ({N})
{Issues found by BOTH /frame (Claude) and Codex — highest confidence}

### /frame Lens (Claude Multi-Perspective)
**Convergence**: {robust findings across Claude perspectives}
**Divergence**: {where perspectives disagree}
**Assessment**: {integrated analysis}
Perspectives: {list of perspectives used}

### Codex Review
{Codex findings list}
Verdict: {codex verdict}

### Summary
- /frame: {N} perspectives, Lens with {convergence/divergence summary}
- Codex: {N} findings ({severity breakdown})
- Cross-model agreements: {N}
```

## Error Handling

| Condition | Action |
|-----------|--------|
| /frame timeout or failure | Present partial results from Codex only |
| Codex CLI not found | Run /frame only, note single-model limitation in output |
| Codex timeout (>300s) | Present /frame Lens only, note Codex timeout |
| No changes found | Report and stop at Phase 1 |
| Both sources approve, no findings | "All reviewers approve — no issues found" |

## Rules

- /frame owns Claude-side review — do not duplicate with separate Claude Agent spawns
- Codex runs independently — it does not see /frame's output and vice versa
- Cross-model agreement is the primary confidence signal
- Launch Codex BEFORE /frame to maximize parallelism
- Generate a unique suffix for each /tmp prompt file to prevent collisions
- If Codex is unavailable, /frame alone still provides multi-perspective value via Lens L
