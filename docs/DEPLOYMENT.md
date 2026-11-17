# Deploy the shared backend

## Supabase

1. Create a dedicated free Supabase project.
2. Create a **private** Storage bucket called `beerreal`, with a 5 MB upload limit and `image/jpeg` allowed. The backend re-encodes images and strips metadata.
3. Keep the project URL and backend service-role key in the hosting environment. Do not create anonymous bucket policies or put these credentials in the mobile app.
4. Use the PostgreSQL **session pooler** URL, changing its prefix to `postgresql+psycopg://`. URL-encode special characters in the password; add `sslmode=require` to the connection query parameters.
5. Migrations enable row-level security without client policies on application tables. The trusted backend database role must own those tables or have the required privileged access. Mobile clients only access FastAPI.

Signed photo links are temporary bearer links; recipients can use them until they expire.

## Render

1. Push the repository to your Git provider and create a Render Blueprint using `render.yaml`.
2. Supply `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `PUBLIC_URL` (your HTTPS service URL), and bucket name. The Blueprint generates `JWT_SECRET`; keep it stable across deployments.
3. The build installs locked Python dependencies; startup runs migrations and Uvicorn. Start with one instance. Coordinate migrations separately before scaling deployments.
4. Verify `/health`, then test registration, both photo uploads, and persistence after a service restart.
5. Set the mobile `EXPO_PUBLIC_API_URL` to the HTTPS service URL and restart Expo. Phones can now use different networks.

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
