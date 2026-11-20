# Add the COUNT THE JOLS Home Screen icon

## Why

Players should be able to recognize COUNT THE JOLS on their iPhone after adding the website from Safari.

## What

- Use the supplied COUNT THE JOLS artwork for the website’s iPhone Home Screen icon. Fit the full lettering and glass inside a square 180 × 180 PNG.
- Serve the image at `/apple-touch-icon.png` so Safari can find it when adding the site to the Home Screen.

## Out of scope

- In-app branding, native launcher icons, and browser tab icons.

## Done when

- `npm run typecheck` passes and the Expo web export includes the square PNG at its root.
- On an iPhone, Safari shows the supplied artwork in Add to Home Screen, and tapping the added icon opens COUNT THE JOLS.
