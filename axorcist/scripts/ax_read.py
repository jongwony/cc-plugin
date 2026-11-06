#!/usr/bin/env python3
"""Read-only AXorcist collectAll adapter; validation concerns returned rows only."""
import argparse
import datetime
import json
import re
import subprocess
import sys
import time


class Invalid(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise Invalid(message)


def strings(value):
    return isinstance(value, list) and bool(value) and all(isinstance(x, str) and x.startswith('AX') for x in value)


def contract_check(c):
    require(isinstance(c, dict), 'contract must be an object')
    require(set(c) <= {'application', 'filter', 'max_depth', 'targets'}, 'unknown contract field')
    app = c.get('application')
    require(isinstance(app, str) and re.fullmatch(r'[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+', app), 'application must be an explicit bundle ID')
    require(app.lower() != 'com.kakao.kakaotalkmac', 'use the kakao plugin for KakaoTalk')
    depth = c.get('max_depth', 20)
    require(type(depth) is int and 1 <= depth <= 50, 'max_depth must be 1..50')
    filters = c.get('filter')
    require(isinstance(filters, dict) and filters and all(isinstance(k, str) and k.startswith('AX') and isinstance(v, str) and v for k, v in filters.items()), 'filter must contain exact AX string attributes')
    targets = c.get('targets')
    require(isinstance(targets, list) and 1 <= len(targets) <= 20, 'targets must contain 1..20 entries')
    keys = set()
    for t in targets:
        require(isinstance(t, dict) and set(t) <= {'key', 'match', 'attributes', 'expected'}, 'invalid target fields')
        key = t.get('key')
        require(isinstance(key, str) and re.fullmatch(r'[a-z0-9_-]{1,64}', key) and key not in keys, 'target keys must be distinct non-sensitive labels')
        keys.add(key)
        match = t.get('match')
        require(isinstance(match, dict) and match, 'target requires match predicates')
        for attr, predicate in match.items():
            require(isinstance(attr, str) and attr.startswith('AX') and isinstance(predicate, dict) and len(predicate) == 1, 'invalid match predicate')
            op, value = next(iter(predicate.items()))
            require(op in {'equals', 'prefix'} and isinstance(value, str) and bool(value), 'match requires nonempty equals/prefix string')
        require(strings(t.get('attributes')) and len(set(t['attributes'])) == len(t['attributes']), 'attributes must be distinct AX names')
        expected = t.get('expected', {})
        require(isinstance(expected, dict) and set(expected) <= set(t['attributes']) and all(isinstance(v, str) for v in expected.values()), 'expected must map requested attributes to exact strings')
    return c


def command(c):
    attributes = set(c['filter'])
    for t in c['targets']:
        attributes.update(t['match'])
        attributes.update(t['attributes'])
    return {'command': 'collectAll', 'command_id': 'validated-read', 'application': c['application'],
            'max_depth': c.get('max_depth', 20), 'filter_criteria': c['filter'], 'attributes': sorted(attributes)}


def unwrap(value):
    if isinstance(value, dict) and set(value) == {'any_value'}:
        return value['any_value']
    return value


def validate(c, response, exit_code=0, stderr='', include_values=False):
    contract_check(c)
    out = {'status': 'rejected', 'coverage': 'returned_elements_only',
           'source_completeness': 'unproven', 'service_freshness': 'not_checked', 'targets': []}
    if exit_code != 0 or not isinstance(response, dict) or response.get('status') != 'success' or response.get('error'):
        return dict(out, reason='source_error')
    # AXorcist can return success with a traversal-timeout diagnostic. Diagnostics
    # are never echoed: they may include unrelated UI text or private values.
    logs = response.get('debug_logs', [])
    if not isinstance(logs, list) or not all(isinstance(x, str) for x in logs):
        return dict(out, reason='invalid_diagnostics')
    benign_stderr = set(logs) | {'--- Debug Logs (axorc run end) ---', '--- End Debug Logs ---', ''}
    unknown_stderr = any(line.strip() not in benign_stderr and not re.fullmatch(
        r'AXORCMain\.run: AXorc version 0\.2\.3 build .*Detail level: normal\.', line.strip())
        for line in stderr.splitlines())
    if unknown_stderr or any(re.search(r'warning|error|timeout|timed out|aborting|truncat', x, re.I) for x in logs):
        return dict(out, source_completeness='incomplete_or_diagnostic', reason='source_diagnostic')
    data = response.get('data')
    if not isinstance(data, dict) or not isinstance(data.get('elements'), list) or type(data.get('count')) is not int or data['count'] != len(data['elements']):
        return dict(out, reason='invalid_collection')
    rows = []
    for e in data['elements']:
        if not isinstance(e, dict) or not isinstance(e.get('attributes'), dict):
            return dict(out, reason='invalid_element')
        a = {k: unwrap(v) for k, v in e['attributes'].items()}
        if any(a.get(k) != v for k, v in c['filter'].items()):
            return dict(out, reason='filter_unverified')
        rows.append(a)
    owner = {}
    for t in c['targets']:
        found, unknown = [], 0
        for i, a in enumerate(rows):
            outcomes = []
            for attr, pred in t['match'].items():
                v = a.get(attr)
                op, expected = next(iter(pred.items()))
                outcomes.append(None if not isinstance(v, str) else v == expected if op == 'equals' else v.startswith(expected))
            if False in outcomes:
                continue
            if None in outcomes:
                unknown += 1
                continue
            found.append((i, a))
            owner.setdefault(i, []).append(t['key'])
        n = len(found)
        cardinality = 'indeterminate' if unknown else 'not_returned' if n == 0 else 'single' if n == 1 else 'duplicate'
        row = {'key': t['key'], 'matches': n, 'unknown_candidates': unknown,
               'cardinality': cardinality, 'attributes': 'not_checked', 'accuracy': 'not_checked',
               'expected_attributes': sorted(t.get('expected', {}))}
        if n == 1:
            a = found[0][1]
            row['attributes'] = 'present' if all(isinstance(a.get(k), str) for k in t['attributes']) else 'missing'
            expected = t.get('expected', {})
            if expected:
                row['accuracy'] = 'matches_expected' if all(a.get(k) == v for k, v in expected.items()) else 'mismatch'
            if include_values:
                row['values'] = {k: a[k] if isinstance(a.get(k), str) else None for k in t['attributes']}
        out['targets'].append(row)
    overlap = {key for keys in owner.values() if len(keys) > 1 for key in keys}
    for row in out['targets']:
        row['overlaps_target'] = row['key'] in overlap
    accepted = all(t['cardinality'] == 'single' and t['attributes'] == 'present' and t['accuracy'] != 'mismatch' and not t['overlaps_target'] for t in out['targets'])
    out.update(status='observed' if accepted else 'rejected', reason='returned_rows_match_contract' if accepted else 'target_validation_failed')
    return out


def load_json(text):
    def pairs(items):
        obj = {}
        for key, value in items:
            require(key not in obj, 'duplicate JSON key')
            obj[key] = value
        return obj
    def constant(_):
        raise Invalid('non-finite JSON number')
    return json.loads(text, object_pairs_hook=pairs, parse_constant=constant)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--contract', required=True)
    parser.add_argument('--axorc', default='axorc', help='Trusted installed AXorcist executable')
    parser.add_argument('--timeout', type=float, default=20)
    parser.add_argument('--include-values', action='store_true', help='Print only requested target values; potentially private')
    args = parser.parse_args()
    started = time.monotonic()
    try:
        require(0 < args.timeout <= 60, 'timeout must be >0 and <=60 seconds')
        with open(args.contract, encoding='utf-8') as f:
            c = contract_check(load_json(f.read()))
        # Fixed read-only command; the contract cannot introduce actions or a shell.
        p = subprocess.run([args.axorc, 'raw', '--debug', '--json', json.dumps(command(c))], capture_output=True, text=True, timeout=args.timeout)
        result = validate(c, load_json(p.stdout), p.returncode, p.stderr, args.include_values)
    except subprocess.TimeoutExpired:
        result = {'status': 'rejected', 'reason': 'process_timeout', 'source_completeness': 'incomplete'}
    except (OSError, ValueError) as e:
        result = {'status': 'rejected', 'reason': 'invalid_input_or_execution', 'error_type': type(e).__name__}
    result['observed_at'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    result['elapsed_ms'] = round((time.monotonic() - started) * 1000, 2)
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result['status'] == 'observed' else 1


if __name__ == '__main__':
    sys.exit(main())
