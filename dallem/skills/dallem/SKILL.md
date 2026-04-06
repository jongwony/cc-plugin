---
name: dallem
description: |
  This skill should be used when the user asks to "book therapy",
  "dallem reservation", "schedule therapy", "check therapy slots",
  or mentions scheduling a therapy session at dallem.com.
  Books therapy sessions with calendar conflict checking.
---

# Dallem Therapy Reservation Assistant

Book therapy sessions at dallem.com by extracting available slots, comparing with your calendar, and preparing the reservation. The user confirms the final submission manually.

## Prerequisites

- Chrome running with `--remote-debugging-port=9222`
- Logged into dallem.com in Chrome (session-based auth, cookie inherited by CDP)
- `/cdp-attach` skill loaded (provides CDP script paths V1, V2, V3 and usage patterns)

If prerequisites are not met, guide the user to launch Chrome with CDP and log in first.

## Defaults

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Session duration | 40 min | Historical booking data |
| Calendar | primary | Google Calendar MCP |
| Reservation URL | `https://app.dallem.com/reservation/therapy` | Therapy program page |

Reference these values throughout the workflow. The user can override any default.

## Workflow

### Phase 1: Connect and Extract Slots

1. **Find and select the dallem tab**:
   ```bash
   V1="..." && $V1 list --search "dallem"
   ```
   If not found, ask the user to open the reservation URL in Chrome.
   After selecting the tab, check the current URL before navigating:
   ```bash
   V1="..." && $V1 evaluate "window.location.href"
   ```
   Only navigate if the URL does not contain `/reservation/therapy`. The SPA takes ~30 seconds to render after a fresh navigation.

2. **Extract slots, date, and session count** in a single evaluate call:
   ```bash
   V1="..." && $V1 evaluate --stdin <<'JS'
   var container = document.querySelector('.grid.grid-cols-6');
   if (!container) { JSON.stringify({error: 'slot container not found'}); }
   else {
     var slots = Array.from(container.children).map(function(el) {
       return { time: el.textContent.trim(), available: !el.className.includes('opacity') };
     });
     var dateBtn = document.querySelector('button[aria-label*="selected"]');
     var dateLabel = dateBtn ? dateBtn.getAttribute('aria-label') : 'unknown';
     var bodyText = document.body.innerText;
     var remainMatch = bodyText.match(/\d+\s*\/\s*\d+/) || bodyText.match(/\d+\s*(?:sessions?|times?)/i);
     var remaining = remainMatch ? remainMatch[0] : null;
     JSON.stringify({ date: dateLabel, slots: slots, remaining: remaining });
   }
   JS
   ```
   If the container is not found, wait a few seconds and retry once. If it fails again, proceed to the fallback.

**Fallback chain** (if JS extraction fails after 2 attempts):
1. Try the accessibility tree: `$V1 snapshot --depth 3` and parse slot text
2. Try `$V2 scan_interactive` to discover elements (note: time slots are `<div>` not `<button>`, so this may miss them)
3. Last resort — screenshot: `$V1 screenshot -o /tmp/dallem-slots.png`, then Read the image to identify visible time values

### Phase 2: Calendar Comparison

1. **Query Google Calendar** for the reservation date using `mcp__claude_ai_Google_Calendar__gcal_list_events`:
   - `calendarId`: `"primary"`
   - `timeMin`: earliest extracted slot time (e.g., `2026-04-07T12:00:00`)
   - `timeMax`: latest extracted slot time + 40 minutes (e.g., `2026-04-07T14:10:00`)
   - `timeZone`: `"Asia/Seoul"`
   - Note: timestamps use local time without offset; the `timeZone` parameter handles conversion.

2. **Check overlap** for each extracted slot:
   - For each slot, compute the session range `[slot_start, slot_start + 40min]`
   - A slot **conflicts** if: `slot_start < event_end AND slot_end > event_start`

3. **Classify** each slot as AVAILABLE or CONFLICT (include conflicting event name).

### Phase 3: Present Available Slots (Gate)

Present the comparison results, then yield turn for user selection. Do not proceed without user input.

```
## [Date] Therapy Reservation

Calendar events on this date:
- [Event 1]: HH:MM - HH:MM
- [Event 2]: HH:MM - HH:MM

Available slots (no conflict):
1. HH:MM
2. HH:MM

Conflicting slots:
- HH:MM — overlaps with [Event name]
- HH:MM — overlaps with [Event name]

Which time slot would you like to select?
```

### Phase 4: Prepare Reservation

After user selects a slot:

1. **Verify page state**: Check that the reservation page is still active:
   ```bash
   V1="..." && $V1 evaluate "!!document.querySelector('.grid.grid-cols-6')"
   ```
   If the page has changed, re-navigate and re-extract before clicking.

2. **Click the selected slot**: Find the child element of `.grid.grid-cols-6` whose `textContent.trim()` matches the user's selected time, then call `.click()`. Use the slot index from Phase 1 output if available for a more robust match.

3. **Capture confirmation screenshot**:
   ```bash
   V1="..." && $V1 screenshot -o /tmp/dallem-confirm.png
   ```
   Read the screenshot to verify the slot selection and show therapist/room assignment.

4. **Inform the user**: Describe what is shown (selected slot, therapist info) and remind them to click the final confirmation button on the page manually.

The skill does NOT submit the reservation.

## Selector Stability

The primary CSS selector `.grid.grid-cols-6` is a Tailwind utility class that may change across dallem.com deploys. If it breaks, follow the fallback chain in Phase 1. The `<div>` element note and accessibility tree fallback address this risk.

## Notes

- **Auth**: Relies on Chrome's login session. If expired, log in manually first.
- **Date selection**: Operates on whichever date is selected on the page calendar. To change dates, navigate the calendar before or during the session.
- **Cross-plugin dependency**: CDP script paths (V1/V2) are provided by the `/cdp-attach` skill, which must be loaded in the same session.
