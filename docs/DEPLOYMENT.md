# Deploy BEERREAL publicly

The production setup has three parts:

- **Supabase** stores PostgreSQL data and private photos.
- **Render Web Service** runs the Python/FastAPI API.
- **Render Static Site** serves the Expo web application over HTTPS.

Keep every database password and service key in the provider dashboards. Never paste secrets into this repository, the mobile environment, screenshots, issues, or pull requests.

## Supabase

1. Create a dedicated free Supabase project.
2. Create a **private** Storage bucket called `beerreal`, with a 5 MB upload limit and `image/jpeg` allowed. The backend re-encodes images and strips metadata.
3. In **Project Settings > Data API**, copy the project URL. In **API Keys**, create or copy a backend secret/service-role key. Keep both in Render; never put the secret key in the frontend.
4. In **Connect**, copy the PostgreSQL **session pooler** URL. Change its prefix to `postgresql+psycopg://`. URL-encode special characters in the password and add `sslmode=require` to the connection query parameters.
5. Migrations enable row-level security without client policies on application tables. The trusted backend database role must own those tables or have the required privileged access. Mobile clients only access FastAPI.

Signed photo links are temporary bearer links; recipients can use them until they expire.

## Render

1. Merge this deployment configuration into `main`, then sign in to Render using the repository owner's GitHub account.
2. Select **New > Blueprint**, connect this repository, and use the root `render.yaml`. The Blueprint creates `beerreal-api` and `beerreal-web`.
3. Supply the prompted variables using the values below. The Blueprint generates `JWT_SECRET`; keep it stable across deployments.

### `beerreal-api` variables

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Supabase session-pooler URL beginning `postgresql+psycopg://` and ending with `sslmode=require` |
| `SUPABASE_URL` | Supabase project URL, such as `https://PROJECT.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Backend-only Supabase secret/service-role key |
| `PUBLIC_URL` | Final API URL, such as `https://beerreal-api.onrender.com` |
| `CORS_ORIGINS` | JSON list containing the final frontend origin, such as `["https://beerreal-web.onrender.com"]` |

### `beerreal-web` variables

| Variable | Value |
| --- | --- |
| `EXPO_PUBLIC_WEB_API_URL` | Final API URL, such as `https://beerreal-api.onrender.com` |

4. If Render assigns a suffixed hostname, replace the example hostnames with the exact URLs shown in the Render dashboard and redeploy both services.
5. The API build installs locked Python dependencies; startup applies migrations and launches Uvicorn. The frontend build exports the Expo web bundle to `dist` and serves it over HTTPS.
6. Open `https://YOUR-API.onrender.com/health`; it must return `{"status":"ok"}`.
7. Open the frontend URL. Production builds open the live application directly; append `?studio=1` only when you want the desktop design preview. Test registration, login, creating and joining Classic, Party, and Battle games, photo access, voting, standings, and persistence after an API restart.
8. For native Expo Go testing over the internet, set `EXPO_PUBLIC_API_URL` in the local `mobile/.env` to the Render API URL and restart Expo. The phone no longer needs to share Wi-Fi with the development computer, but it still needs internet access.

Render only prompts for `sync: false` variables when a Blueprint first creates a service. For an existing service, add or update them under **Environment** in the Render dashboard.

Render's free filesystem is ephemeral: do not deploy SQLite or local photo storage there. Use Supabase for both. Free services have usage limits and may sleep/pause; monitor provider dashboards. See [Render free services](https://render.com/docs/free) and [Supabase pricing](https://supabase.com/pricing).

The Render command trusts proxy headers because Render is the ingress. On other hosts, configure trusted proxy IPs explicitly so login throttling uses trustworthy client addresses.

## Native builds later

`mobile/eas.json` includes Android internal APK and production profiles. Set up your Expo project and choose unique application identifiers before distribution. EAS can build from Windows; iPhone distribution requires Apple developer enrollment. The initial Expo Go workflow does not require a paid Apple account.

## Operational follow-up

- Do not log passwords, tokens, private photo URLs, or service keys.
- Define photo retention and protect provider accounts/backups before public use.
- Partial uploads are cleaned up best-effort; process termination/storage outages can leave orphaned files. Audit storage against database references before deleting anything.
- Periodically prune expired refresh sessions and stale login-attempt records during production hardening.
- Complete PostgreSQL and physical-device acceptance checks before broader rollout.
