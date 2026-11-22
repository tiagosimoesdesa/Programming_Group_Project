# Add a verified daily celebration card

## Why

The Tonight screen should offer one light, shareable fact tied to the current calendar date without inventing events, exposing provider credentials, or making an external content service part of the scoring and game rules.

## What

- Show a gold-outlined daily card in the Tonight screen layout from the supplied reference image.
- Place it immediately below the Tonight heading when there is no active night and below the Start/Join actions when a night is active.
- Include the exact lead-in `I was not going to drink today, but...`, followed by the verified celebration title and fact, the Lisbon date, and a clickable source.
- Have FastAPI select and persist at most one card per Lisbon calendar date for all users.
- When `OPENAI_API_KEY` is configured, use the Responses API with web search and structured output to find a light festival, holiday, tradition, sport, culture, or science anniversary and retain only a source returned by the search.
- Keep the OpenAI key on the backend. Send only the calendar date and content requirements, never user or competition data.
- Prefer a pre-verified dated celebration fallback when available. For every other valid date, return a sourced Gregorian-calendar fact calculated by the backend, so provider failure never leaves a date without a correct card.

## Out of scope

- Do not change scoring, competition creation, invitations, authentication, or permissions.
- Do not personalize facts from user data or drinking history.
- Do not instruct users to consume alcohol or turn the card into a challenge.
- Do not add an administrative content editor or a client-side OpenAI integration.

## Done when

- A migration creates persistent daily-card storage and Alembic reports no pending model operations.
- Backend tests cover cached cards, one persisted card per date, source validation, fallback behavior, and unavailable providers.
- OpenAPI and generated TypeScript types are current, backend tests pass, and mobile TypeScript checking passes.
- Automated coverage proves a valid sourced fallback exists for all 366 dates in a leap year and remains correct for common years.
- The card matches the supplied empty-night and active-night placements, includes the required lead-in and fact, and opens its source without blocking Tonight when the optional provider is unavailable.
- Small-phone, iPhone, Android, and production-web layout/source-link behavior remain recorded as physical/deployed acceptance work where they cannot be automated.
