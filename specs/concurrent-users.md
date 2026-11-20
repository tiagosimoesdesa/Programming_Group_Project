# Concurrent user capacity

## Why

COUNT THE JOLS becomes slow or unreliable when a group opens the same competition at once. The course presentation may involve 30–40 people, so the existing workflows must remain responsive under a representative concurrent load without weakening privacy, scoring, or authentication.

## What

- Provide a repeatable load test that simulates at least 25 independent authenticated users joining one competition, loading its state concurrently, and receiving the same real-time revision.
- Share competition-revision polling across WebSocket clients so database load grows by active competitions rather than connected people.
- Batch and briefly reuse private Supabase photo signatures so one feed refresh does not make one external request per image per viewer.
- Bound concurrent Argon2 work so a login spike cannot exhaust a small server's memory.
- Preserve every existing API response, permission, scoring rule, privacy rule, and mobile workflow.

## Out of scope

- Load-testing production or creating test accounts in the real Supabase project.
- Replacing Render, Supabase, FastAPI, Expo, WebSockets, or the approved architecture.
- Supporting internet-scale traffic or multiple backend workers through a new message broker.
- Changing photos, feed pagination, scores, timers, or user-visible behavior.

## Done when

- All existing backend tests pass without weakening or skipping any test.
- New tests prove that concurrent live clients share one cached revision read and that many photo paths use one Supabase signing request.
- The disposable local load test completes with 25 users, zero failed join/detail/WebSocket operations, and reports latency percentiles.
- `uv run alembic check`, OpenAPI regeneration, generated mobile API types, and TypeScript checks remain clean.
- The final diff contains no credentials, production data, test database, or generated user photos.
