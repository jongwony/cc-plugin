# Codex CLI Adapter

Use after `source=codex` is designated. Start a fresh codex session in the reviewed
checkout through the codex-plus plugin's `codex` skill and its wrapper, `codex-run.sh`,
following that skill's delegation rules; check `codex-run.sh -h` for the options it takes.
Unless the user specifies otherwise, retain the review recipe's `gpt-6-astra` model
and select effort by the diff: `high` for small mechanical work, `xhigh` for substantive
work, `max` for the most demanding reviews. Record the actual setting. A child using
the driving model remains a separate context, not a different-model comparison.

## Request

Write the prompt to a unique temporary directory (`mktemp -d`). Include:

- PR pointer: `git diff {base_sha}...{head_sha}`, where the captured base is the
  resolved diff cut and head is the current repair landing.
- Working-tree pointer: `git diff {captured_base}` plus each untracked file from
  `git status --porcelain --untracked-files=all`; ask the reviewer to read those files.
- Changed-file list and the current design-intent bundle from Phase 0: repository
  pointers, constituted decisions and their basis, declared authority order or its
  absence, and mission pointer or the recorded absence of a declared goal.
- The Source Interface output using findings and the labels
  `VERDICT: approve | needs-attention`, `EXERCISED:`, and `DIRECTION:`.
  Convey the mission-based severity calibration.

## Execution and collection

Run through the host's supervised/background execution facility and wait for its
completion signal. This command is the ordinary prompt-based route:

```bash
codex-run.sh -s read-only -C "$review_repo" -m "$review_model" -r "$review_effort" \
  -o "$review_dir/review.txt" "$review_dir/prompt.txt" \
  > "$review_dir/stdout.txt" 2> "$review_dir/stderr.txt"
review_status=$?
printf '%s\n' "$review_status" > "$review_dir/status.txt"
```

Set `review_model` and `review_effort` as above before launch. If the installed
CLI/model does not support that selection, report the limitation rather than
silently substituting. Keep the captured revisions locally available.
A child unable to read a revision
or the required files has not completed the requested review.

The review is the session's final message, which the wrapper writes to `review.txt`;
the wrapper propagates codex's exit status. Read the child exit code from `status.txt`:
a nonzero exit or a missing or empty `review.txt` is not a successful review. Read the
review verbatim as an LLM, checking that it actually contains a review verdict on the
requested surface. Read **all** stderr on every outcome, including success; state when
it was empty. Where the outcome is unclear, the session's rollout file — located by the
`session id: <uuid>` line on stderr, as codex-plus's `codex-session` skill does — holds
its full event record. Capture the results before removing the temporary directory;
the rollout file stays in codex's own session store, which is the user's to remove. A
terminal failure follows Phase 1's no-review path.

When the user requests a curated review skill, read
[Codex review options](codex-review-options.md). It changes the child review recipe,
not the host/source matrix or the loop's disposition authority.
