# Validation and provenance

Run `python3 -m unittest discover -s axorcist/tests -v` and
`python3 axorcist/tests/check_package.py` from the repository root. The offline
suite exercises duplicated identical values, absent targets, wrong/empty values,
unknown attributes, overlapping selectors, malformed/partial/error output,
diagnostics classified by AXorcist's log level, deeply nested input, privacy of
default output, and subprocess timeout. The package check
confirms marketplace delivery, reference resolution and opt-in installation.
Neither runs a live AX read.

The adapter's response and diagnostic handling follows AXorcist source commit
`83dcaaf8a01ffb64e8266a7041a6829b99d581b8` (0.2.3); an installed build may differ.
A live smoke record from a synthetic guest fixture is kept in
`axorcist/tests/evidence/guest-smoke-20261106.json`, tied to the adapter hash it
records.
