# Attendance integration preparation — 15 October 2026

Status: backend implementation is blocked on authoritative source and schema.
This branch adds isolated safety checks, a staging authorization bridge and an implementation plan. It does not
enable attendance, change the camera workflow, or claim staging acceptance.

## Verified repository state

Inspected main at `9a105b118830bb330210747edf7956c6ebf60b47` through the GitHub connector.
The complete repository tree contains no `.gs` files or spreadsheet schema.
`src/main.js` uses `qr-scanner` 1.4.2, retains a continuous camera stream, debounces
decoded values and shows camera-only results. `src/qr.js` checks Apps Script URL
shape and optionally an exact base. There is no login UI, attendance request,
device provisioning, Gate/Meal selector or backend in the current application.
The exact real badge deployment and token grammar remain unverified.

The main-branch Actions run 38721848589 reports success for the camera deployment.
This is deployment evidence, not a new physical iPhone/Android acceptance test.
The live page itself was not fetched. Older architecture/deployment documents
describe earlier access failures; GitHub connector repository access now works.
Shell Git cloning failed because the configured proxy could not be reached;
source inspection was completed using the connector instead.

## Required owner input

Provide a sanitized export of the current Apps Script project, including HTML,
manifest, redacted configuration, and any deployed version that differs from the
editor. Preserve function names, signatures and control flow. Include definitions
and callers of `attendeeByToken_`, `recordBadgeAction`, `logActivity_`, `ss_`,
`doGet`, `doPost`, authorization helpers and all attendance writers. Include shared
registration, approval and trigger code so locking and eligibility can be audited.
Likely filenames mentioned in older documentation are Config.gs, Utils.gs,
Setup.gs, Registration.gs, Approval.gs, WebApp.gs, Badges.gs, Dashboard.gs,
VolunteerAuth.gs and VolunteerScanner.gs; actual filenames may differ. No setup
or migration function will be run.

Provide exact ordered headers for Attendees and Activity, synthetic example rows,
timestamp cell types/timezone, active/approval status values, token grammar and
case sensitivity, attendance columns and the current Meal-before-Gate rule.
Provide the badge URL base without any real token, deployment execution/access
settings, and a trigger inventory without secrets. Do not export live attendee
rows, phone numbers, PINs, session values or signing keys.

There is no configured Google Sheets/Apps Script management connection here.
An owner must supply a separate staging spreadsheet and project or create them
using the finalized schema instructions. A spreadsheet URL alone grants no access.

## Authorization architecture — bridge implementation approved

Preferred additional component: a Cloudflare Worker plus a strongly consistent
Durable Object for device authorization/provisioning and rate controls. Do not use
eventually consistent KV as the authoritative revocation store. No resources have
been purchased, created or deployed.

The owner approved bridge implementation without paid provisioning or production
deployment. `bridge/authority.js` now implements staging-only admin provisioning,
atomic one-time enrollment, twelve-hour role-bound device sessions, authoritative
revocation, hashed device secrets and coarse durable enrollment/admin limits.
`bridge/worker.js` implements exact-origin CORS and routes to that authority.
The attendance route rejects cross-role actions and returns BACKEND_NOT_CONFIGURED
for authorized actions. It cannot call Apps Script or write attendance. The code
has only been tested locally with a storage double, not in Cloudflare.

1. An authenticated administrator creates a short-lived, single-use, high-entropy
   provisioning code for one device and one role. Store only its digest. Redeem
   atomically with expiry, attempt limits and a fixed role. Deliver out of band;
   never put a reusable credential in a URL, public bundle or attendee QR.
2. One-time provisioning on the phone establishes a random device bearer secret.
   Keep its digest, role, event, environment, expiry and revoked flag server-side.
   A dedicated Pages origin stores the secret locally for shift recovery; every
   request supplies it over HTTPS in an Authorization header. Never log it.
   Refresh restores the role from the server; role cannot come from a dropdown.
3. Validate the authoritative device record for every write. Reject expired or
   revoked devices and cross-role requests. Do not cache positive authorization.
   Revocation blocks subsequent authorizations; a request already authorized and
   in flight may finish. Document this boundary for administrators.
4. Worker sends a signed, time-limited POST envelope to the separate Apps Script
   adapter. Bind device ID, role, environment, request ID and attendee token to
   the signature. Use backend-only secrets, constant-time digest comparison,
   bounded payloads, timestamp validation and durable replay/idempotency checks.
   Apps Script must verify authorization before any sheet lookup or write.
