# Working together on BEERREAL

Use one shared repository: https://github.com/tiagosimoesdesa/Programming_Group_Project.
Each teammate works in their own clone and on a separate branch. Follow README.md for installation and local environment setup.

## Start a task

Agree on a small task in a GitHub issue and assign one owner. Include the intended behavior and how to check it. Coordinate before editing the same screen, migration, or API contract.

```powershell
git switch main
git pull --ff-only origin main
git switch -c codex/short-task-name
```

Start with a clean working tree; commit unfinished work on its own branch before switching tasks. Use a new branch for each task.

Suggested areas are mobile UI (`mobile/`), backend (`backend/`), and device testing/documentation (`docs/`). These are coordination areas, not exclusive ownership. API and database changes need agreement with the mobile developer.

## Check and share changes

Run the checks relevant to your change from the README. For API changes, regenerate `backend/openapi.json` and `mobile/src/generated/api.ts` together. Commit new Alembic migrations rather than editing migrations teammates have already applied.

```powershell
git status
git diff
git add path/to/changed-file
git diff --cached
git commit -m "Describe the behavior changed"
git push -u origin HEAD
```

Stage only intended files. Never commit `.env` files, credentials, local databases, uploaded photos, or dependency folders. Share configuration names through `.env.example`; each teammate supplies their own local values.

Open a pull request into `main`, explain the change, and request a teammate's review. Wait for the `api` and `mobile` checks and resolve review feedback before merging. Use a squash merge for one coherent task, then update everyone's local `main` before starting the next task.

If the branch falls behind, commit your work, fetch, and merge `origin/main` into the task branch. Resolve conflicts together with the affected teammate and rerun relevant checks. Avoid force-pushing shared branches.

## Using coding assistants

Give your assistant the task, branch, relevant files, and acceptance criteria. Ask it to read this guide and the README. Put shared decisions in issues, pull requests, or repository documentation so every teammate can read them. Do not rely on another person's chat history being available.

## Repository owner setup

Invite each confirmed teammate using their GitHub username with only the access needed to contribute. Prefer pull requests for changes to `main`. Where the repository's GitHub plan supports it, configure a rule requiring a pull request, one approval, and successful `api` and `mobile` checks, and disallow force pushes and deletion of `main`.

These are setup instructions; adding this file does not configure remote permissions or branch rules.
