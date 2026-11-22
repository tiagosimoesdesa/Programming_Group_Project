# Profile settings

## Why

Give signed-in players one place to edit their profile, understand night photo visibility, and manage access to their camera. See [issue #21](https://github.com/tiagosimoesdesa/Programming_Group_Project/issues/21).

## What

- A gear in Profile opens Settings. The screen has a back action and supports the Android back button.
- Players can change their username using the same validation and lowercase normalization as registration. FastAPI updates the signed-in account, rejects a taken username, and preserves the existing account and session. Settings explains that the new username is used to sign in.
- Players can change their profile photo with the existing picker and upload flow. Settings and Profile both show the updated photo.
- “Who can see my photos?” explains invite-only access, invited spectators, and the host’s Battle visibility option.
- Permissions shows camera access and lets players request it or find the relevant device or browser settings. The screen explains what the photo library is used for.
- Settings includes the existing sign-out confirmation.

## Out of scope

- Password changes, new photo visibility rules, push notifications, and account deletion.

## Done when

- The backend suite and mobile typecheck pass, and both generated API contract files are up to date.
- In the running app, open Settings from Profile, save an available username, handle a taken username, change a photo, read the privacy page, and check camera access. Confirm that canceling sign-out keeps the session and confirming sign-out allows sign-in with the new username.
- On iPhone and Android, check safe areas, keyboard layout, back navigation where available, and camera permission recovery using the physical-device checklist.
