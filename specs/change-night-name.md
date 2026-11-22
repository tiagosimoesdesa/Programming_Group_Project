# Change a night name

## Why

The host must choose a night name during creation, but currently cannot correct or update it afterwards.

## What

- The host can edit the night name from the competition screen after creation.
- The existing name is pre-filled and the host can save a trimmed name between 1 and 60 characters.
- The backend persists the new name and increments the competition revision so connected participants receive it.
- Players, spectators, and users outside the competition cannot rename it.
- Invalid names and failed requests show feedback without closing the editor.

## Out of scope

- Changing the game mode, invitation code, Battle teams, or any other night settings.
- Renaming a night from the home or history lists.

## Done when

- Backend tests cover a successful rename, permission checks, validation, and persistence.
- The generated OpenAPI and TypeScript contracts are current.
- `uv run pytest -q`, `uv run alembic check`, and `npm run typecheck` pass.
- On the running app, a host can edit the title and a non-host cannot see the edit control.
