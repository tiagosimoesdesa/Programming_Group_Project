# Personal night history controls

## Why

People may have finished nights they no longer want to see, but removing a personal memory must not alter the shared night, standings, or photos for anyone else.

## What

- A user can hide a finished night from the main Memories list.
- Hidden nights appear in a separate collapsible section and can be restored.
- A user can permanently remove a finished night from their own history.
- Personal removal prevents that user from listing or reopening the night, while preserving their membership, submissions, scores, and the night for every other participant.
- Active nights and users outside the night cannot use history controls.
- Destructive removal requires confirmation in the interface.

## Out of scope

- Deleting competitions, photos, submissions, or another user's history.
- Hiding or removing an active night.
- Restoring a night after permanent personal removal.

## Done when

- A new migration preserves existing memberships as visible history entries.
- Backend tests cover hide, restore, permanent personal removal, permissions, active-night rejection, and preservation for other participants.
- OpenAPI and generated TypeScript contracts are current.
- API and mobile checks pass.
- The running Memories screen exposes Hide/Restore and Remove controls with confirmation for removal.
