# Annual Day 2026 — continuous QR camera proof of concept

Sreedhareeyam Ayurveda Group · 21 October 2026 · anticipated 5,000–6,000 attendees.

**Camera test only. Not an admission system.** No login, backend requests, attendee data, attendance writes, or production credentials are included. The blue detection panel confirms decoding only. Existing badges do not need changes for this test. Live production systems have not been accessed or changed.

## Run

Use Node 24 and npm. From this directory:

```sh
npm ci
npm run lint
npm run check:secrets
npm test
npm run build
npx playwright install --with-deps chromium
npm run test:browser
npm run dev
```

If the machine has Chromium already, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable for browser tests. On this cloud machine use `npm --cache /workspace/.npm-cache ci` because the default home cache is not writable.

Use the existing checkout in each isolated cloud task; do not create a worktree. The build is static and uses relative asset URLs for Pages project paths. Serve `dist/` over HTTPS for phone testing. HTTP on a LAN address does not meet camera secure-context requirements. Do not expose the development server as a production deployment.

## Deployment and acceptance

See [deployment](docs/DEPLOYMENT.md) and the [phone test/volunteer guide](docs/VOLUNTEER-GUIDE.md). **No published URL exists yet.** GitHub API access returned Forbidden, including repository creation; the authoritative source repository was inaccessible. The owner and publication settings must be verified before a URL can be given.

PRs run lint, credential-pattern checks, unit tests, build and Chromium tests. The main branch runs the same checks before deploying to the `github-pages` environment. Configure branch rules requiring PR approval and passing checks; add environment approval if available in the account plan. Workflow configuration cannot itself enforce those repository settings. No Pages or identity-token write permission is granted to PR jobs. Pin updates should go through reviewed PRs.

## Scope and safeguards

- `qr-scanner` 1.4.2 uses local assets; no CDN, analytics, or QR uploads. Its upstream release cadence should be reassessed before production; real-device compatibility is unverified.
- Prefers the rear camera; starts only after a user gesture. Stop, backgrounding, navigation and interruption release the camera. Return from background requires tapping Restart camera for this proof of concept.
- Same QR is suppressed for 2.5 seconds, including across intervening badges. A continuously held QR can count again after that interval. The counter measures detections, never unique attendees or admissions.
- No session persistence or attendance endpoint exists. No storage API is used. Raw decoded values stay briefly in an in-memory debounce map and are never rendered or logged.
- URL validation checks the supplied Apps Script URL shape, rejects extra parameters and never follows QR links. Exact deployment URL and token rules remain unconfirmed; a recognized shape does **not** authenticate a badge.
- Audio is opt-in, vibration is best effort. Camera and image recognition work locally after assets load; fresh offline loads are not supported. No service worker caches stale releases.

See [architecture](docs/ARCHITECTURE.md), [security](docs/SECURITY.md), [capacity](docs/PERFORMANCE.md), and [checklist](docs/CHECKLIST.md). Backend implementation and login/attendance tests are intentionally gated on real-phone camera acceptance and source inspection.
