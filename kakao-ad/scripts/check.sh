#!/usr/bin/env bash
# Offline checks: the shared Core's unit tests, the agent-desktop adapter against a fake
# agent-desktop, a compile of the real helper, CLI paths that exit before the app is reached,
# and source scans. Nothing here talks to KakaoTalk or runs agent-desktop.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
src="$root/helper/Sources"
out="$(mktemp -d "${TMPDIR:-/tmp}/kakao-ad-check.XXXXXX")"
trap 'rm -rf "$out"' EXIT

command -v swiftc >/dev/null || { echo "swiftc not found: run xcode-select --install" >&2; exit 1; }

echo "== Core matches the kakao plugin's (skipped outside the repository)"
if [ -d "$root/../kakao/helper/Sources/Core" ]; then
  diff -r "$root/../kakao/helper/Sources/Core" "$src/Core"
  diff -r "$root/../kakao/helper/Tests" "$root/helper/Tests/core"
  echo "identical"
else
  echo "skipped"
fi

echo "== Core unit tests (fakes)"
swiftc -o "$out/core-tests" "$src"/Core/*.swift "$root"/helper/Tests/core/*.swift
"$out/core-tests"

echo "== adapter tests (fake agent-desktop)"
swiftc -o "$out/ad-tests" "$src"/Core/*.swift "$src"/Policy/*.swift "$src"/AgentDesktop/*.swift \
  "$root"/helper/Tests/agentdesktop/*.swift
"$out/ad-tests"

echo "== compile helper"
swiftc -O -o "$out/kakao-ad" "$src"/Core/*.swift "$src"/Policy/*.swift "$src"/AgentDesktop/*.swift "$src"/CLI/main.swift
echo "ok"

echo "== CLI paths that exit before constructing the driver"
"$out/kakao-ad" --help | head -1
set +e
"$out/kakao-ad" send --window 1 --text hi; rc=$?
set -e
[ "$rc" -eq 2 ] || { echo "expected exit 2 for a usage error, got $rc" >&2; exit 1; }
echo "usage exit: $rc"

echo "== no direct app access in the helper (agent-desktop is the only path to the window)"
if grep -nE 'AXUIElement|CGEvent|kAXRaiseAction|AXRaise|\.activate\(|NSAppleScript|osascript|CGWarpMouse' \
    "$src"/Policy/*.swift "$src"/AgentDesktop/*.swift "$src"/CLI/*.swift; then
  echo "direct app access found" >&2
  exit 1
fi
echo "none"

echo "== agent-desktop commands named in the helper are the subset"
names="$(grep -ohE '\["(list-windows|snapshot|get|set-value|click|permissions|press|type|focus[a-z-]*|mouse-[a-z]+|drag|hover|scroll[a-z-]*|launch|close-app)"' \
  "$src"/AgentDesktop/*.swift | tr -d '["' | sort -u | tr '\n' ' ')"
echo "found: $names"
for n in $names; do
  case "$n" in list-windows|snapshot|get|set-value|click|permissions) ;; *) echo "outside the subset: $n" >&2; exit 1 ;; esac
done
