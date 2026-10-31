#!/usr/bin/env bash
# Offline checks: unit tests against fakes, a compile of the real helper,
# CLI paths that exit before the app is reached, and a source scan for forbidden calls.
# Nothing here talks to KakaoTalk.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
src="$root/helper/Sources"
out="$(mktemp -d "${TMPDIR:-/tmp}/kakao-rooms-check.XXXXXX")"
trap 'rm -rf "$out"' EXIT

command -v swiftc >/dev/null || { echo "swiftc not found: run xcode-select --install" >&2; exit 1; }

echo "== unit tests (Core + fakes; the AX layer is not linked)"
swiftc -o "$out/tests" "$src"/Core/*.swift "$root"/helper/Tests/*.swift
"$out/tests"

echo "== compile helper (Core + AX + CLI)"
swiftc -O -o "$out/kakao-rooms" "$src"/Core/*.swift "$src"/AX/*.swift "$src"/CLI/main.swift
echo "ok"

echo "== CLI paths that exit before constructing the driver"
"$out/kakao-rooms" --help | head -1
set +e
"$out/kakao-rooms" send --window 1 --text hi; rc=$?
set -e
[ "$rc" -eq 2 ] || { echo "expected exit 2 for a usage error, got $rc" >&2; exit 1; }
echo "usage exit: $rc"

echo "== forbidden calls (keyboard events, raising, activation, pointer, scripting)"
if grep -nE 'CGEvent|kAXRaiseAction|AXRaise|\.activate\(|kAXFocusedAttribute|kAXMainAttribute|NSAppleScript|osascript|CGWarpMouse|kAXConfirmAction|kAXShowMenuAction' \
    "$src"/Core/*.swift "$src"/AX/*.swift "$src"/CLI/*.swift; then
  echo "forbidden call found" >&2
  exit 1
fi
echo "none"
