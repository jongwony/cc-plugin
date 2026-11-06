# Read contract

A contract contains `application` (explicit bundle ID), `max_depth` (1–50,
optional; default20), a nonempty `filter` of exact AX string attributes, and
1–20 `targets`. Each target has a distinct non-sensitive `key`, nonempty `match`,
`attributes`, and optional `expected` strings. Unknown contract fields reject.

Each `match` attribute accepts exactly one `equals` or `prefix` predicate.
Matching is case-sensitive, with no whitespace/Unicode normalization. Every
predicate must be evaluable on a candidate unless another predicate definitively
excludes it. Missing/ill-typed values otherwise produce `indeterminate`.
`expected` is an independent exact-value oracle, not another selector: using the
expected value as the only selector would turn a wrong value into a missing row.

Synthetic example (replace bindings with current authorized app evidence):

```json
{
  "application": "local.axbenchmark.fixture",
  "max_depth": 20,
  "filter": {"AXIdentifier": "bench.row.alpha", "AXRole": "AXStaticText"},
  "targets": [{
    "key": "alpha",
    "match": {"AXIdentifier": {"equals": "bench.row.alpha"}},
    "attributes": ["AXValue"],
    "expected": {"AXValue": "Alpha | generation=1 | value=101"}
  }]
}
```

The helper requests the union of filter, predicate and value attributes. It
rejects source errors, process timeout, diagnostic output, unexpected collection
shape, count mismatches, unverifiable filters, missing/duplicate/overlapping
matches, missing required values and expected-value mismatches.

`--axorc /trusted/path/axorc` selects an already installed executable;
`--timeout` bounds the process (default20, maximum60 seconds). The command is
fixed to `raw --debug --json` with `collectAll`; the contract cannot provide an
action command. This is a workflow adapter, not an OS security boundary: callers
still have their own tool permissions and responsibility for authorized scope.

Output never prints unfiltered raw trees, selector values, source error messages
or diagnostic logs, which can contain private UI data.
