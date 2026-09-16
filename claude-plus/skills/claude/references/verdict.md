# What the wrapper's exit status covers

Read this when a run's outcome is not the ordinary pass or fail — the wrapper
refused a run that looks fine, `final.md` is missing, `run.json` names a reason
you do not recognise, or you are deciding whether to trust a result without
re-running it.

For the ordinary case the exit status is the whole answer, and SKILL.md says so.

## The four conditions

`claude-run.sh` exits 0 only when all four hold:

1. the `claude` process exited 0,
2. the stream carried a result event,
3. that event's subtype is `success` and its `is_error` is not set, and
4. every non-empty line of the stream parsed as JSON.

Anything else exits nonzero. A nonzero CLI status propagates as itself; every
other refusal exits 1. `run.json`'s `verdict_reasons` names which condition
failed, in the same words the `RESULT:` line prints.

## Why each one is there

**The process status is not sufficient on its own.** Observed with an invalid
model: the CLI exits 0 and the result event's subtype is still `"success"`,
while `is_error` is true. Condition 3 is what catches that, and it is the
incident the whole gate was built around.

**An unknown subtype fails closed.** Condition 3 requires `success` rather than
rejecting a list of known error subtypes. A subtype this version has never seen
is not evidence of success, so it is refused rather than assumed — which means a
future CLI that renames the success subtype will fail loudly here instead of
passing quietly.

**A line that does not parse stops the read.** Condition 4 exists because the
events after a corrupt line are unknown. In the case that produced it, a
successful result was followed by a truncated error result: skipping the bad
line left the earlier success standing and the run reported success. A truncation
one field later — `{"type":"result","subtype":"success","is_er` — is the same
problem with the verdict inverted.

**Validation that cannot finish is not a pass.** The verdict comes from
`scripts/claude-run-extract.py`'s exit status, and the wrapper passes the run
only on 0. A broken interpreter, a missing extractor, or an unhandled error
inside it all reach the caller as a failed run with "could not validate",
never as success by default.

## Why this needs a JSON parser

A shell formulation handles more of this than it looks. Taking the last
`"type":"result"` line and matching `is_error` / `subtype` correctly rejects an
unknown subtype, an `is_error: false` error result, and a stream truncated
before the subtype — and it cannot be fooled by answer text, because JSON always
escapes quotes inside strings, so a `"key":value` pair cannot be forged from
content.

Three things it cannot do:

- **Decode the answer.** `result` is a JSON string. Extracted with `sed` it
  arrives as one line with literal `\n` and `\"`; the answer is the deliverable
  of a consult, so this alone settles it.
- **Establish that the stream parsed end to end.** Condition 4 is not a
  text-matching proposition. A stream cut after the success subtype reads as a
  pass to any pattern match.
- **Survive a serialization change.** One space after a colon
  (`"type": "result"`) and the pattern stops matching, which reports *every*
  run as having no result — successes included. The current CLI emits compact
  JSON; that is an observation about this version, not a guarantee.

`jq` would cover the first and third but is not present by default on macOS,
where `python3` ships with the command line tools.

## Reading the artifacts

- `run.json` — `verdict`, `verdict_reasons`, `answer_present`,
  `malformed_lines`, the session ids, and a `files` map whose entries are null
  when the file was not written.
- `final.md` — the decoded answer. **Absent, not empty**, when the result
  carried no answer text; `-o` warns instead of copying in that case.
- `result.json` — the raw result event, when there was one.
- `events.jsonl`, `stderr.log`, `exit_status` — always written, and kept for
  diagnosis after a refusal.
