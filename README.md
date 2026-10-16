# Annual Day 2026 — native Camera attendance (staging only)

The selected implementation is now [native-staging/](native-staging/README.md):
one Apps Script web app, separate Gate/Meal shared-PIN links, durable eight-hour
server sessions, automatic authorized badge recording and no embedded camera UI.
Existing registration/approval data and QR tokens are preserved. No additional
hosting, HMAC bridge or individual volunteer registration is required.

Upload only the four files in native-staging/src after explicit owner approval.
No upload, deployment, properties change, attendance activation or remote test is
performed by committing this code. Both staging and production deployment remain
manual approval boundaries. Production is strictly out of scope.

The older backend/, bridge/, src/ camera/Pages prototypes and integration guides
are historical implementations, not the selected package. Never combine them.
CI runs offline tests, lint, credential-pattern checks and Apps Script syntax
checks; it no longer builds/launches a camera scanner or deploys Pages.

```sh
npm ci --ignore-scripts
npm run lint
npm run check:secrets
npm test
node --check < native-staging/src/Native.gs
```

The native Camera link must recover browser storage from the PIN login. This is
not yet proven on iPhone/Android and is a mandatory writes-disabled staging test
before attendance activation. Printed production URLs still point to their
original deployment, which is not accessed or changed by this work.
