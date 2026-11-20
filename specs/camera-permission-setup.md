# Offer camera access after sign-in

## Why

Players can get camera access ready before their first photo check-in. Spectators can skip the setup and go straight to Tonight.

## What

- After an explicit login or registration, offer Enable camera and Later when the device or browser has not decided on camera access. Honor an existing grant and continue directly to Tonight when restoring a session.
- Reuse the current camera permission for drink and Party check-ins during the signed-in session. If the user skips or declines setup, offer a way to enable access when they first try to take photos.
- Release the camera when capture closes. Discard the app's permission state on sign-out or session loss. The operating system or browser owns the underlying grant.

## Done when

- `npm run typecheck` passes.
- A first login offers setup, Later permits browsing, and enabling the camera lets the same signed-in user reopen check-in without another app permission step while the platform grant is valid.
- A user who declines can recover through the camera screen, a restored session opens Tonight, and a sign-out starts a fresh app permission flow.
- The relevant physical-device checks in `docs/DEVICE_TESTS.md` cover iOS and Android recovery and rear-to-front capture.
