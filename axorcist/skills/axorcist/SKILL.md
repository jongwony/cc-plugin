---
name: axorcist
description: >
  Read macOS app values through AXorcist using domain scope and shared validation
  of returned matches, required attributes and expected values. Use for native
  Accessibility queries, including Find My device observations, when a generic
  AX engine can reach the data. Route KakaoTalk work to the existing kakao helper.
---

# AXorcist reads

Use the generic engine for observation; put the app's meaning and target rules
in its domain instructions. The script supplies deterministic checks, not an
application driver or authority to operate the desktop.

## Prerequisites

- macOS, Python 3.9+ (`brew install python`), and AXorcist (`brew install
  openclaw/tap/axorc`). Inspect the installed `axorc --version` and `axorc raw
  --help`; the tested response contract is **0.2.3**. Install dependencies only
  within the user's authorized scope; the plugin does not install them.
- Accessibility granted to the actual CLI launcher. Check `axorc permissions
  --json`. Permission/authentication prompts belong to the user. AX text reads
  do not require Screen Recording; a screenshot path has its own permissions.
- Establish the actual machine, session and named app before reading. Check
  current use by other sessions using available read-only status. Follow the
  environment's access/lock policy and stop dependent work on an unknown or
  locked session. A dark display, host lock, guest lock, sleep and paused VM are
  distinct states. A reachable CLI does not establish an unlocked GUI.

## Choose the domain and scope

Read [domains.md](references/domains.md) for Find My or KakaoTalk **before**
choosing a query. For other apps, derive the bundle ID, relevant window/region,
role, target predicates and requested attributes from current authorized UI
evidence. Re-establish them after a structural or session change.

Include every user-requested target in the contract. Set the success contract
before the call: which returned candidate set is being
examined, the expected number of each target, the required attributes, and any
independent expected values. Use a prefix only when that prefix carries the
intended domain boundary.

`collectAll` starts at the **application** root. Its exact attribute filter
limits inclusion, not traversal or permissions. It cannot enforce a window/root
boundary in this adapter. Use it only when application-wide traversal is within
the requested read scope; otherwise report that this path cannot honor the scope.
Request only necessary attributes and keep the candidate filter narrow enough
that target predicates can be evaluated on every included element.

## Read and validate

Create a temporary contract using [contract.md](references/contract.md). Run:

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/scripts/ax_read.py" --contract /path/to/contract.json
```

The adapter runs one read-only `collectAll` call, captures its exit status and
diagnostics, and validates its response. It prints metadata by default. Add
`--include-values` only when the task needs the requested target strings in the
conversation; that output may be private. Keep contract files with personal
selectors out of version control and remove task-temporary files after use.

Read the fields separately:

- `cardinality`: `single`, `duplicate`, `not_returned`, or `indeterminate` within
  the returned set. Missing predicate attributes leave candidates indeterminate.
  The same element matching two target definitions rejects the contract.
- `attributes`: all required values must be present as strings; empty strings
  remain empty. `accuracy` compares exact expected strings when supplied;
  `not_checked` means there was no independent expected-value check.
- `source_completeness`: `unproven` even on exit 0. AXorcist 0.2.3 can stop at
  depth/time/AX limitations without a complete-traversal certificate; a run with
  no diagnostics is not proof of completeness. A zero match is not proof of
  absence from the app.
- `service_freshness`: `not_checked`. `observed_at` is the observation time,
  not the time a service measured or updated its data.

Exit 0 / `observed` means the **returned rows** met the contract. It authorizes
neither a uniqueness claim over unseen UI nor an action on the selected object.
For such claims, obtain evidence of domain coverage through the applicable
specialized path or leave the claim unresolved. A first-match `getAttributes`
read cannot replace enumeration when cardinality matters.

Report scope, cardinality, attribute/expected-value checks, displayed freshness
and remaining coverage uncertainty. Recheck the session/app after a read;
invalidate an observation whose environment changed during it. Preserve raw
values in the answer only as the task requires. Synthetic fixture results stay
labelled synthetic; use [validation.md](references/validation.md) for the test
scope and implementation evidence. When AX lacks visual information, use an
already authorized screenshot path for that gap; access and service-freshness
failures retain their own stop conditions.
