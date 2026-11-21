# Validation record

Automated checks were run on Windows during implementation. Physical-device checks remain in `DEVICE_TESTS.md`.

## Multiplayer performance — 21 November 2026

- The timed browser rehearsal used two independent Chrome sessions, the compiled Expo web app, the real local API and WebSockets, and synthetic camera input. It exercised Classic joining, photo capture and posting, reactions, ranks, finishing and recap, Party challenge submission and approval, and private Battle team selection, starting, and photo visibility. The longest measured button-to-visible action was 512 ms. The guest saw the Classic check-in within 633 ms of the host starting the upload.
- Each load scenario used a new SQLite database and synthetic photos. Every join, upload, feed read, WebSocket operation, and final state check completed successfully. Each player received exactly one check-in point. The 25- and 40-player scenarios uploaded 624 KB photo pairs and also ran simultaneous sign-ins. The 60-player scenario used 124 KB pairs.

| Concurrent players | Join p95 | Feed read p95 | Live notice p95 | Photo upload p95 | Final view refresh p95 |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 25 | 413 ms | 859 ms | 360 ms | 1,142 ms | 1,178 ms |
| 40 | 680 ms | 601 ms | 350 ms | 2,063 ms | 1,231 ms |
| 60 | 873 ms | 989 ms | 576 ms | 2,550 ms | 3,342 ms |

