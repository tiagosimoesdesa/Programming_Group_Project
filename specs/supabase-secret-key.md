# Support current Supabase secret keys

## Why

Supabase recommends backend-only keys in the `sb_secret_...` format. Unlike the legacy JWT-based `service_role` key, a current secret key must be sent in the `apikey` header and must not be sent as an `Authorization: Bearer` token.

## What

- Read the current backend key from `SUPABASE_SECRET_KEY`.
- Send current secret keys only in the Supabase `apikey` header.
- Retain compatibility with the legacy `SUPABASE_SERVICE_KEY` setting and its JWT bearer header while deployments migrate.
- Keep every privileged key exclusively in the Python backend and provider dashboard.
- Update deployment examples and repository rules to use the current terminology.

## Out of scope

- Do not connect to or change the production Supabase project.
- Do not add real keys, passwords, connection strings, or provider values.
- Do not change application authentication, database models, migrations, or the mobile API.

## Done when

- Backend tests prove the header behaviour for both current and legacy keys.
- The complete backend test suite passes.
- `alembic check` reports no pending model operations.
- The diff contains no credentials or unrelated changes.
