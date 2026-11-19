# Output

Read at step 0 (to find the previous brief) and step 5 (to write this one). Covers the JSON contract, the rendered brief, and where both are stored.

## Storage

- Directory: the `output_dir` option when it is set, otherwise the plugin's data directory, which the skill receives as its `<dir>` value.
- Per run, write three files:
  - `<dir>/<YYYY-MM-DD>.json` — the brief object below; the date is the user's local date.
  - `<dir>/<YYYY-MM-DD>.md` — the rendered brief.
  - `<dir>/latest.json` — the same object as the dated file, rewritten each run, for downstream readers.
- A second run on the same date overwrites that date's files.
- The previous brief is the newest dated JSON file before today's date. Read it before gathering; it may carry `done: true` on to-dos that the user or a downstream marked.

## JSON contract

Keys and enum values stay in English so that downstream code can rely on them. Every human-readable value is written in the brief's `language`.

```json
{
  "schema": "morning-brief/1",
  "date": "YYYY-MM-DD",
  "generated_at": "ISO 8601 with the local offset",
  "language": "BCP 47 tag, e.g. ko",
  "greeting": "one or two sentences",
  "push_forward": {
    "id": "...", "area": "...", "title": "...", "body": "...",
    "next_step": "what this assistant can draft or assemble for it",
    "source": { "name": "...", "url": "https://..." }
  },
  "top_todos": [
    { "id": "...", "area": "...", "title": "...", "body": "...",
      "source": { "name": "...", "url": "https://..." },
      "first_seen": "YYYY-MM-DD", "done": false }
  ],
  "new_updates": [
    { "id": "...", "area": "...", "title": "...", "body": "...",
      "source": { "name": "...", "url": "https://..." } }
  ],
  "your_day": {
    "morning":   [ { "start": "HH:MM", "end": "HH:MM", "title": "...", "note": "..." } ],
    "afternoon": [ { "start": "HH:MM", "end": "HH:MM", "title": "...", "note": "..." } ]
  },
  "looking_ahead": "one or two sentences",
  "sources": [ { "name": "...", "ok": true, "note": "..." } ],
  "unverified": [ { "title": "...", "tried": "..." } ]
}
```

- `id` is the source URL with its query string and fragment removed; it is how the next run recognises the same item.
- `first_seen` is the date of the first brief that listed this to-do; a new to-do takes today's date.
- `push_forward` is `null` when no item meets its bar. `note` may be an empty string.
- Times are local, 24-hour.
- Every `source.url` is a full https URL that this run opened. When a notification points at a canonical item (a pull request, an issue, a document), the URL is the canonical item's.
- Text values are plain text: no markdown and no HTML.

## Writing the items

- The title names the action or the news in a short phrase. For a to-do, it names the next action given the current state — after what the user has already done — and the person it concerns.
- The body is one or two short sentences that add what the title does not: who is waiting, on what, and why today. It does not repeat the title.
- The text states only what the source states: an attribution ("X asked …") needs a source that shows X asking; a proposed fix is written as proposed.
- The greeting comments on the shape of the day — how full the calendar is, where the open time sits — warmly and briefly, without listing items and without urgency.

## Rendered brief

The markdown file renders the same object for a person to read, entirely in `language`, headings and dates included:

1. A title with the local date and weekday, written the way that language writes them (for Korean: `11월 19일 (목) 브리프`).
2. The greeting.
3. One heading per section in this order: push forward, top to-dos (as a checklist), new updates, your day (morning, then afternoon), looking ahead. Headings are written in `language`.
4. Each item: `[area] title`, the body on the next line, and the source as a link named by `source.name`.
5. A last line listing the sources read and any that failed.

Omit a section heading whose section is empty, except top to-dos and your day, which state that they are empty.
