# Validation and provenance

## What the checks establish

Run `python3 -m unittest discover -s axorcist/tests -v` and
`python3 axorcist/tests/check_package.py` from the repository root. The offline
suite exercises duplicated identical values, absent targets, wrong/empty values,
unknown attributes, overlapping selectors, malformed/partial/error output,
privacy of default output, and subprocess timeout. The package check confirms
marketplace delivery, reference resolution and opt-in installation.

A contract's required number is one per target. Distinguish a returned duplicate,
zero returned matches, unavailable predicate information and exact-value mismatch.
The result never certifies service freshness or unseen parts of the AX tree.
`expected` values must come from independent task evidence; fixture source is an
oracle for intended synthetic UI, not for a real service.

## Why the adapter has these boundaries

A 2026-11-06 TerminalMac guest comparison used agent-desktop 1.2.0 and AXorcist
0.2.3 on two synthetic static text rows. First-match attribute reads lost the
multiplicity of identical rows; a missing target returned a batch error.
Role+identifier predicates resolved wrapper/text ambiguity under nesting. This
motivates enumerated counts, exact-value checks separate from selection, and
role validation. The comparison was a small unlocked, display-on, foreground
fixture experiment; it established no Find My, screen-off, authentication-lock,
stale-ref, service-freshness or real messaging result. Its timings are not this
adapter's performance and are not a product SLA.

The mechanical checks belong in `scripts/ax_read.py`; domain meaning belongs in
`domains.md`; the workflow's success semantics belong in `SKILL.md`. Existing
Kakao and Find My safeguards retain their own owners. No shared-VM ownership or
permission/lock management is introduced by this plugin.

## Upstream contract

Inspected AXorcist source commit: `83dcaaf8a01ffb64e8266a7041a6829b99d581b8`.
This is provenance, not a claim that every installed build equals that commit.

- [Collection handler](https://github.com/openclaw/AXorcist/blob/83dcaaf8a01ffb64e8266a7041a6829b99d581b8/Sources/AXorcist/Core/AXorcist.swift):
  traversal starts at the app, filters affect inclusion, and timeout logs a
  warning while returning a success payload with collected elements/count.
- [Traversal](https://github.com/openclaw/AXorcist/blob/83dcaaf8a01ffb64e8266a7041a6829b99d581b8/Sources/AXorcist/Search/AXTreeTraversal.swift):
  depth and timeout bound what is visited.
- [CLI response](https://github.com/openclaw/AXorcist/blob/83dcaaf8a01ffb64e8266a7041a6829b99d581b8/Sources/axorc/CommandResponseHelpers.swift):
  diagnostics may be included as `debug_logs`. Missing warnings do not provide a
  full-tree completion certificate.

All reads still depend on the actual user's scope, reachable session, installed
CLI behavior, and macOS Accessibility permissions. The script's allowlisted read
command is not a sandbox for other tools the caller can invoke.

## Adapter smoke observation — 2026-11-06

At 05:11:05–05:11:11 UTC the adapter ran against the pre-existing synthetic
AppKit fixture in TerminalMac (4 vCPU/4 GiB, macOS27.2 arm64, AXorcist0.2.3).
Two existing guest Claude sessions were idle. Every sample's before/after probe
reported unlocked, display-on, on-console, fixture foreground. Six cases passed:
normal, nesting and generation update returned `observed`; duplicate, missing
and intentionally wrong expected value returned distinct rejected outcomes.
The fixture was then closed; VM lifecycle and user apps were unchanged.

The original detailed fixture used distinct identifiers for Alpha/Beta. Each
smoke contract filtered one identifier plus AXStaticText, checking its expected
value independently. This checks single-target collection, not multi-window
scope or the unknown-candidate case (covered offline). One invocation per case
cannot establish a latency distribution. No Find My/Kakao content was accessed.
The synthetic expected values describe intended fixture UI, not real service
truth. No full-disk personal files were used.

The repository records the adapter hash, fixture-source hash, result fields and
session conditions in `axorcist/tests/evidence/guest-smoke-20261106.json`.
This is an observation record from that fixture, not a portable live-test harness
or a guarantee for later source revisions. Offline tests are reproducible from
this repository. A separate context also dry-ran the skill on paused Find My,
Kakao fallback and partially missing-target requests; it preserved those scope
boundaries. The discovered target-list omission risk led to explicit inclusion
of every user-requested target in the contract.

A final code review found that opt-in value output could serialize a malformed
nested attribute. The adapter now emits only strings (invalid types become null),
with an offline regression test. The six live cases were repeated on this final
adapter hash. The offline suite has 23 tests.
