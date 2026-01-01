# Session Search

Search Claude Code session history to find past conversations by topic, keyword, or date.

## Scope

- Target: `~/.claude/projects/` (all project sessions)
- Format: JSONL session files containing conversation history

## Workflow

### 1. Gather Search Terms

Identify keywords from user query. Common patterns:
- Topic keywords (e.g., "kafka", "migration")
- Technical terms (e.g., "MSK", "Confluent", "EKS")
- Date ranges if specified

### 2. Execute Search

Use Explore subagent for efficient multi-file search:

```
Search ~/.claude/projects/**/*.jsonl for:
- Primary keywords in message content
- Korean and English variants
- Related technical terms
```

### 3. Output Format

Present results as table with columns: Date | Session ID | Project | Topic Summary

Reference: `references/examples.md` for format details.

### 4. Follow-up Options

Offer: view details, resume session, or export content.

## Search Strategy

### Keyword Expansion

Expand user terms to Korean + English variants + related technical terms.

Reference: `references/examples.md` for expansion patterns.

### Date Extraction

Extract from: file modification time → message timestamps → filename patterns.

## Scripts

### `scripts/search-sessions.sh`

Quick grep-based search across session files. Usage:

```bash
./scripts/search-sessions.sh "keyword1" "keyword2"
```

## Requirements

- `jq` (JSON processor) - for structured JSONL parsing

## Limitations

- Large session files may have truncated preview
- Base64-encoded content not fully searchable
- Date accuracy depends on available metadata