5. Exact Pages-origin CORS allowlist and preflight permit readable browser
   responses. CORS is supplementary. Reject unauthenticated calls regardless of
   origin. Do not use JSONP, state-changing GET or opaque no-cors requests.
   Follow only expected Google response redirects server-side; do not forward
   credentials to arbitrary redirect targets. Prove behavior in staging.

Persistent browser bearer secrets are exportable by someone holding the phone or
by same-origin XSS. Device roles limit damage; expiry, revocation, strict CSP,
no third-party scripts and managed phones reduce risk. Do not describe this as
hardware-bound identity. GitHub Pages projects on the same hostname share an
origin and localStorage; dedicate an origin/custom domain to the scanner before
persisting credentials. If that cannot be provided, consider serving the same
camera app at the bridge origin with Secure HttpOnly SameSite cookies, explicit
CSRF protection and server-side sessions. Test iOS behavior; cross-site cookie
sessions from Pages to a workers.dev host are unreliable under browser privacy
restrictions. This hosting choice needs approval before implementation.

Apps Script alone could host an HTMLService UI using google.script.run, but moving
the working camera into its embedded environment requires fresh physical-phone
validation. Direct GitHub Pages fetch to Apps Script cannot be assumed to provide
usable preflight, redirects, custom authorization or response headers. A bridge
keeps the proven camera architecture and gives control over those behaviors.

Planning cost estimate (not a verified current vendor quote): 6,000 attendees
times two actions is about 12,000 successful calls, plus authorization, retries,
duplicates and load tests. Budget up to roughly 50,000 event requests initially.
A Worker paid-plan baseline has historically been about US$5/month plus usage;
reserve US$5–15 for a month of modest Worker/Durable Object usage, excluding
Google Workspace and an optional domain. Verify current pricing, account quotas,
CPU/storage charges and free-tier eligibility before approval or provisioning.
Set budget alerts; do not automatically upgrade plans. Request count alone does
not establish affordability or capacity under an attack or repeated polling.

## Data integrity design decisions blocked on source

Preserve existing Gate/Meal columns, rules and log format. Do not trim, lowercase
or otherwise transform tokens until their actual grammar is known; URL decoding
already occurs once in URLSearchParams. Require an exact verified badge base for
attendance and independently enforce eligibility server-side.

All writers, including legacy routes, must share the same concurrency mechanism.
A ScriptLock in a new staging/production project does not coordinate with a lock
in another project. Inspect existing writers before choosing the deployment
boundary. Never claim atomicity across two projects using separate ScriptLocks.

Checking duplicates, preserving original timestamps, writing attendance and
logging an audit event must form one recoverable operation. Independent setValue
and appendRow calls are not a transaction; a crash between them can lose audits.
Investigate one atomic Sheets batchUpdate for cell and audit changes after schema
inspection, or an approved durable journal/reconciliation design. Examine all
concurrent registration and Activity append behavior before selecting either.
Do not add production columns or a journal tab without approval.

Bind idempotency to device, role, environment, request ID and payload. Conflicting
reuse must be rejected. A timeout is an uncertain result: retry the same request
ID, with server-side duplicate protection even if browser state is lost. Return
the original timestamp on duplicates. Never report success before a confirmed
commit. Define retention and reconciliation before claiming exactly-once audits.

## Isolated staging preparation

`config/staging.example.json` deliberately fails closed until filled locally with
an actual new staging ID and explicit allowlist. It contains no production ID.
Do not commit the populated configuration or credentials. The local helper
`scripts/staging-safety.js` checks staging mode, exact allowlisting, a SHA-256
deny fingerprint for the owner-supplied live spreadsheet and disabled writes.
The fingerprint catches the live target even if accidentally allowlisted. This
helper performs no network calls. It is preparation, not a deployed server guard.

Future integration/load runners must call the guard before constructing a Google
client; the staging backend must independently enforce the same isolation.
The currently enforced false write flag intentionally cannot run a load test.
Any later staging-write runner needs its own reviewed safety checks and isolated
deployment credentials. Never put a production credential or literal production
spreadsheet ID in tests or CI. Never use production as a negative network test.

After source review:

1. Finalize a header manifest from the export; fail on unknown/missing/duplicate
   headers. A staging schema is intentionally not invented in this branch.
