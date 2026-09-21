#!/bin/bash
# Emit the Authorization header for Linear's remote MCP server from the
# session's LINEAR_API_KEY, or nothing when that variable is unset.
#
# Claude Code runs this as an MCP `headersHelper` and merges its stdout into the
# request headers, so the key is read at call time and never written to disk.
# That is what lets scripts/cloud-setup.sh register the server: a cloud setup
# script runs before the session exists and cannot see the environment's
# variables, while this helper runs inside the session and can.
#
# The empty object is the load-bearing branch, for two reasons. A static
# `headers` entry REPLACES OAuth — a rejected header fails the connection
# instead of falling back — so a helper that always emitted an Authorization
# line would break every environment without a key. Emitting `{}` leaves the
# OAuth path intact, and the key takes precedence exactly where the environment
# supplies one. And `{}` is not the same as printing nothing: empty stdout is
# read as a failed helper, which is logged as an error before the connection
# falls back. Keep both branches printing a JSON object.
#
# The contract this satisfies: exit zero, and print one flat JSON object of
# header name to STRING value on stdout, within ten seconds and under a
# megabyte. Those two limits are fixed in Claude Code and are not configurable.
# An array, a bare value, or a non-string member is rejected. stderr is ignored.
#
# One caveat worth knowing rather than guarding: where Claude Code runs with
# subprocess credential scrubbing on, a credential-shaped variable may be
# stripped before it reaches this helper, and the connection then falls back to
# OAuth. That is a degradation to the no-key branch, not a broken state.
#
# Usage (by hand):
#   LINEAR_API_KEY=lin_api_... bash scripts/linear-mcp-headers.sh

set -eo pipefail

exec python3 -c '
import json, os
key = os.environ.get("LINEAR_API_KEY", "").strip()
print(json.dumps({"Authorization": "Bearer " + key} if key else {}))
'
