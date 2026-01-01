#!/bin/bash
# Find Claude Code installation path and version info

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=== Claude Code Installation Info ==="
echo ""

# 1. Get current version
if command -v claude &> /dev/null; then
    VERSION=$(claude --version 2>/dev/null | head -1 || echo "unknown")
    echo -e "${GREEN}Version:${NC} $VERSION"
else
    echo -e "${RED}Claude CLI not found in PATH${NC}"
    exit 1
fi

# 2. Find npm cache location (npx installed)
NPX_CACHE="$HOME/.npm/_npx"
if [ -d "$NPX_CACHE" ]; then
    CLI_JS=$(find "$NPX_CACHE" -name "cli.js" -path "*/@anthropic-ai/claude-code/*" 2>/dev/null | head -1)
    if [ -n "$CLI_JS" ]; then
        echo -e "${GREEN}Source (cli.js):${NC} $CLI_JS"
        SIZE=$(du -h "$CLI_JS" | cut -f1)
        echo -e "${GREEN}Size:${NC} $SIZE"
    fi
fi

# 3. Find binary location
BINARY_DIR="$HOME/.local/share/claude/versions"
if [ -d "$BINARY_DIR" ]; then
    LATEST_BINARY=$(ls -t "$BINARY_DIR" 2>/dev/null | head -1)
    if [ -n "$LATEST_BINARY" ]; then
        echo -e "${GREEN}Binary:${NC} $BINARY_DIR/$LATEST_BINARY"
    fi
fi

# 4. Check global npm install
GLOBAL_NPM=$(npm root -g 2>/dev/null)/@anthropic-ai/claude-code
if [ -d "$GLOBAL_NPM" ]; then
    echo -e "${GREEN}Global npm:${NC} $GLOBAL_NPM"
fi

echo ""
echo "=== Recommended Search Path ==="
if [ -n "$CLI_JS" ]; then
    echo "$CLI_JS"
elif [ -d "$GLOBAL_NPM" ]; then
    echo "$GLOBAL_NPM/cli.js"
else
    echo -e "${YELLOW}Could not find searchable source. Try: npm root -g${NC}"
fi
