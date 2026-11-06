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
    lifecycle = [r for r in rows if r['kind'] in ('start', 'ready', 'finished')]
    assert lifecycle == item['lifecycle'], f'{mode}: lifecycle summary mismatch'
    ready = [r for r in rows if r['kind'] == 'ready']
    assert len(ready) == 1 and rows[-1]['kind'] == 'finished'
    assert rows[-1]['events'] == len(events)
    successful = sum(r.get('count', 1) for r in rows if r['kind'] == 'registration'
                     and (r.get('result') == 0 or
                          r.get('scope_role_notification_result', '').endswith('|0')))
    assert successful == ready[0]['registered'], f'{mode}: registration count mismatch'
    if mode == 'table':
        targets = [r for r in rows if r['kind'] == 'target']
        assert len(targets) == 1 and targets[0]['role'] == 'AXTable'
        assert targets[0]['initial_child_count'] == rows[-1]['final_child_count'] == 81
    print(f'verified: {mode}, {len(events)} callbacks')
PY
