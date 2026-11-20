# Safari edge-to-edge layout

## Why

The deployed web app leaves white areas above and below the interface on iPhone Safari. The app background should continue behind Safari's translucent system and browser controls, while interactive content remains inside the device safe areas.

## What

- Render the web viewport edge to edge on devices with display cutouts and safe areas.
- Use the app's existing dark background while the web bundle loads and behind translucent browser controls.
- Keep status-bar icons readable and keep text, buttons, and navigation inside the existing safe areas.
- Apply the behavior to every screen without changing any game, account, camera, scoring, or Battle behavior.

## Out of scope

- Hiding Safari's own status, address, or navigation controls.
- Changing screen designs, spacing, colors, navigation, or native layouts.
- Adding PWA installation or offline behavior.

## Done when

- `npm run typecheck` passes.
- `npx expo export --platform web` succeeds.
- The exported HTML contains `viewport-fit=cover`, the dark color scheme, and the configured theme color.
- On the deployed site in iPhone Safari, no white strip appears above or below the app, the app background is visible behind translucent browser controls, and all interactive content remains unobscured.
- Desktop web and Android Chrome retain their existing layout and scrolling behavior.
