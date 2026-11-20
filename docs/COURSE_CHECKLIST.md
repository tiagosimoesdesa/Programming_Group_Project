# Course project checklist

This checklist follows the current team-project rules and grading criteria. Update it with evidence instead of marking an item complete from memory.

## Submission requirements

- [x] The GitHub repository is public.
- [x] The deployed application code is developed and merged on `main`.
- [ ] The public deployed application URL is added to `README.md`.
- [x] Every member's full name and student number are added to `README.md`.
- [x] `README.md` contains commands to run the application and tests locally.
- [ ] One member submits the repository link on Moodle before **23 November 2026 at 23:59**.
- [ ] No final changes are made after the submission deadline; later commits are not considered for grading.

## 1. It works — 20%

- [x] Local backend health, database migrations, and the Expo manifest have been checked.
- [x] Automated API tests cover the main Classic, Party, Battle, social, scoring, and access-control workflows.
- [ ] The complete application is available and usable at its public deployed URL.
- [ ] All three game modes are tested end to end on the deployed application.
- [ ] Invalid input and unavailable-dependency behaviour show clear errors without crashing.
- [ ] Data and photos survive an API restart and a new deployment.

## 2. User interface and experience — 20%

- [x] The approved React Native interface is designed for a camera-first mobile workflow.
- [ ] Registration, login, room creation, joining, capture, voting, standings, and history are completed without guidance on physical phones.
- [ ] Errors, loading states, empty states, hidden Battle results, and final results are clear to users.
- [ ] Small-phone, iPhone, Android, and production web layouts are reviewed.
- [ ] Permission denial and camera retake/retry flows are tested.

## 3. Scope and ambition — 20%

- [x] Classic, Party, and Battle modes integrate with accounts, private rooms, photos, scoring, feeds, reactions, spectators, standings, and history.
- [x] Party adds scheduled challenges and majority voting; Battle adds teams, timers, privacy settings, and final reveals.
- [ ] The final demo focuses on stable integrated workflows rather than adding last-minute features.

## 4. Verification — 10%

- [x] Backend tests, strict TypeScript checking, generated API contracts, and CI checks are present.
- [x] Tests include accepted actions, rejected actions, permissions, duplicate/idempotent actions, timing rules, and migration preservation.
- [ ] The team records the final test output from `main` immediately before the code freeze.
- [ ] Two-phone tests cover live synchronization and simultaneous actions for Party and Battle.
- [ ] Every member can explain what the tests cover and what remains manual.

## 5. Security — 10%

- [x] Secrets and local data are ignored by Git; example environment files contain placeholders only.
- [x] Passwords are hashed, tokens expire/rotate, login attempts are throttled, and private photos use temporary links.
- [x] Backend endpoints enforce membership, host, spectator, voting, team, and hidden-result permissions.
- [ ] Supabase uses a private `beerreal` bucket and backend-only service credentials.
- [ ] Production CORS, database privileges, service keys, HTTPS URLs, and provider access are reviewed after deployment.
- [ ] Dependency advisories are rechecked and either fixed compatibly or documented with their upstream constraints.
- [ ] Demo dashboards, environment files, secrets, and private user data are closed before screen sharing.

## 6. Repository walkthrough — 20%

- [x] `README.md`, `CONTRIBUTING.md`, deployment documentation, migrations, tests, and generated API contracts describe the architecture.
- [ ] Every member can locate and explain screens, backend rules, storage, migrations, tests, and API communication.
- [ ] Every member can explain why this stack was chosen, its limits, and how it could change.
- [ ] Every member can explain storage, real-time synchronization, simultaneous-action rules, and external-service failure behaviour.
- [ ] The run and test commands are followed successfully from a fresh clone.

## Deployment and demo preparation

- [ ] Create the Supabase project in an appropriate region and the private `beerreal` Storage bucket.
- [ ] Create the Render Blueprint services from `main` and configure secrets only in provider dashboards.
- [ ] Confirm the deployed frontend uses the deployed API and the latest `main` commit.
- [ ] Create tested demo accounts for every role used in the demonstration.
- [ ] Prepare useful starting data and document how to reset it safely.
- [ ] Rehearse the full demo on the deployed app with two devices, including mobile data or a separate network.
- [ ] Open Render and Supabase the day before to confirm that neither service is paused or over its limit.
- [ ] Open the application before the presentation so free services are awake.
- [ ] Stop merging the day before the presentation and reset the demo data after rehearsal.
