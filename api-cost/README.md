# api-cost

Shows where to see API spend and usage for Anthropic, OpenAI and Gemini. The skill replies with the dashboard links and how to pick the account on each page. It does not fetch any data.

| Vendor | Account | Cost | Usage | How to pick the account |
|---|---|---|---|---|
| Anthropic | personal, work | [Cost](https://platform.claude.com/cost) | [Usage](https://platform.claude.com/usage) | The page shows the organization of the account you are signed in with. Check it in the account menu at the bottom left. To see another account, sign in with that account. |
| OpenAI | personal, work | [Spend](https://platform.openai.com/analytics/spend) | [Usage](https://platform.openai.com/analytics/usage) | Open the organization menu at the bottom left and select the organization. |
| Gemini | personal | [Spend](https://aistudio.google.com/spend) | [Usage](https://aistudio.google.com/usage) | Sign in with your personal Google account and select the project in the **Project** dropdown. |

Notes:

- `platform.openai.com/usage` redirects to `/analytics/overview`. The table links to the spend and usage pages directly.
- The cost pages can lag. AI Studio says spend can take 24 hours or more to show.
- Gemini is listed for the personal account only.

Use: ask Claude where to see your API spend, or run `/api-cost`.
