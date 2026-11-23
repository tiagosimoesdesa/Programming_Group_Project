# Validation record

Automated checks were run on Windows during implementation. Physical-device checks remain in `DEVICE_TESTS.md`.

## Pre-launch audit — 23 November 2026

### Scope and release decision

**NO-GO for public launch.** The audit started from `main` at `3e0adb4`. Core local journeys passed on SQLite, PostgreSQL, Chrome, and Edge. Production anonymous smoke checks passed for the landing page, API `/health`, and the web `/api/health` proxy. Release sign-off still needs hosted end-to-end and capacity verification, the physical iPhone/Android checks, and an approved privacy and retention process with a practical way to request account erasure. The Render dashboard checks were deferred by the project owner. The baseline public deployment and these audit-branch changes have separate verification records.

| Area | Implementation and coverage |
| --- | --- |
| Accounts | Expo sign-up, login, web session recovery and logout. FastAPI enforces account validation, normalizes usernames, hashes passwords with Argon2, rotates refresh sessions and checks web origins. The UI stores the Terms decision locally and opens the same document from Settings. Password recovery and account deletion are absent from the current feature set. |
| Competitions | Classic check-ins, dense standings, filters, paged feeds, reactions, spectators and recaps. Party adds timed challenges and voting. Battle adds teams, a lobby and private or public results. HTTP checks cover authoritative state and permissions. Browser rehearsals cover interaction and cross-session updates. |
| Profile and history | Username and avatar changes, permission settings, and personal hide, restore and removal of finished nights. Personal history removal preserves shared results and media. |
| Data and integrations | SQLAlchemy with Alembic, SQLite locally, PostgreSQL in a disposable cluster, private files locally, Supabase signing mocked in API tests, and the bundled Lisbon calendar with simulated rollout and mocked OpenAI responses. Render and Supabase production settings and live provider dependencies require separate verification. |
| Frontend | TypeScript and three Expo exports. Browser exercises included desktop, tablet and mobile-sized viewports, basic keyboard focus, camera permission handling, file picking, and simulated camera capture. Native camera hardware, screen readers, Safari and full WCAG 2.2 AA conformance remain outside the verified results. [WCAG 2.2](https://www.w3.org/TR/WCAG22/) |

### Verification results

The table counts named tests, browser journeys, or explicitly listed checks. Categories use different units and overlapping evidence, so their totals should be read separately. A blocked item needs equipment, an authorized environment, or a release decision. A check listed as never executed was outside the runtime coverage of this audit.

| Category | Tests executed | Passed | Failed | Blocked | Unit and coverage |
| --- | ---: | ---: | ---: | ---: | --- |
| Functional | 8 | 8 | 0 | 1 | Existing Chrome rehearsal groups covering Terms, session recovery, real browser entry points for all modes, login errors, countdown transitions, history, filters, reactions, profile, and photo retries. Hosted authenticated rehearsal blocked pending disposable hosted accounts. |
| Security | 4 | 3 | 1 | 2 | Existing defensive auth/upload/isolation checks as one group, locked PyPI advisory scan, scoped Git secret-pattern scan, npm advisory scan. Provider policy/configuration verification and privacy/erasure sign-off blocked. |
| Database | 4 | 4 | 0 | 1 | SQLite and PostgreSQL migration/drift checks, concurrent correctness and file audit, and recovery after a disposable PostgreSQL restart. Hosted backup restore was outside the authorized environment. |
| 40-user load | 8 | 6 | 2 | 1 | Three paced plateaus, three synchronized spike phases, the 10-minute soak, and recovery. The history and mixed upload/detail bursts missed the ordinary-operation latency gate. Hosted 40-user capacity remains blocked pending a comparable isolated environment. |
| Frontend | 18 | 18 | 0 | 2 | Five repeatable browser cases on each of Chrome and Edge, one typecheck, one SDK check, one three-platform export, and five axe-core screen scans. Physical-device acceptance and complete accessibility review blocked. |
| Performance | 3 | 2 | 1 | 1 | Steady API latency and local browser interaction timing met the initial goal. Synchronized traffic missed it. Hosted traces and cold-start distribution remain pending. |
| Regression | 160 | 160 | 0 | 0 | 80 pytest cases each on SQLite and PostgreSQL. OpenAPI and TypeScript regeneration produced no tracked diff. |

Existing defensive automated coverage verified login limits, refresh rotation, rejection of untrusted cookie origins, sensitive validation response redaction, private membership, host and spectator rules, signed photo expiry, upload format handling, and hidden Battle views. Code review traced SQLAlchemy database operations and storage and OpenAI client configuration. This was a targeted review using OWASP ASVS as a reference. Exploit development and attack execution were outside runtime coverage. [OWASP ASVS 5.0.0](https://asvs.owasp.org/)

Never executed on production during this audit: authenticated state-changing journeys, load, database failover, backup restore, private bucket and key-policy checks, and live OpenAI calls. Provider dashboard protection, retention, data-controller contact and erasure procedures still need team verification. Versioned local Terms acceptance serves contractual acknowledgement. The repository's [legal publication checklist](LEGAL_PUBLICATION_CHECKLIST.md) tracks the privacy review and unresolved provider questions. [GDPR official text](https://eur-lex.europa.eu/eli/reg/2016/679/oj)

### Findings and fixes

| Severity | Finding and affected component | Evidence and root cause | Fix and remaining risk |
| --- | --- | --- | --- |
| High | Public launch privacy and retention readiness, `docs/LEGAL_PUBLICATION_CHECKLIST.md` and account settings | The app can remove a night from personal history. The account and shared photos remain, and the repository documents gaps in approved erasure, retention, controller contact and provider recovery. | Open. Product and provider decisions are required. The audit preserved existing account and shared-history semantics. |
| Medium | Concurrent avatar replacements retained superseded photos, `backend/app/main.py` | Two normal, overlapping replacements for the same test account started with the same prior avatar. Both changes then tried to remove that same object. The new regression failed against the unchanged `main` snapshot with one extra file. | Fixed. Replacements read the prior object under a database row/write lock, then clean it up after commit. Synthetic concurrent upload tests leave one stored object and a working current URL on SQLite and PostgreSQL. Supabase object deletion still depends on provider availability. |
| Medium | Per-competition WebSocket locks accumulated, `backend/app/main.py` | A controlled run of 300 distinct completed revision reads on `main` left 300 locks. The lock map held strong references independently of the revision-cache expiry. | Fixed. Active and waiting callers keep the lock alive while inactive locks are reclaimed. The same diagnostic leaves zero locks. Tests verify shared concurrent reads and cancellation handling. |
| Medium | Signup checkbox state missing from web accessibility markup, `mobile/src/AuthScreen.tsx` | Axe flagged the age-attestation checkbox for missing `aria-checked`. The Expo web renderer used the checkbox role but did not reflect its native accessibility state as a web attribute. | Fixed. The browser regression confirms unchecked and checked values before submitting. Native assistive-technology behaviour needs device confirmation. |
| Medium | npm advisory in the Expo fingerprint toolchain, `mobile/package-lock.json` | `npm audit` listed three moderate package entries propagated from one `minimatch` advisory. The installed Expo 58 release uses fingerprint 0.21.10, which requires `minimatch` 10. The audit CLI proposes an Expo 52 downgrade. | Open pending a compatible upstream update. The audited Expo 58 dependency uses the package in build tooling. Review exposure separately if builds accept untrusted project or pattern configuration. [Advisory GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) |
| Medium | Synchronized requests exceed the latency target, `backend/scripts/capacity_test.py` | Two 40-client rehearsals showed a repeatable history burst and mixed photo/detail burst latency over one second. The synchronized login queue also exceeded three seconds at p95. | Open. The ordinary read/write mix passes and recovers after the burst. The collected worker, SQL and client timings below identify where to measure further on equivalent staging. |
| Low | Database availability presents a generic error, FastAPI connection handling | While the disposable PostgreSQL cluster was stopped, `/health` and the current-user request returned HTTP 500 without driver details. Both returned 200 on the first request after recovery, with the same account still available. | Automatic reconnection verified. An actionable temporary-unavailability response during a database outage remains pending. |
| Low | Terms viewport lacked explicit keyboard focus, `mobile/src/TermsAndConditions.tsx` | Axe flagged the scroll region without a declared tab stop. Chrome's default behaviour allowed keyboard scrolling during the first check. | Fixed with an explicit web tab stop. The browser test uses End to reach the acceptance threshold. |
| Low | Framing policy unverified, Render web landing response | The unauthenticated HTTPS landing page supplied HSTS, `nosniff` and a same-origin referrer policy. That response lacked `Content-Security-Policy` and `X-Frame-Options`. | Open for deployment review. Confirm embedding requirements and prefer an explicit `frame-ancestors` policy. |

The scoped filename and secret-pattern scan returned no matches in reviewed tracked files or reachable history. OSV returned 38 results for 38 locked Python runtime packages with no advisories. These scans cover their signatures and advisory feeds. The test run reported one upstream deprecation warning for FastAPI's Starlette HTTPX test client.

Axe-core 4.14.1 found zero violations on the settled Terms, login, sign-up, Tonight and Settings screens in Chrome at 390×844 with reduced motion. It marked 2–3 rules per screen for manual review. An earlier scan during normal-motion transitions flagged temporary contrast in Tonight actions. Contrast during transitions, Safari, screen readers and native controls still need manual verification.

### Reproduce and rehearse

Use the usual backend and mobile installation from the README. The committed browser runner exports the production web bundle, creates a disposable SQLite database and uploads directory, and serves the same-origin application on loopback. Install the Playwright-managed Chromium with `npx playwright-core install chromium` from `mobile`, or set `E2E_BROWSER` to an installed Chrome or Edge executable. Each browser case uses isolated synthetic accounts and, where applicable, simulated camera images.

```powershell
cd mobile
npm run test:e2e
npm run typecheck
npx expo install --check
npx expo export --platform all --max-workers 2
cd ../backend
uv run pytest -q
uv run --with psutil==7.2.2 python -m scripts.capacity_test --postgres-bin C:/path/to/postgresql/bin --levels 10 20 40 --seconds 25 --soak-seconds 600 --login-spike --output ../.tools/launch-audit-capacity.json
```

```text
SQLite:     80 passed, 1 warning in 56.82s
PostgreSQL: 80 passed, 1 warning in 69.58s (0:01:09)
Alembic:    No new upgrade operations detected.
Chrome:     tests 5, pass 5, fail 0
Edge:       tests 5, pass 5, fail 0
Expo:       Dependencies are up to date
OpenAPI and TypeScript contracts: git diff exit 0
Database outage: /me HTTP 500; /health HTTP 500
Database restored: /health and /me HTTP 200 on first request; both took 0.109 s
```

For presentation rehearsal, use two separate browser profiles and synthetic accounts in an approved environment. Have one host create a Classic night, the other join, then check in a synthetic photo pair, react, and open the finished recap. The five-case offline fallback also exercises Party voting and private Battle. Keep the local clone, dependencies and Chromium or Edge ready so `npm run test:e2e` can demonstrate the integrated journeys on loopback. Hosted demo accounts, sample rooms, and a physical-phone rehearsal are still pending.

### 40-user capacity and integrity

Two runs used one instrumented API worker, loopback PostgreSQL, local photo storage, and a Windows host with 16 logical CPUs. The workload seeded 24 archived nights per player and one shared Classic night, plus a host outside the 40-player count. Each virtual user signed in, joined, and performed a paced mix of feed and history reads, player filtering, feed pagination, archived-night opens, signed photo downloads, reactions, and 435,894-byte photo-pair uploads. Think times were 0.65–2.5 seconds. Twenty-seven participants held authenticated WebSockets. Recovery had 10 active HTTP clients while existing sockets stayed open. The driver, API and database shared the test host. Hosted storage, WAN latency and provider CPU limits require separate evidence.

The repeat used the final runner with median reporting. Times are milliseconds unless marked otherwise. Expected 401, 404 and 409 responses in the integrity stage count as successful assertions.

| Stage | Active players | Observed seconds | Requests | Failures | RPS | Mean | p50 | p95 | p99 | Ordinary p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Normal traffic | 10 | 25.14 | 148 | 0 | 5.89 | 58 | 50 | 115 | 142 | 97 |
| Moderate traffic | 20 | 25.17 | 308 | 0 | 12.24 | 79 | 59 | 127 | 169 | 112 |
| Target traffic | 40 | 25.14 | 606 | 0 | 24.10 | 78 | 68 | 150 | 236 | 137 |
| Synchronized login and profile reads | 40 | 4.21 | 80 | 0 | 18.99 | 1,151 | 306 | 3,689 | 4,092 | 74 |
| Three synchronized history waves | 40 | 4.34 | 120 | 0 | 27.64 | 712 | 649 | 1,310 | 1,409 | 1,310 |
| Synchronized uploads and detail reads | 40 | 3.34 | 80 | 0 | 23.99 | 1,869 | 1,875 | 3,095 | 3,274 | 2,668 |
| Sustained traffic | 40 | 600.16 | 14,430 | 0 | 24.04 | 88 | 75 | 180 | 281 | 160 |
| Recovery | 10 | 15.00 | 89 | 0 | 5.93 | 61 | 59 | 85 | 146 | 79 |

The repeat completed 16,157 total HTTP operations with zero unexpected failures. The first run completed 15,603 total operations with one history transport read error. Its 600.18-second soak delivered 23.18 RPS with one error in 13,909 requests (0.007%) and 273 ms overall p95. Both paced 40-user runs met the under-1-second ordinary latency and under-1% failure goals. Both missed the ordinary latency target for the synchronized read and upload/detail spikes. Browser interactions in the separate three-mode synthetic-camera rehearsal reached the expected view in 25–536 ms on the tested local host.

During the repeated soak, API RSS peaked at 124 MiB and the API averaged 61% of one logical core. PostgreSQL averaged 18% of one logical core and peaked at 250 MiB aggregate process RSS, which may count shared mappings more than once. SQL p95 was 38 ms and the API pool peaked at 12 of 15. At peak login, 32 sampled jobs were queued, API RSS reached 243 MiB, and SQL p95 was 36 ms. At peak mixed upload/detail, the general queue reached nine, the upload queue reached seven, pool use peaked at 11, and SQL p95 was 158 ms. History-spike client p95 was 1,310 ms while instrumented server p95 was 28 ms, suggesting that local client, connection, or scheduling delays contributed to that phase. These readings provide no evidence of PostgreSQL pool exhaustion during the spikes.

The final audit matched 1,006 accepted upload IDs to their persisted rows and photos and checked all 41 members' final scores. It found zero missing files, orphan files, database deadlocks or temporary spill bytes. Twelve duplicate upload requests mapped to one accepted submission, 12 concurrent reaction updates left one reaction for the account, and two simultaneous refresh requests produced exactly one successful rotation. The 27 connected viewers all reached the final revision. The separate full suite covered concurrent normalized usernames and avatar updates, cross-account access controls, and write rollback after a simulated storage failure.

**Capacity conclusion.** The app handled 40 paced users for ten minutes on this local PostgreSQL workload. The 40-user synchronized experience missed the latency target, and hosted capacity is still unverified. The report supports a local presentation rehearsal with staggered sign-ins and uploads. It does not establish production capacity.

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
