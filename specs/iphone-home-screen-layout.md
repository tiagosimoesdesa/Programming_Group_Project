# Fit the iPhone Home Screen web app to the display

## Why

When COUNT THE JOLS opens from its iPhone Home Screen icon, a white band appears behind the clock, signal, Wi-Fi, and battery icons above the dark app background.

## What

- Extend the dark web app background behind the iPhone status bar and home indicator.
- Fit the layout to the device viewport and keep interactive content inside the device's safe area.

## Done when

- `npm run typecheck` passes and the Expo web export includes the edge-to-edge viewport and iPhone Home Screen status-bar settings.
- On a physical iPhone, add the web app from Safari and open it from the icon. Check that the dark background reaches the top with readable status icons, the header and bottom tabs clear the system controls, and forms can still be used with the keyboard open.
