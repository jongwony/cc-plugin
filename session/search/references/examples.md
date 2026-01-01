# Session Search Examples

## Keyword Expansion Patterns

### Cost-related

| Input | Expanded Keywords |
|-------|-------------------|
| "비용" | 비용, cost, pricing, price, $, 절감, savings, optimization |
| "cost" | cost, 비용, expense, billing, pricing |

### Infrastructure

| Input | Expanded Keywords |
|-------|-------------------|
| "kafka" | kafka, MSK, Confluent, streaming, broker |
| "kubernetes" | kubernetes, k8s, EKS, pod, deployment |

### General Pattern

```
User term → Korean + English variants → Related technical terms
```

## Output Format

### Table Structure

| Date | Session ID | Project | Topic Summary |
|------|------------|---------|---------------|
| Dec 5, 2025 | `abc123...` | org-infra | Confluent cost optimization |
| Nov 28, 2025 | `def456...` | data-platform | Kafka migration planning |

### Field Extraction

- **Date**: File modification time or message timestamp
- **Session ID**: First 8 characters of filename
- **Project**: Folder name, simplified (remove path prefixes)
- **Topic Summary**: 1-2 keywords from matched content

## Follow-up Options

After presenting results:

```
Options:
1. View specific session (provide full ID)
2. Resume session (if recent)
3. Export matched content
```
