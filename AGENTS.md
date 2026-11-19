# BEERREAL project rules

## Architecture

- Keep the teaching-staff-approved architecture: Python/FastAPI owns backend rules, authentication, permissions, persistence, scoring, scheduling, and validation; React Native/TypeScript owns the mobile and web interface.
- Prefer Python for backend work whenever it preserves functionality and quality. Do not introduce another language or framework without a documented team decision.
- Treat the backend as authoritative. Client-side timers, scores, permissions, and validation are presentational only and must not replace server enforcement.

## Start every task

- Read the relevant task specification in `specs/`, this file, `README.md`, and `CONTRIBUTING.md` before editing.
- Build one task on a branch named after it, created from an updated `main`. Never implement a task directly on `main`.
- Keep the task within its specification. If a requirement is ambiguous or conflicts with another rule, stop and ask rather than widening the scope.
- Do not have two agents edit the same working folder at the same time.

## Verification

- Run the relevant checks after every code change and include the final output as evidence. A statement that tests passed is not evidence by itself.
- Never edit, delete, weaken, or skip anything in `backend/tests/` merely to make a change pass. If a test appears wrong, explain the conflict with the specification and stop for review.
- Green automated tests are not the only proof. Manually exercise every untested `Done when` item in the running application.
- Backend checks: `cd backend`, then `uv run pytest -q` and `uv run alembic check` when models or migrations change.
- API changes require `uv run python -m scripts.export_openapi`, followed by `cd ../mobile`, `npm run api:types`, and `npm run typecheck`. Commit both generated contract files.
- Mobile-only changes require `cd mobile` and `npm run typecheck`. Camera, permission, layout, and multiplayer changes also require the relevant checks in `docs/DEVICE_TESTS.md` on physical phones.

## Data and security

- Never commit or paste real credentials, tokens, connection strings, passwords, `.env` files, databases, private photo URLs, or user data. Use ignored local environment files and provider dashboards; document only placeholder names in `.env.example` files.
- Tests must use local or disposable databases, never the production Supabase project.
- Record every database structure change in a new Alembic migration. Do not edit a migration that teammates may already have applied.
- Keep the Supabase service key on the Python backend only. Never expose it to the mobile/web bundle.
- If Supabase tools are connected, use project-scoped read-only access by default. Do not change or delete production tables or rows unless the task explicitly requires it and the user approves the exact action.

## Review and delivery

- Review the complete diff for unrelated changes, secrets, generated files, and personal data before committing.
- Use a focused pull request, wait for the `api` and `mobile` checks, and obtain a teammate review. The author does not merge their own pull request without that review.
- Leave `main` deployable: code on `main`, generated API contracts, migrations, documentation, and the public deployment must describe the same version.

