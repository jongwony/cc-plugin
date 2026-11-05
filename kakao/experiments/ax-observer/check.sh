#!/usr/bin/env bash
# Compile historical probes; verify archived evidence. Never execute probes.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
out="$(mktemp -d "${TMPDIR:-/tmp}/kakao-observer-check.XXXXXX")"
trap 'rm -rf "$out"' EXIT
for mode in probe narrow table; do
  swiftc -module-cache-path "$out/module-cache" "$root/$mode.swift" -o "$out/$mode"
  echo "compiled: $mode (not executed)"
done
python3 - "$root" <<'PY'
import collections, gzip, hashlib, json, pathlib, sys
root = pathlib.Path(sys.argv[1])
for item in json.loads((root / 'evidence/summary.json').read_text()):
    mode = item['mode']
    assert hashlib.sha256((root / (mode + '.swift')).read_bytes()).hexdigest() == item['source_sha256']
    raw = gzip.decompress((root / 'evidence' / (mode + '.jsonl.gz')).read_bytes())
    assert hashlib.sha256(raw).hexdigest() == item['log_sha256']
    rows = [json.loads(line) for line in raw.splitlines()]
    events = [r for r in rows if r['kind'] == 'event']
    counts = collections.Counter((r['event'], r['role']) for r in events)
    assert counts == {(r['event'], r['role']): r['count'] for r in item['events']}
    assert rows[-1]['kind'] == 'finished' and rows[-1]['events'] == len(events)
    print(f'verified: {mode}, {len(events)} callbacks')
PY
