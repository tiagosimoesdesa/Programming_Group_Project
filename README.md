# BEERREAL

Working with the group? Read [the collaboration workflow](CONTRIBUTING.md) for branches, reviews, and sharing changes.

A private, camera-first mobile app for nights with friends. React Native / Expo powers the iPhone and Android app; Python / FastAPI powers accounts, event rules, scoring, and live updates.

## Included

- Charcoal/yellow interface, onboarding, username/password accounts, optional avatars, and legal-age self-attestation.
- Private competitions with shareable invitation codes and multiple active events per user.
- Host-selected **Classic** and **Party** modes before the invitation code is created. Classic scores drink photo pairs; Party adds timed, voted photo challenges to the same leaderboard.
- Rear camera → selfie → preview/retake → submit. Gallery access is available **only for profile pictures**.
- Private photo feed, live standings, shared ranks, host-only finish, top-three rank groups, and history.
- Player filters, full-screen photo pairs, and one changeable reaction per person per photo.
- Party Mode starts when the host is ready and at least two players are present. It reveals one safe photo challenge every 30 minutes for up to eight hours; each approved rear-photo/selfie pair earns two bonus points.
- Host-generated spectator codes let invited friends from other groups watch, react, and revisit the night without posting, voting, or appearing in the standings. Join them using the normal invitation-code form. There is no public group directory.
- Argon2 passwords, short-lived access tokens, rotating refresh tokens in SecureStore, login throttling, temporary private photo URLs, and idempotent scoring.
- SQLite/private files for local development; PostgreSQL/Supabase Storage and Render configuration for hosting.

Check-ins are trust-based. Each accepted photo pair is one beer/one point; the app cannot verify consumption or that a drink is new. Only confirmed submissions change the score.

## Requirements

## Desktop design preview

Run `./start-preview.ps1` from the project folder, then open http://localhost:8082. The desktop studio displays the actual mobile components inside a resizable phone frame with welcome, login, and registration shortcuts. UI edits update automatically. You can switch device sizes, reset a screen, and simulate a form error without creating accounts.

Choose **Live app** to use the real backend (start `./start-backend.ps1` too). Browser sessions stay in memory and reset on reload. The desktop preview uses `http://localhost:8000`; override it with `EXPO_PUBLIC_WEB_API_URL` if needed. Backend CORS allows only localhost/127.0.0.1 on port 8082 by default; use a JSON `CORS_ORIGINS` environment value for other trusted preview origins. This browser preview helps with layout and interaction; it does not replace testing native cameras and permissions on your phones.

If dependencies and local environment files are already configured, run `./start-backend.ps1` and `./start-mobile.ps1` in two PowerShell terminals from this folder. These launchers use the installed project dependencies without requiring npm/uv on the launch path (Node itself must be available).

Install Node.js 24 LTS or newer (including npm), Python 3.12, and [uv](https://docs.astral.sh/uv/getting-started/installation/). Connect both phones and your PC to the same private Wi-Fi.

Use Expo Go compatible with SDK 58 from the App Store or Google Play. See the [Expo download page](https://expo.dev/go) for compatible builds. Later iPhone distribution through EAS cloud builds requires Apple developer enrollment.

## Run the Python backend

In PowerShell, from the project folder:

```powershell
cd backend
Copy-Item .env.example .env
uv sync --frozen
uv run python -c "import secrets; print(secrets.token_hex(32))"
```

Put the generated value in `JWT_SECRET` in `backend/.env`. Run `ipconfig`, find your Wi-Fi IPv4 address, and set `PUBLIC_URL=http://YOUR_PC_IP:8000`. Keep the default SQLite database and `STORAGE_MODE=local`.

```powershell
uv run alembic upgrade head
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Open `http://YOUR_PC_IP:8000/health` on each phone; it should return `{"status":"ok"}`. Allow Python through Windows Firewall on private networks if prompted. Guest Wi-Fi can isolate devices. Local HTTP is only for private-network development; hosted deployments use HTTPS.

API documentation: `http://localhost:8000/docs`.

## Run the mobile app

In a second PowerShell terminal:

```powershell
cd mobile
Copy-Item .env.example .env
npm ci
```

Set `EXPO_PUBLIC_API_URL=http://YOUR_PC_IP:8000` in `mobile/.env`, then run:

```powershell
npm start
```

Scan the QR code with the iPhone Camera app or Android Expo Go. Keep both terminals running. Restart Expo after changing environment values. Register separate accounts on the phones, create a competition on one, and join with its code on the other.

A Metro tunnel alone does not expose the Python API. Use the same Wi-Fi or deploy the API to HTTPS hosting. Never put backend secrets in the mobile environment.

## Checks and API contracts

```powershell
cd backend
uv run pytest -q
uv run python -m scripts.export_openapi
cd ../mobile
npm run api:types
npm run typecheck
npx expo install --check
```

`backend/openapi.json` and `mobile/src/generated/api.ts` are generated from FastAPI. Regenerate them after API changes. Set `TEST_DATABASE_URL` to a **disposable** PostgreSQL database to run tests there; the test suite drops/recreates application tables.

See [device acceptance tests](docs/DEVICE_TESTS.md) and [deployment instructions](docs/DEPLOYMENT.md). Cloud services are not provisioned automatically.

For the public course deployment, the included Render Blueprint creates both the Python API and the Expo web site. Supabase provides production PostgreSQL and private photo storage. Follow the deployment guide, then add the final public application URL and all group members' names and student numbers to this README before submission.

The [validation record](docs/VALIDATION.md) lists completed checks, remaining device/hosting work, and the SDK 54 build-tool dependency advisories. Review those before public distribution.

## Architecture and first-release limits

- `mobile/`: screens, reusable UI, authenticated HTTP client, camera flow, and live subscriptions.
- `backend/`: API, database models/migrations, image validation/storage, and tests.
- Database locks serialize submissions, joins, and ending for each event; scores come from accepted records. SQLite uses its database write lock; PostgreSQL uses per-event row locks.
- Party schedules, active-round checks, majority voting, and combined scoring are enforced by Python on the server. The mobile countdown is presentational; server time is authoritative.
- WebSockets authenticate through their first message and observe database revisions every two seconds. This works across workers for small groups; larger scale should use a shared event broker. Mobile polling runs every eight seconds while disconnected, with resync on foreground/reconnect.
- Feed pages contain 20 photos. Live refresh returns to the latest page. Signed URLs last ten minutes; active event views refresh periodically.
- Failed captures stay available during the current app session. Offline background queues are not implemented.
- Password recovery is deferred. Logout revokes the refresh token; issued access tokens expire within 15 minutes.
- Age gating is self-attestation. Public launch needs privacy/retention policies, account deletion, moderation/reporting, age controls, and distribution review.
- Advanced statistics, achievements, sounds, push notifications, automatic invitation links, and result-card exports are deferred.
