---
name: api-cost
description: Show the links to the Anthropic, OpenAI and Gemini API cost and usage dashboards, per account, and stop there. Use when the user asks where to see their API spend or usage for these vendors. Not Claude Code's own /usage.
---

# api-cost

The reply is the table below and how to pick each account, in the user's language, and nothing else: no page is opened, no API is called, no key is read, and no amount is stated.

| Vendor | Account | Cost | Usage | Selecting the account |
|---|---|---|---|---|
| Anthropic | personal, work | https://platform.claude.com/cost | https://platform.claude.com/usage | The organization follows the signed-in account; the account menu at the bottom left shows it. Sign in with the account whose spend is wanted. |
| OpenAI | personal, work | https://platform.openai.com/analytics/spend | https://platform.openai.com/analytics/usage | The organization menu at the bottom left lists the organizations of the signed-in account; pick the one wanted there. |
| Gemini | personal | https://aistudio.google.com/spend | https://aistudio.google.com/usage | Sign in with the personal Google account, then pick the project in the Project dropdown; the page then carries it as `?project=…`. |

- Gemini is listed for the personal account only.
