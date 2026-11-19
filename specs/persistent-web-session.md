# Persist secure web sessions

## Why

Native sessions already survive app restarts in Expo SecureStore, but browser sessions exist only in memory and disappear whenever the deployed page reloads. Requiring the password on every visit adds friction; removing authentication would expose private rooms and photos to impersonation.

## What

- Keep the existing username/password account and native token flows unchanged.
- Add dedicated browser register, login, refresh, and logout endpoints.
- Store the browser refresh token in a host-only, `HttpOnly` cookie that JavaScript cannot read.
- Keep access tokens in memory, rotate refresh tokens, expire browser sessions after 30 days, and clear the cookie on logout or invalid refresh.
- Reject cookie-authentication requests unless their `Origin` is an explicitly configured frontend origin.
- Route deployed browser HTTP requests through the Render static-site origin so the cookie remains first-party; keep WebSockets connected directly to the API service.
- Restore a valid browser session automatically when the app opens or reloads.

## Out of scope

- Do not remove passwords, account authentication, legal-age confirmation, or explicit logout.
- Do not change native session storage, user profiles, database models, or migrations.
- Do not add password recovery, passkeys, social login, or a custom domain.

## Done when

- Backend tests cover trusted and rejected origins, cookie flags, registration, rotation, invalid reuse, logout, and the unchanged native token flow.
- The OpenAPI schema and generated TypeScript client are current.
- Backend tests, Alembic check, TypeScript checking, Expo dependency checking, and production exports pass.
- The deployed web app remains signed in after a page reload, signs out explicitly, and does not expose a refresh token to JavaScript.
