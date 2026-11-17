# Validation record

Automated checks were run on Windows during implementation. Physical-device checks remain in `DEVICE_TESTS.md`.

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

Night recap: finished event details include each member's first and last photo, independently of feed pagination. One-photo and no-photo members are handled explicitly. The API suite covers these cases and nonmember access restrictions. The recap UI includes photo pairs with timestamps, group totals, the existing tied podium groups, and complete standings. Physical-phone layout review is pending.

Photo-upload follow-up: SDK 58's multipart converter explicitly rejects the legacy `{ uri, name, type }` descriptor. Replaced it with an expo-file-system File (including missing/empty-file checks) in the shared camera/avatar upload helper. TypeScript and iOS/Android/web bundles pass; successful upload on a physical phone still needs confirmation.

The SDK 58 installation reports three moderate advisories in the Expo/fingerprint/minimatch dependency chain. The earlier SDK 54 high-severity build dependency advisory is no longer reported. Do not use npm audit fix --force: npm proposes an incompatible Expo downgrade. Recheck advisories with future compatible Expo patches.
