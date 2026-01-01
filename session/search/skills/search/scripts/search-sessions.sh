#!/bin/bash
# Session Search Script
# Usage: ./search-sessions.sh "keyword1" "keyword2" ...

SESSIONS_DIR="$HOME/.claude/projects"

if [ $# -eq 0 ]; then
    echo "Usage: $0 <keyword1> [keyword2] ..."
    exit 1
fi

# Build grep pattern from arguments
PATTERN=$(IFS='|'; echo "$*")

echo "Searching for: $PATTERN"
echo "In: $SESSIONS_DIR"
echo "---"

# Find matching files with context
find "$SESSIONS_DIR" -name "*.jsonl" -type f -exec sh -c '
    for file do
        if grep -l -i -E "$1" "$file" >/dev/null 2>&1; then
            # Get modification date
            mod_date=$(stat -f "%Sm" -t "%Y-%m-%d" "$file" 2>/dev/null || stat -c "%y" "$file" 2>/dev/null | cut -d" " -f1)
            # Extract session ID from filename
            session_id=$(basename "$file" .jsonl)
            # Extract project name from path
            project=$(basename "$(dirname "$file")" | sed "s/-Users-choi-Downloads-github-//" | sed "s/-Users-choi-//" | cut -c1-30)

            echo "$mod_date | ${session_id:0:8}... | $project"
        fi
    done
' sh "$PATTERN" {} +

echo "---"
echo "Use full session ID to read specific session"