- The 40-player scenario measured feed-read p95 of 2,032 ms during uploads and 1,419 ms during sign-ins. Those bursts still exceed the one-second target. The table measures the live notice and final view from the start of the host's finish request.
- Pytest reported `41 passed, 1 warning`. Alembic reported `No new upgrade operations detected.` OpenAPI and generated TypeScript had no content changes. `npm run typecheck` and the iOS, Android, and web exports completed successfully. Expo confirmed compatibility using its installed SDK map offline.
- Hosted Render/Supabase timing and physical iPhone and Android acceptance remain pending. Before the presentation, open the deployed `/health` endpoint and allow the free Render service to wake if it has been idle. [Render free service behavior](https://render.com/docs/free#spinning-down-on-idle)

## Persistent browser sessions — 19 November 2026

- Added web-only register, login, refresh, and logout endpoints using a rotating, host-only `HttpOnly` refresh cookie; native SecureStore authentication remains unchanged.
- Backend tests cover trusted and rejected browser origins, cookie flags, rotation, invalid token reuse, and logout. All 36 backend tests pass; one existing Starlette/httpx deprecation warning remains.
- Alembic reports no pending model operations; this change requires no database migration.
- OpenAPI and generated TypeScript types were regenerated, and strict TypeScript checking passes.
- Expo's installed dependency compatibility check passes offline, and production bundles export successfully for iOS, Android, and web.
- Render is configured to proxy browser `/api/*` requests through the frontend origin while WebSockets connect directly to the API. Reload and logout must still be confirmed after the branch is reviewed, merged, and deployed.

## Beer points and Battle mode — 19 November 2026

- Updated local `main` through commit `1290ba4`, including independent beer points and the timed team Battle mode.
- Alembic upgrades through revision `0007` apply locally and report `0007` as head.
- The backend suite passes 31 tests when pytest uses a writable project-local temporary directory. The default sandbox temporary directory produced a Windows permission error after 31 successful tests; this was an environment issue, not an application assertion failure.
- Strict TypeScript checking passes with the generated Battle API client.
- Local `/health` and the authenticated Expo manifest both return HTTP 200 using the current LAN address.
- Physical two-phone Classic, Party, and Battle workflows, camera permissions, simultaneous actions, hidden Battle results, and final reveal layouts remain to be completed.

## Classic and Party modes — 18 November 2026

- Added host-selected Classic and Party modes, with the selection required before the invitation code is generated.
- Party schedules and scoring are enforced by Python: the host starts with at least two players, 16 unique challenges rotate every 30 minutes, and approved attempts add two points to the combined leaderboard.
- All 14 backend API tests pass, including Party start rules, dedicated photo-pair attempts, majority approval, combined scoring, feed visibility, and round expiry.
- Alembic upgrades through revision `0004` apply to a fresh SQLite database and report no pending model operations.
- OpenAPI and TypeScript client types were regenerated; strict TypeScript and Expo dependency compatibility checks pass.
- Production bundles export successfully for iOS, Android, and web.
- Automated browser visual inspection was unavailable because the browser-access host could not be reached. Physical two-phone countdown, camera, voting synchronization, and layout checks remain required.
- The current audit reports `minimatch` (moderate) and `picomatch` (high) advisories through the Expo/Metro dependency chain, with no compatible fix currently offered. Do not use `npm audit fix --force`; keep Expo updates coordinated with native-device validation.

## Local verification — 17 November 2026

- Fetched the shared repository before testing; `origin/rodrigo-work` had no commits ahead of local `main`.
- All 11 backend tests passed in 5.10 seconds with the existing Python environment outside the execution sandbox. The earlier stalled sandbox run did not reproduce. One Starlette/httpx deprecation warning remains.
- Mobile strict TypeScript check passed.
- Started the local API and applied migrations; `/health` returned `ok`.
- Browser smoke test against the real local API: logged in with a test account, created an event, joined it with a second account through the API, and observed the second participant and tied zero-point standings without a manual refresh.
- Finished the event from the host's browser UI; the finished results showed both tied players, capture was no longer offered, and the event appeared in Memories.
- Registration, image validation/uploads, deduplication, access restrictions, and WebSocket revisions passed in the automated API tests. Browser signup, physical cameras, permission denial, and two-phone end-to-end behavior were not verified in this pass.
- Local-only test accounts `preview_tester_1117` and `preview_guest_1117` and the finished `Desktop test 17 November` event remain available for inspection. Their credentials and database are not committed.

- Backend API suite: 11 passing tests against SQLite, including concurrent retry deduplication and closure while uploading.
- Alembic initial migration: applied successfully to a fresh SQLite database; metadata comparison reports no pending upgrade operations.
- OpenAPI contract exported and TypeScript client models generated.
- Strict TypeScript check: passed.
- Production JavaScript/Hermes bundles: exported successfully for both iOS and Android. This is a bundle check, not a signed IPA/APK or a device test.
- Expo SDK package compatibility: passed using the installed SDK's local compatibility table (offline mode).
- PostgreSQL checks are configured in GitHub Actions but have not been run locally; no PostgreSQL service is available on this PC.
- Supabase and Render integration needs real account credentials and a hosted smoke test.

## SDK 58 upgrade — 17 November 2026

- Upgraded Expo to 58.0.26, React Native to 0.88.1, React to 19.3, and aligned native packages with Expo's compatibility table. Added the required expo-font peer dependency.
- Updated the login input reference to TextInputInstance for React Native's strict types.
- Retained TypeScript 5.9.3 because openapi-typescript 7.13 requires TypeScript 5. The Expo install exclusion applies only to this compiler; native dependency validation remains enabled. API type generation and app typechecking pass.
- iOS, Android, and web production bundles export successfully. Physical-phone verification remains pending.
- CI now uses Node 24, matching local validation.

## Dependency audit

Social features follow-up: 13 API tests pass, including reaction replacement/removal, filtered feeds, host-only challenge settings and spectator invitations, spectator posting restrictions, nonmember privacy, duplicate challenge claims/votes, majority approval, vote changes, and closure. Alembic upgrades 0002/0003 apply without pending model differences. Strict TypeScript and iOS/Android/web exports pass. Browser smoke testing confirmed a reaction count update, opening/closing the full-screen photo pair, enabling challenges, and a pending challenge submission. Two-phone reaction/voting synchronization and phone layouts remain to be checked. Invitation sharing to other groups is manual through the phone share sheet; there is no public discovery or permanent group linking.

Night recap: finished event details include each member's first and last photo, independently of feed pagination. One-photo and no-photo members are handled explicitly. The API suite covers these cases and nonmember access restrictions. The recap UI includes photo pairs with timestamps, group totals, the existing tied podium groups, and complete standings. Physical-phone layout review is pending.

Photo-upload follow-up: SDK 58's multipart converter explicitly rejects the legacy `{ uri, name, type }` descriptor. Replaced it with an expo-file-system File (including missing/empty-file checks) in the shared camera/avatar upload helper. TypeScript and iOS/Android/web bundles pass; successful upload on a physical phone still needs confirmation.

The 17 November SDK 58 installation reported three moderate advisories in the Expo/fingerprint/minimatch dependency chain. The newer 18 November audit result is recorded above and supersedes that snapshot. Do not use npm audit fix --force: forced changes can break Expo compatibility. Recheck advisories with future compatible Expo patches.
