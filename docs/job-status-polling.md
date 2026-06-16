# Hidden-Tab Job Polling

Job progress is fetched from `GET /api/jobs/:id` every two seconds while a translation is in flight. That polling is useful only when the user can actually see the progress card.

## Optimization Rule

- Keep the existing polling cadence while the document is visible.
- Pause polling completely when the tab is hidden.
- Trigger one immediate refresh when the tab becomes visible again so the UI catches up without waiting for the next two-second tick.

## Why This Exists

Long translations can run for minutes. If the user switches tabs during that time, the old behavior keeps issuing identical progress requests against the API and database even though nobody can see the updates.

This optimization is intentionally narrow: it reduces hidden-tab request volume without changing the progress payload, the public API surface, or the visible polling cadence while the page is on screen.
