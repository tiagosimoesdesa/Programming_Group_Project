# Course workflow alignment

## Why

The repository already has a collaboration guide and automated checks, but it does not yet contain the course rulebook, task-specification template, or a single checklist against the published grading criteria. Future contributors and coding agents need the same reviewed instructions in the repository rather than relying on private chat history.

## What

- Add `AGENTS.md` with the approved stack, branch, verification, test, database, security, and review rules.
- Add a reusable course-format task specification template.
- Add a checklist covering the six current team-project grading criteria and the submission/demo requirements.
- Complete the README requirements section and link the course checklist.
- Make teammate review before merge explicit in the collaboration guide.
- Correct deployment documentation that still describes only two game modes.
- Record the latest beer-points and Battle-mode validation without overstating physical-device or hosted testing.

## Out of scope

- No backend, frontend, database, API-contract, dependency, or deployment behaviour changes.
- No Supabase or Render provisioning.
- No member names, student numbers, credentials, private approval correspondence, or final public URL.
- No retroactive feature specifications presented as if they existed before implementation.

## Done when

- All listed documentation files exist and agree on the current architecture and three game modes.
- `git diff --check` passes and the diff contains no application-code or secret changes.
- A teammate reviews the pull request and the repository checks pass before merge.

