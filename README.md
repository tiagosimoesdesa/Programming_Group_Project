# COUNT THE JOLS

COUNT THE JOLS is a private, camera-first application for social nights with friends. Players join invitation-only competitions, submit a rear photo and selfie for each check-in, and follow live scores through Classic, Party, or Battle modes.

The interface runs on React Native and Expo for iPhone, Android, and the web. A Python/FastAPI backend is authoritative for authentication, permissions, persistence, scheduling, validation, and scoring.

Working with the group? Read [CONTRIBUTING.md](CONTRIBUTING.md) before creating a branch or sharing changes.

## Team Members

The teaching staff approved this five-person team:

- Rodrigo Carvalho — 62487
- Afonso Nobre — 62474
- Tiago Sá — 78344
- João Cardoso — 62478
- Gonçalo Silva — 81205

## Live Application

- **Current version:** 0.1.0
- **Public application:** [beerreal-web.onrender.com](https://beerreal-web.onrender.com)
- **API health:** [beerreal-api.onrender.com/health](https://beerreal-api.onrender.com/health)
- **Deployment branch:** `main`

The web application and API run on Render over HTTPS. Supabase provides PostgreSQL and the private `beerreal` photo bucket. Production credentials are stored only in provider dashboards and are never included in the mobile or web bundle.

Render free services may need time to wake after inactivity. The health endpoint returns `{"status":"ok"}` when the API is ready.

On iPhone, open the public application in Safari and select **Add to Home Screen**. The installed web app uses a dedicated icon, an edge-to-edge dark layout, and safe-area handling.

## Project Overview

COUNT THE JOLS supports private, invitation-only nights with multiple active competitions per user. A host creates a night, selects its mode, and shares a join code. Players capture a rear photo followed by a selfie, review or retake the pair, confirm the visible drink quantities, and submit.

Check-ins are trust-based. Players distinguish regular beers below 0.5 L from pints of exactly 0.5 L:

- Each regular beer is worth **1 Jol**.
- Each pint is worth **2 Jols**.
- Each drink counts as one beer independently of its point value.

The application cannot prove consumption, ownership, or that a drink is new. Scores change only after the backend accepts a confirmed submission.

Camera access is offered after sign-in. A player may continue with **Later** and enable access when first opening the camera. Gallery access is available only for profile pictures, never for competition submissions.

## Main Features

### Classic

- Scores accepted drink photo pairs using the confirmed Regular and Pint quantities.
- Shows a private feed, live standings, shared dense ranks, reactions, and player filters.
- Allows only the host to finish the night.
- Presents final standings, an animated podium, and each player's first and last Night moments.

### Party

- Requires the host and at least one additional player before starting.
- Reveals one safe photo challenge every 30 minutes for up to eight hours.
- Lets each player submit one dedicated rear-photo/selfie pair per challenge.
- Uses majority voting enforced by the backend.
- Awards two bonus Jols for each approved challenge pair.

### Battle

- Places players into two host-named teams for a fixed-duration competition.
- Allows team selection and switching in the lobby, then locks membership when the host starts.
- Lets the host show opposing scores and photos live or hide them until the end.
- Shows a warning during the final 10% of the timer.
- Reveals final team totals and each team's member ranking when time expires.

### Social, accounts, and history

- Username/password accounts, optional avatars, and legal-age self-attestation.
- Multiple active competitions and private invitation codes.
- Full-screen photo pairs and one changeable reaction per person per photo.
- Spectator codes for invited viewers who may watch and react but cannot post, vote, or enter standings.
- Finished-night history, final standings, and first/last moments for every player.
- Live updates through authenticated WebSockets, with polling fallback and foreground resynchronization.

## Technology Stack

| Area | Technology | Responsibility |
| --- | --- | --- |
| Mobile and web | React Native, Expo, TypeScript | Screens, camera flow, interaction, presentation, and live updates |
| Backend API | Python, FastAPI | Authentication, permissions, validation, scoring, scheduling, and authoritative game rules |
| Database | SQLite locally; PostgreSQL on Supabase | Accounts, competitions, submissions, votes, scores, and history |
| Photo storage | Local private files in development; private Supabase Storage in production | Rear photos, selfies, and profile images |
| Database migrations | Alembic | Versioned and reproducible database changes |
| Authentication | Argon2, short-lived access tokens, rotating refresh tokens | Password protection and session security |
| Hosting | Render | Public FastAPI service and Expo web application |
| API contract | FastAPI OpenAPI and openapi-typescript | Synchronized backend schema and generated TypeScript client |

The teaching staff approved the Python/FastAPI backend with a React Native/TypeScript frontend because the project needs a camera-first interface and real-time multi-user interaction. Do not change this architecture without a documented team decision and teaching-staff approval.

## Installation & Setup

### Prerequisites

Install:

- Node.js 24 LTS or newer, including npm.
- Python 3.12.
- [uv](https://docs.astral.sh/uv/getting-started/installation/).
- Expo Go compatible with SDK 58 for native phone testing.

For local phone testing, connect the development computer and phones to the same private Wi-Fi. Guest networks may isolate devices. The public deployment uses HTTPS and does not require the same network.

The Expo Go workflow does not require a paid Apple account. Later iPhone distribution through EAS cloud builds requires Apple developer enrollment.

### Backend

From the project folder:

```powershell
cd backend
Copy-Item .env.example .env
uv sync --frozen
uv run python -c "import secrets; print(secrets.token_hex(32))"
```

Put the generated value in `JWT_SECRET` inside `backend/.env`. Run `ipconfig`, find the computer's Wi-Fi IPv4 address, and set:

```text
PUBLIC_URL=http://YOUR_PC_IP:8000
```

Keep the default SQLite database and `STORAGE_MODE=local`, then start the API:

```powershell
uv run alembic upgrade head
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Open `http://YOUR_PC_IP:8000/health` on every test phone. It should return `{"status":"ok"}`. Allow Python through Windows Firewall on private networks if prompted.

Local API documentation is available at [http://localhost:8000/docs](http://localhost:8000/docs).

### Mobile application

In a second PowerShell terminal:

```powershell
cd mobile
Copy-Item .env.example .env
npm ci
```

Set the following value in `mobile/.env`:

```text
EXPO_PUBLIC_API_URL=http://YOUR_PC_IP:8000
```

Start Expo:

```powershell
npm start
```

Scan the QR code with the iPhone Camera app or Android Expo Go. Restart Expo after changing environment values. A Metro tunnel exposes the JavaScript bundle but not the local Python API; use the same Wi-Fi or point `EXPO_PUBLIC_API_URL` to the hosted HTTPS API.

Never put backend secrets in `mobile/.env`.

### Convenience launchers

After dependencies and local environment files are configured, the repository-root launchers can start the existing installations:

```powershell
./start-backend.ps1
./start-mobile.ps1
```

### Desktop design preview

Run:

```powershell
./start-preview.ps1
```

Then open [http://localhost:8082](http://localhost:8082). The studio renders the real mobile components inside a resizable phone frame and provides welcome, login, registration, device-size, reset, and simulated-error controls.

Choose **Live app** and start the backend to use real accounts and data. The browser preview defaults to `http://localhost:8000`; override it with `EXPO_PUBLIC_WEB_API_URL` when necessary. This preview helps with layout and interaction but does not replace native camera and permission testing.

Browser sessions use a rotating, host-only `HttpOnly` refresh cookie and may remain signed in for up to 30 days; access tokens stay in memory. Backend CORS allows localhost and 127.0.0.1 on port 8082 by default. Set `CORS_ORIGINS` to a JSON list only when another trusted preview origin is required.

## Testing & Validation

Run the complete automated verification from the project folder:

```powershell
cd backend
uv run pytest -q
uv run alembic check
uv run python -m scripts.export_openapi
cd ../mobile
npm run api:types
npm run typecheck
npx expo install --check
```

`backend/openapi.json` and `mobile/src/generated/api.ts` are generated contract files. Regenerate and commit both after API changes.

Set `TEST_DATABASE_URL` only to a disposable PostgreSQL database when running PostgreSQL tests. The test suite drops and recreates application tables; never point it at production Supabase.

To exercise a running local backend with 25 authenticated users joining, uploading photos, refreshing the feed, and receiving WebSocket updates at the same time, run:

```powershell
cd backend
uv run python -m scripts.load_test --users 25 --read-rounds 3
```

The load test refuses remote URLs by default so it cannot accidentally create test accounts or photos in production. It reports failures and p50, p95, and maximum latency for each operation.

Further evidence and manual checks:

- [Validation record](docs/VALIDATION.md)
- [Physical-device acceptance tests](docs/DEVICE_TESTS.md)
- [Course project checklist](docs/COURSE_CHECKLIST.md)
- [Deployment and production verification](docs/DEPLOYMENT.md)

Before submission, record the final output from the current `main`, verify a fresh clone, complete the relevant device checks, and keep the deployed application aligned with the same commit.

### Collaboration workflow

Create one focused branch per task from an updated `main`. Review the complete diff, run the relevant checks, push the branch, and open a pull request. Wait for the `api` and `mobile` checks and obtain a teammate review before merging. The author does not merge their own pull request without that review.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the complete workflow.

## Architecture & Technical Details

### Repository layout

- `backend/`: FastAPI application, authoritative game rules, persistence, migrations, storage integration, generated OpenAPI contract, and automated tests.
- `mobile/`: React Native/Expo screens, camera flow, authenticated client, live subscriptions, web entry point, and generated TypeScript API types.
- `docs/`: deployment, validation, device-testing, and course-readiness records.
- `specs/`: reviewed task specifications and acceptance criteria.
- `render.yaml`: Render Blueprint for the API and web services.

### Authoritative backend and concurrency

The backend owns timers, scores, membership, permissions, validation, Party schedules and votes, Battle privacy, and competition closure. Client-side displays are presentational.

Database locks serialize submissions, joins, and finishing for each competition. SQLite uses its database write lock; PostgreSQL uses per-event row locks. Scores are derived from accepted records, and idempotency prevents retries from awarding duplicate points.

WebSockets authenticate through their first message and observe database revisions every two seconds. Mobile polling runs every eight seconds while disconnected and resynchronizes after reconnecting or returning to the foreground. This approach suits small groups; larger deployments should use a shared event broker.

### Authentication, privacy, and storage

- Passwords are hashed with Argon2.
- Access tokens expire within 15 minutes.
- Native refresh tokens rotate and remain in SecureStore.
- Web refresh tokens rotate through a host-only, `HttpOnly` cookie; access tokens remain in memory.
- Login attempts are throttled.
- Backend endpoints enforce member, host, spectator, voting, team, and hidden-result permissions.
- Private photo links are signed and expire after ten minutes.
- The Supabase secret key remains on the Python backend and is never exposed to clients.

Feed pages contain 20 photos. Active views periodically refresh temporary links. Gallery access is restricted to profile pictures; competition photos must come from the camera flow.

### Scoring and migrations

The backend defines drink weights in `backend/app/scoring.py`. `beer_count` stores the total number of drinks in a photo, while `pint_count` stores how many are pints. Regular quantity is `beer_count - pint_count`.

For example, three regular beers and two pints produce five beers and seven Jols. Party challenge bonuses are added to leaderboard points but never to beer counts. Equal point totals share a dense rank such as 1, 1, 2.

Apply `uv run alembic upgrade head` before starting an updated backend:

- Migration `0006` preserves historical quantities and treats older drinks as regular beers.
- Migration `0007` adds Battle settings and team membership.
- Migration `0008` reconciles historical Party approvals with their recorded votes.

### Production deployment

Render serves the Expo web export and FastAPI API. Browser HTTP traffic uses the frontend's same-origin `/api` proxy so refresh cookies remain first-party; WebSockets connect directly to the API. Supabase supplies PostgreSQL and private photo storage.

Production setup, environment-variable names, persistence checks, and recovery guidance are documented in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Never commit provider credentials, connection strings, `.env` files, databases, uploaded photos, or private user data.

## Limitations & Future Improvements

Current first-release limits:

- Failed captures remain available only during the current app session; there is no offline background upload queue.
- Password recovery, passkeys, and social login are not implemented.
- WebSocket database polling is intended for small groups rather than large-scale deployments.
- Invitation sharing is manual; there is no public group directory or automatic invitation-link workflow.
- Advanced statistics, achievements, sounds, push notifications, and result-card exports are deferred.
- Age gating is self-attestation.

Before a broader public launch, the project needs formal privacy and retention policies, account deletion, moderation and reporting, stronger age controls, provider backup/retention procedures, and distribution review.

For the course release, prioritize stable integrated workflows, production verification, physical-device acceptance, and a rehearsed demonstration over additional last-minute features.
