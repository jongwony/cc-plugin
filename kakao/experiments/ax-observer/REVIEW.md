# Independent review record

2026-11-05: Claude Code 2.1.318 (Opus 5.5, existing VM configuration) reviewed
commit 4bb0ab7 in a fresh clone at /tmp/kakao-ax-review-288. The operator used
computer use in the user-provided TerminalMac VM to start Claude and supply the
review scope. This is an operator transcription of the visible review, not a
cryptographically authenticated reviewer attestation.

Claude reported both offline checks exited 0: all three probes compiled without
execution, archive hashes/counts matched (33,110 / 84 / 0 callbacks), and the
production helper unit/compile/CLI/source checks passed. No live probe was run.

## Findings and disposition

1. Medium: committed hashes alone do not prove byte-for-byte provenance of the
   original temporary sources; JSONL does not record process exit status.
   Clarified archive integrity versus operator-observed provenance and exit status.
2. Low/medium: the later cross-check retains anonymous real-chat time labels and
   unread counts; opening could transmit read receipts. Clarified that this was a
   separately authorized UI inspection, outside the observer no-opening scope.
3. Low: Python 3 and prerequisite installation directions were missing. Added them.
4. Low: check.sh did not compare start/ready lifecycle data or registration totals
   to the summary. Added lifecycle equality, registration totals, and table child
   count checks. README numbers were manually verified by the reviewer; prose
   remains a human interpretation rather than a machine-checked assertion.
5. Low: the path notation could be read as child roles. Defined parent-role plus
   child-index notation explicitly.
6. Packaging: colocating experiments ships roughly 340 KB of evidence with Kakao.
   Kept the requested Kakao location, documented the tradeoff and added a link
   from the Kakao README. Production code does not load this archive.
7. Conditional branch naming: no external issue/chart was supplied for this work,
   so the repository conditional issue-id convention was not applicable.

## Future production requirements, not changes to historical probes

The reviewer highlighted root-only AX timeout configuration, missing watchdog and
signal/rebind/restart handling, coarse absolute timestamps, callback amplification,
controlled delivery testing, and explicit read-receipt scope. Preserve the probes
as measured; a production implementation should address these independently.
The elapsed_s field has fractional seconds, but uses wall-clock Date rather than
a monotonic clock; latency experiments should use a monotonic clock and adequately
precise correlated wall timestamps.

Message detection, no-loss delivery, ad-image attribution, and battery savings
remain unproven. Review approval does not establish any of these runtime claims.
