# Password requirements

## Why

New accounts currently require ten characters but do not clearly explain or enforce a balanced password format.

## What

- New passwords contain at least 7 characters, at least one number, and at least one non-whitespace special character.
- The backend is authoritative and rejects registrations that do not meet every requirement.
- The sign-up form shows the requirements directly below the password field and enables submission only when they are met.
- Login accepts existing passwords without reapplying the new composition rule, so existing accounts remain accessible.

## Out of scope

- Password reset, password changes, strength scoring, or compromised-password lookup.
- Changes to username or legal-age requirements.

## Done when

- Backend tests cover passwords that are too short, lack a number, or lack a special character.
- Existing login validation remains compatible with passwords created under the previous rules.
- Generated API contracts are current and all API and mobile checks pass.
- The running sign-up screen displays the new requirement note below the password field.
