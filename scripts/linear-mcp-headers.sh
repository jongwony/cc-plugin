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
# The empty object is the load-bearing branch. A static `headers` entry
# REPLACES OAuth — a rejected header fails the connection instead of falling
# back — so a helper that always emitted an Authorization line would break every
# environment without a key. Emitting `{}` leaves the OAuth path intact, and the
# key takes precedence exactly where the environment supplies one.
#
# Usage (by hand):
#   LINEAR_API_KEY=lin_api_... bash scripts/linear-mcp-headers.sh

set -eo pipefail

exec python3 -c '
import json, os
key = os.environ.get("LINEAR_API_KEY", "").strip()
print(json.dumps({"Authorization": "Bearer " + key} if key else {}))
'
