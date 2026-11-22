# Add a verified daily celebration card

## Why

The Tonight screen should offer one light, shareable fact tied to the current calendar date without inventing events, exposing provider credentials, or making an external content service part of the scoring and game rules.

## What

- Show a gold-outlined daily card in the Tonight screen layout from the supplied reference image.
- Place it immediately below the Tonight heading when there is no active night and below the Start/Join actions when a night is active.
- Show the Lisbon date, the exact lead-in `I was not going to drink today, but...`, the celebration title, and the fact. Render the card as static content with no source displayed.
- Have FastAPI select and persist at most one card per Lisbon calendar date for all users.
- When `OPENAI_API_KEY` is configured, use the Responses API with web search to look for a real festival, holiday, tradition, or positive anniversary for the exact date. Vary the preferred theme, require date evidence and keep the source returned by the search for backend records.
- Prepare cards for the next seven Lisbon dates when the backend starts and check for missing cards every six hours. A failed attempt leaves that future date available for a later retry. Serve saved cards directly and try OpenAI on demand when today's card has yet to be prepared.
- Keep the OpenAI key on the backend. Send only the calendar date and content requirements, never user or competition data.
- If OpenAI is unavailable, use a bundled fixed-date observance for today's month and day, including 29 February. Replace any Gregorian calendar-arithmetic card left in storage by the previous version when its date is requested.

## Out of scope

- Do not change scoring, competition creation, invitations, authentication, or permissions.
- Do not personalize facts from user data or drinking history.
- Do not instruct users to consume alcohol or turn the card into a challenge.
- Do not add an administrative content editor or a client-side OpenAI integration.

## Done when

- A migration creates persistent daily-card storage and Alembic reports no pending model operations.
- Backend tests cover cached cards, one persisted card per date, the seven-day buffer and retries, date and source checks, and missing providers.
- OpenAPI and generated TypeScript types are current, backend tests pass, and mobile TypeScript checking passes.
- Automated coverage proves a valid sourced fallback exists for all 366 dates in a leap year and remains correct for common years.
- The card matches the supplied empty-night and active-night placements, shows the required lead-in and fact without a link, and checks for a new card when Tonight returns to the foreground.
- Small-phone, iPhone, Android, and production-web layout remain recorded as physical/deployed acceptance work where they cannot be automated.
