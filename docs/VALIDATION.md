# Validation record

Automated checks were run on Windows during implementation. Physical-device checks remain in `DEVICE_TESTS.md`.

## Phase 11 capacity report — 21 November 2026

### Infrastructure audit

| Component | Configuration and performance implications |
| --- | --- |
| Frontend | Expo and React Native serve the web and native interfaces. The web application is a Render static site. Web HTTP routes go through the same-origin `/api` rewrite, and sockets connect directly to the API. Night refreshes can fan out to viewing clients. Clients coalesce overlapping refreshes and poll every eight seconds while disconnected. |
| API and hosting | The Blueprint specifies one FastAPI/Uvicorn worker on Render Free in Frankfurt. The free plan has 0.1 CPU and 512 MB RAM and spins down after 15 minutes without inbound traffic. Free compute lacks multi-instance scaling. Render autoscaling requires a Pro workspace or higher and an eligible service. [Render compute plans](https://render.com/docs/compute-plans), [Free limits](https://render.com/docs/free), [Scaling](https://render.com/docs/scaling) |
| Database | The deployed configuration guide uses PostgreSQL through Supabase's session pooler. This API also has its own SQLAlchemy pool of five regular plus ten overflow connections per worker with a 30-second checkout timeout and pre-ping. Membership, voting, reactions and idempotency use indexed keys or uniqueness constraints. The history lookup filters by user on the membership table, whose primary key leads with competition ID. |
| Authentication | Argon2 uses 64 MiB per hash and allows two outstanding hash jobs by default. Native and web refresh tokens rotate, and access tokens expire in 15 minutes. The login/registration limit is 100 attempts per source IP and 15 per username in 15 minutes. A shared presentation network can hit the IP limit during repeated attempts. |
| Live state and writes | Per-competition revision reads are shared within a worker, with 250 ms polling. Each competition serializes mutations with a PostgreSQL row lock. General work has 12 thread slots, and uploads have a separate six-slot queue. Multiple workers would multiply app database pool and revision polling demand. |
| Photos and external services | Production uses a private Supabase bucket, batched URL signing, a nine-minute server cache, and ten-minute links. Image decoding and validation run on the API. Both photos must be stored before points commit. This adds storage RTT on hosted photo writes and on signing cache misses. |
| Cost and provider quotas | The Blueprint configures free Render compute. The deployment guide calls for a free Supabase Nano project. Its documented defaults include 60 database connections, 200 pooler clients and a 15-connection pool size. Actual dashboard overrides, usage, and invoices were outside this test. Incremental provider cost for this local run was zero. [Supabase compute limits](https://supabase.com/docs/guides/platform/compute-and-disk), [Supabase pricing](https://supabase.com/pricing) |

### Reproduce the test

The Python HTTP and WebSocket runner provisions a fresh database and a Uvicorn process on `127.0.0.1`. It generates temporary credentials and synthetic JPEGs in the ignored workspace `.tools` directory and writes the report to the path passed to `--output`. With a path to PostgreSQL binaries, the runner starts its own loopback PostgreSQL cluster. Without `--postgres-bin` it tests SQLite. Production and shared staging services were outside the tested environment.

```powershell
cd backend
uv run --with psutil==7.2.2 python -m scripts.capacity_test --postgres-bin C:/path/to/postgresql/bin --levels 10 25 50 60 --seconds 25 --output ../.tools/capacity-results.json
```

- The matched runs used PostgreSQL 17.10, one API worker, the Windows test host, 24 archived nights per user, and one shared Classic competition. Think times ranged from 0.65 to 2.5 seconds. Sessions persisted between levels, and roughly two-thirds of users also held authenticated WebSockets.
- The steady mix used approximately 82% reads and 18% writes. People logged in, opened history and feed, filtered by player, paged older photos, fetched signed images, reacted, posted photo pairs, and logged out. Invitation codes and player filters covered the app's discovery workflows.
- The ramp steps were 10, 25, 50, and 60 active virtual users, with a 25-second steady window after each arrival stage. The spike sent three synchronized history waves followed by simultaneous photo uploads and detail reads. Recovery reduced active HTTP users to ten while existing live connections remained open. The runner stops escalation for sustained failures or crossing its API RSS limit of 480 MiB and can check health after an abort.
- The JSON includes request count, status breakdown, RPS, average, p95, p99 and maximum for each phase and endpoint. Client latency measures complete HTTP responses. Server timing measures work up to response headers, and SQL timing covers cursor execution inside the request. CPU uses percentages of one logical core, so totals can exceed 100%. PostgreSQL RSS sums worker processes and can count shared mappings more than once. The driver, database, and API shared a machine. Rendering, hosted TLS, hosted storage, and Render Free CPU throttling were outside this measurement.

### Observed capacity and verified change

The baseline was `cf91254`. A history page for a member with 24 archived nights and one active night executed 52 instrumented SQL statements. The route held its connection during response validation. During the first synchronized 60-client history wave, pool checkouts remained at 15 of 15, API and database CPU fell as work stopped progressing, and 29 of 60 requests timed out or were cancelled during the abort. The 31 completed requests had up to 2.61 seconds of measured server processing. The baseline ended at this spike before upload and recovery measurement.

The fix selects all visible nights, the caller's role and each player count in one query, then releases the connection before serializing the response. The regression test checks the SQL statement budget, ordering, player counts, private visibility, and blank player invitation codes for spectators. The measured SQL count fell **from 52 to 2**, including authentication. The residual count lookup uses each competition's existing membership key. A schema/index change needs a separate larger dataset and query-plan evidence.

| Steady users | Baseline RPS | Baseline ordinary p95 | Retest RPS | Retest OK / failed | Retest error rate | Avg / p95 / p99, all HTTP | Ordinary p95 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 5.75 | 188 ms | 5.89 | 148 / 0 | 0% | 62 / 121 / 144 ms | 119 ms |
| 25 | 14.65 | 252 ms | 15.08 | 378 / 0 | 0% | 73 / 124 / 169 ms | 109 ms |
| 50 | 23.86 | 1,056 ms | 29.60 | 747 / 0 | 0% | 112 / 209 / 287 ms | 191 ms |
| 60 | 26.58 | 1,329 ms | **33.51** | **844 / 0** | **0%** | 160 / 307 / 414 ms | **284 ms** |

Ordinary operations include profile, history, details, filtered and paged feeds, archived-night detail, and reactions. At 60 steady users, history p95 improved from 1,619 to 267 ms. API CPU averaged 87% of one core, down from 123%. Pool checkouts peaked at 9 of 15, down from 15. The retest completed 2,925 HTTP operations across all phases with zero unexpected failures. Expected 401, 404 and 409 responses in the integrity checks count as successful assertions.

| Retest stage | Users or concurrent actions | RPS | OK / failed | HTTP avg / p95 / p99 | API CPU avg | API peak RSS | PG CPU avg / aggregate peak RSS | SQL p95 / peak checked-out |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Arrivals to 10 | 10 | 30.09 | 50 / 0 | 95 / 254 / 406 ms | 170% | 167 MiB | 6% / 171 MiB | 34 ms / 6 |
| Steady | 10 | 5.89 | 148 / 0 | 62 / 121 / 144 ms | 17% | 109 MiB | 5% / 174 MiB | 21 ms / 4 |
| Arrivals to 25 | 15 new / 25 total | 43.56 | 75 / 0 | 114 / 356 / 498 ms | 256% | 109 MiB | 15% / 174 MiB | 41 ms / 7 |
| Steady | 25 | 15.08 | 378 / 0 | 73 / 124 / 169 ms | 40% | 111 MiB | 13% / 176 MiB | 28 ms / 5 |
| Arrivals to 50 | 25 new / 50 total | 47.49 | 125 / 0 | 181 / 695 / 834 ms | 308% | 201 MiB | 26% / 193 MiB | 52 ms / 7 |
| Steady | 50 | 29.60 | 747 / 0 | 112 / 209 / 287 ms | 82% | 119 MiB | 19% / 193 MiB | 55 ms / 8 |
| Arrivals to 60 | 10 new / 60 total | 28.01 | 50 / 0 | 105 / 342 / 454 ms | 178% | 114 MiB | 9% / 177 MiB | 38 ms / 5 |
| Steady | 60 | 33.51 | 844 / 0 | 160 / 307 / 414 ms | 87% | 118 MiB | 18% / 192 MiB | 68 ms / 9 |
| Synchronized history | 60 | 30.81 | 180 / 0 | 972 / 1,609 / 1,771 ms | 44% | 118 MiB | 11% / 175 MiB | 13 ms / 3 |
| Synchronized uploads and reads | 60 | 29.03 | 120 / 0 | 2,302 / 3,846 / 3,947 ms | 128% | 140 MiB | 17% / 222 MiB | 158 ms / 13 |
| Recovery | 10 | 6.11 | 92 / 0 | 76 / 113 / 145 ms | 19% | 125 MiB | 11% / 176 MiB | 23 ms / 3 |
| Integrity | up to 12 parallel actions | 29.08 | 52 / 0 | 242 / 474 / 478 ms | 96% | 130 MiB | 9% / 171 MiB | 72 ms / 11 |
| Logout | 60 + host | 71.77 | 61 / 0 | 419 / 685 / 820 ms | 37% | 124 MiB | 1% / 171 MiB | 2 ms / 2 |

The restored history spike still took 1.61 seconds at client p95. Server p95 for that phase was 39 ms, SQL p95 was 13 ms, and the pool peaked at three. Most of the observed wait was outside the instrumented server interval. During the mixed upload spike, detail p95 was 3.72 seconds and photo-pair upload p95 was 3.85 seconds. Server p95 was 1.39 and 1.57 seconds respectively. Sampled API workers reached 12 general slots and six upload slots with up to seven general tasks waiting. SQL p95 was 158 ms and pool occupancy stayed below 15. The local client also peaked at 88% of one core. This points to API worker and request scheduling pressure during the photo spike, with additional client/transport delay. PostgreSQL pool exhaustion was the first confirmed baseline bottleneck and did not recur in the retest. In the 15-second recovery window, all 92 requests succeeded and ordinary p95 was 107 ms.

### Longer run with more history

With 100 archived nights per account, the candidate sustained **34.53 requests per second** for 75 seconds at 60 active users. There were 2,594 successful responses and two transport failures on reads, an error rate of 0.077%. Overall HTTP average, p95, and p99 were 161, 343, and 527 ms. Ordinary p95 was 313 ms, and history still used two SQL statements per request. Peak API RSS was 122 MiB, average API CPU was 97% of one core, and the pool peaked at 12. Both failed reads lacked a completed HTTP response. The run completed and passed its database and file audit.

The initial wave put all 60 sign-ins into the queue together. Login p95 was 2.62 seconds, with 17 password jobs waiting at the sampled peak. The recovery phase returned to 105 ms ordinary p95 with ten active users. These are results for a short soak on the local host.

A repeat of the same 75-second soak sustained **30.17 RPS**, with 2,261 successes and six timeouts waiting for HTTP responses (0.265%). Overall HTTP average, p95, and p99 were 221, 399, and 1,295 ms. Ordinary p95 was 379 ms. Three timeouts were on history, one on detail, and two on reactions. API RSS peaked at 125 MiB, all 12 general worker slots were briefly busy, and the database pool peaked at 13 of 15. Recovery returned to 94 ms ordinary p95 with zero errors, and the integrity audit again passed. These timeouts are a remaining reliability risk at 60, even below the proposed 1% error budget.

### Concurrency and integrity

- Twelve requests with an identical check-in key returned the same photo ID. Twelve competing updates to the same photo reaction left exactly one reaction for that user. Two attempts to rotate the same refresh token yielded one success and one expected 401. Every logout returned 204.
- Eleven unauthorized private-night read or write attempts returned the expected 404. The history response kept the spectator's player invitation code blank. Existing API coverage also verifies private Battle score/photo visibility, spectator rules, and Party votes.
- Ten check-ins raced the host's finish request. One committed before closure and nine were rejected. A later check-in was rejected. All 40 connected live viewers observed the final revision.
- The final leaderboard matched independently calculated points for all 61 members, including the host. The audit matched all 191 accepted uploads to database rows and files. PostgreSQL reported zero deadlocks and zero temporary spill bytes. The storage audit found zero missing files and zero orphan files.

### Performance gates and operating recommendation

| Gate | Proposed acceptance threshold | Result |
| --- | --- | --- |
| Routine interactive API | p95 under 1 s, p99 under 2 s, and under 1% unexpected errors with the measured read/write mix | Met through 60 in the 25-second PostgreSQL ramp. |
| Sudden traffic | The same interactive p95 during synchronized refreshes, under 1% unexpected errors, and no sustained pool exhaustion | Error and pool goals met. The latency goal remained open for both spikes. |
| Photo pairs and sign-in | Separately measure p95 under 2.5 s for a roughly 0.44 MB pair during steady play and p95 under 2 s for arrivals of up to 25 users | Met in staged waves and steady traffic. A simultaneous 60-player upload burst exceeded the media latency target. |
| Data and recovery | Zero duplicate check-ins, wrong points, privacy leaks, lost confirmed writes or unresolved files. Return to ordinary latency under 1 s within a 15-second recovery interval | Met in this run. |
| Resources | Keep process memory below 80% of the deployed limit during the target workload and avoid sustained pool or worker queue saturation | Local peak API RSS was 201 MiB for the ramp. Hosted resource validation is pending. |

**Observed maximum** was 60 active virtual users, with 33.51 steady requests per second in the ramp and 34.53 in the short soak on local PostgreSQL. **Conservative operating recommendation** is up to 50 simultaneous steady players per warm environment with comparable measured resources and staggered uploads. This leaves headroom below the highest tested local level. Render Free/Supabase capacity remains unverified. Begin hosted validation at 10 on an authorized isolated staging deployment, monitor API/DB CPU and queues and Supabase signing latency, then advance to 25 and 50 only while the gates pass.

Remaining risks are the free API's cold start and CPU budget, shared-IP sign-in throttling, hosted storage uploads and cache misses, and greater WebSocket polling across many simultaneous competitions. The history response still grows with the user's archive, and the revision-lock map can grow with distinct competitions over long worker lifetimes. Capacity at larger datasets, larger photo sizes, many parallel rooms, or multi-hour sessions requires separate evidence. Physical-phone workloads also remain pending.

### Verification output

- Both SQLite and disposable PostgreSQL 17 runs reported `42 passed, 1 warning`. The existing warning comes from Starlette's HTTPX test client. Alembic reported `No new upgrade operations detected.` on both databases.
- OpenAPI export and TypeScript type generation produced no contract changes. Mobile `tsc --noEmit` exited successfully.
- The compiled web app completed the two-browser Classic, Party and private Battle rehearsal on the updated API with synthetic camera inputs. The largest timed button response was 379 ms. Native-device verification remains a separate gate.

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
