#!/usr/bin/env bash
# Find Claude Code standalone binary path
# Usage: source this script or run directly
# When sourced: exports BINARY_PATH for use in caller

set -e

VERSIONS_DIR="$HOME/.local/share/claude/versions"

if [[ ! -d "$VERSIONS_DIR" ]]; then
  echo "Error: Versions directory not found: $VERSIONS_DIR" >&2
  exit 1
fi

# Find most recently modified binary (= latest version)
LATEST=$(ls -t "$VERSIONS_DIR" 2>/dev/null | head -1)
if [[ -z "$LATEST" ]]; then
  echo "Error: No versions found" >&2
  exit 1
fi

export BINARY_PATH="$VERSIONS_DIR/$LATEST"

# Output in parseable format
echo "Version: $LATEST"
echo "Binary: $BINARY_PATH"
echo "Size: $(du -h "$BINARY_PATH" | cut -f1)"

# Verify it's a Mach-O binary (macOS) or ELF (Linux)
FILE_TYPE=$(file "$BINARY_PATH" | head -1)
if [[ "$FILE_TYPE" == *"Mach-O"* ]] || [[ "$FILE_TYPE" == *"ELF"* ]]; then
  echo "Type: standalone binary"
else
  echo "Type: $FILE_TYPE"
fi
