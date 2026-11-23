# api-cost

Shows where to see API spend and usage for Anthropic, OpenAI and Gemini. The skill replies with the dashboard links. It does not fetch any data.

| Vendor | Cost | Usage |
|---|---|---|
| Anthropic | [Cost](https://platform.claude.com/cost) | [Usage](https://platform.claude.com/usage) |
| OpenAI | [Spend](https://platform.openai.com/analytics/spend) | [Usage](https://platform.openai.com/analytics/usage) |
| Gemini | [Spend](https://aistudio.google.com/spend) | [Usage](https://aistudio.google.com/usage) |

Notes:

- `platform.openai.com/usage` redirects to `/analytics/overview`. The table links to the spend and usage pages directly.
- The cost pages can lag. AI Studio says spend can take 24 hours or more to show.

Use: ask Claude where to see your API spend, or run `/api-cost`.
