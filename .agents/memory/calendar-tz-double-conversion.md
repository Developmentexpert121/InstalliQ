---
name: Calendar timezone double-conversion
description: Why synthetic calendar events (e.g. Time Off) must store `date` as a plain UTC instant, not a pre-zoned date
---

In `client/src/pages/google-calendar.tsx`, all calendar views (month/week/day/agenda/list, status filters) place an event onto a grid cell by calling `toEST(event.date)` ONCE (`toEST` = `toZonedTime(..., "America/Chicago")`; named EST historically but timezone is Central). Real bookings store `event.date` as a plain UTC ISO string, so a single `toEST` lands on the right local day.

**Rule:** Any synthetic/derived event you push into the events array must set `date` to a plain UTC instant, NOT to a date that has already been through `toZonedTime`/`toEST`/`startOfDay(toEST(...))`. If you store a pre-zoned date's `.toISOString()`, the views apply the Central conversion a SECOND time and the event drifts one day backward (in browsers east of Central).

**Why:** A multi-day all-day Time Off block stored correctly (e.g. `2026-06-01T12:00Z` → `2026-06-03T12:00Z`) was rendering as May 31–Jun 2. The expansion built per-day dates as `startOfDay(toEST(b.startAt))` then stored `d.toISOString()` (already zoned), and the views re-zoned it → double shift.

**How to apply:** Build each day's date with `fromEST(dayStr, "12:00").toISOString()` where `dayStr = format(d, "yyyy-MM-dd")`. Noon (not midnight) keeps the date stable across DST. `fromEST`/`toEST`/`formatEST` all key off `BOOKING_TIMEZONE = "America/Chicago"`.