2. Owner creates a new spreadsheet and standalone staging Apps Script project.
   Populate synthetic records only, with clearly separate token namespace.
   Do not copy a live workbook or run SETUP_V2. Reproduce only reviewed required
   tabs/headers and create no production triggers.
3. Record staging spreadsheet/project/deployment IDs in protected configuration.
   Use new staging secrets and isolated access. Keep production activation absent.
4. Deploy the adapter and bridge only after authorization design approval.
   Test missing/incorrect credentials, role tampering, revoked devices, replay,
   redirect handling and readable confirmations before testing attendance.
5. Seed only synthetic attendees in this isolated staging environment using a
   reviewed explicit seed tool. Final schema/seed tooling awaits source review.

## Acceptance and capacity evidence still required

| Requested cases | Current evidence |
| --- | --- |
| Invalid/missing/malformed QR, exact deployment mismatch, local repeat suppression | Existing offline QR unit tests pass |
| Staging allowlist, protected fingerprint, malformed/missing config, disabled writes | New offline safety tests pass |
| Valid/duplicate Gate and Meal; inactive attendee | Blocked on source/schema and staging |
| Unauthorized, cross-role and revoked scanner | Offline bridge tests pass; no deployed auth |
| Concurrent same badge; audit partial failure | No backend tests yet |
| Timeout, uncertain retry, refresh recovery | No attendance transport yet |
| Continuous multi-attendee phone scanning | Existing camera reported tested by owner; attendance phone testing pending |
| Backend errors and actual staging/production isolation | Deployment tests pending; local preflight alone is insufficient |

The existing Actions validation already runs tests/*.test.js on PRs, so it includes
the added safety tests without changing deployment behavior. Local verification:
`node --test tests/*.test.js` and `node scripts/check-secrets.js` pass. No npm
dependency installation, lint, build or browser tests were run locally in this
environment. No Google API was contacted.

For individual local test output use
`node --test --test-isolation=none --test-reporter=spec tests/*.test.js`:
25 cases pass, including atomic provisioning-code redemption, expired sessions,
revocation, role tampering and safe backend unavailability. These are unit tests,
not proof of real Durable Object concurrency or Google attendance correctness.

Staging load plan: generate 6,000 synthetic attendees only after schema review.
Start with one scanner, then 2, 4, 8 and 16 concurrent devices at expected scan
cadence. Include same-badge races, duplicate bursts, mixed Gate/Meal, dropped
responses and injected audit/write failures. Bound the run by count and duration,
stop on quota pressure or sustained failures, and never delete evidence as part
of a test. Measure latency p50/p95/p99, lock wait/timeout, execution concurrency,
quota errors, throughput, retry rates, and final timestamp/audit invariants.
Reconcile against the synthetic input set without reading production.
Use the observed operating envelope to select scanner count and headroom. No
attendance throughput or support for 6,000 attendees has been measured or claimed.

## Activation, rollback and volunteer workflow

Production release remains blocked until source review, staging acceptance,
phone tests, capacity evidence, registration/HR regression checks and explicit
owner approval. PR merge or Pages deployment must never activate a write flag.
Prepare separate production configuration outside public assets, reviewed
versioned Apps Script deployment, and an independently controlled server-side
write enablement step only after approval. No production schema changes are
authorized by this preparation.

Preparation rollback: revert this branch's additions. Camera assets are unchanged.
Later integration rollback: disable writes server-side, revoke device sessions,
restore the previously reviewed frontend/backend versions, preserve every
recorded timestamp and audit row, and reconcile uncertain requests. Do not clear
attendance or invoke setup. Rotation of production secrets requires approval.

Planned volunteer instructions: administrator provisions the correct Gate/Meal
device once; volunteer starts the camera and checks the displayed server role.
Keep scanning after each confirmed result. Green ENTRY OK/MEAL OK confirms a
commit; amber ALREADY ENTERED/MEAL ALREADY SERVED preserves the timestamp. Red
INVALID BADGE, BADGE INACTIVE, NETWORK ERROR — RETRY or SCANNER NOT AUTHORIZED
requires retry or supervisor attention. Never admit based on a blue camera-only
detection. Do not treat a network timeout as success. An unauthorized or lost
phone requires administrator revocation/reprovisioning. These instructions become
operational only after the integration is implemented and staging-tested.
