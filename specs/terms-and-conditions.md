# Terms and Conditions

## Why

COUNT THE JOLS needs a clear first-use agreement tailored to its invitation-only, camera-first competition features. People must understand the rules, photo visibility, alcohol-related responsibilities, data handling, and service limitations before entering the app. The same current terms must remain available in Settings, while contractual acceptance stays separate from any optional GDPR consent.

## What

- On first launch, block authentication and every normal app feature behind the complete Terms & Conditions.
- Require the person to reach the end of the scrollable document before **Accept** is enabled.
- Persist the accepted document version and acceptance time locally without attaching extra personal data to the account.
- Persist a decline decision and show a respectful **We Understand Your Decision** screen with the specified copy and a route back to review the terms.
- A new material document version invalidates an older acceptance and requires review and acceptance again.
- Add **Terms & Conditions** beside Privacy in Settings, using the same navigation and visual conventions; opening it never changes acceptance state.
- Use one versioned content source for first-use and Settings.
- Expand the existing Privacy page so its description of actual data, visibility, providers, lawful bases, retention gaps, and GDPR rights is consistent with the terms.
- Do not send the local acceptance record to the API, treat acceptance as consent to optional processing, or add analytics.

## Out of scope

- Creating an unverified legal entity, address, email, DPO, retention period, international-transfer mechanism, or alternative-dispute-resolution body.
- Adding account deletion, content reporting/moderation, stronger age verification, or provider configuration not already present.
- Changing authentication, competition rules, scoring, photo visibility, or backend storage.
- Merging or deploying the branch.

## Done when

- First launch shows the current terms before session restoration or authentication.
- Accept is disabled until the bottom is reached; successful acceptance enters the app and survives reopening.
- Decline shows the required screen, survives reopening, blocks the app, and **Review Terms & Conditions** returns to the document.
- A stored acceptance for an older version does not unlock the app.
- Settings → Terms & Conditions renders the same complete current document without an acceptance prompt.
- Android back navigation returns legal pages to Settings and cannot bypass the first-use gate.
- Mobile type checking and a production web export pass; the backend suite remains green.
- Manual validation covers first launch, accept, decline, reopen, review from Settings, storage failure, and simulated version update.

