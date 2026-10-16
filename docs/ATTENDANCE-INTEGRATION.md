# Staging attendance integration — 15 October 2026

Implementation is in draft PR #2. Production access, modification, testing and
activation remain prohibited. No production spreadsheet or Google API has been
contacted. No Cloudflare or Apps Script deployment has been created. All present
attendance evidence is from isolated local mocks. This document supersedes the
older camera-phase architecture/deployment assumptions in other documentation.

## Source inspection and confirmed rules

All 13 files in the owner-supplied ZIP were inspected, including
SANITIZATION-NOTES.txt. Their names, lengths and SHA-256 fingerprints are in
backend/source-inventory.json. The raw export is kept outside the public
repository; some diagnostic helpers still contain sample PIN/token literals,
which were not copied into code, fixtures, logs or public documentation.

| Export file | Findings relevant to integration |
| --- | --- |
| Config.js | Badge web-app URL redacted; event is in India |
| Utils.js | Explicit spreadsheet property with active-sheet fallback; token lookup trims/uppercases; logger writes 10 columns |
| WebApp.js | Token GET renders badge; default GET renders HR portal; recordBadgeAction validates volunteer session, locks, checks Active status, then writes attendance and audit separately |
| VolunteerAuth.js | Gate/Meal authorization; cached sessions and rechecked account status; no device provisioning |
| VolunteerScanner.js | Login and read-only lookup; diagnostic helpers; no automatic attendance integration |
| Approval.js | Approval and status updates use the same script lock; can append attendee rows |
| Registration.js | Existing registration logic and form trigger; temporary IDs protected by script lock |
| Badges.js | QR is WEB_APP_URL + ?t=token; printing/guest helpers can modify sheets and must not be run |
| Setup.js | Destructive setup/clear, form changes and trigger replacement; reviewed as text only |
| Dashboard.js | Reads registration/attendee data and rewrites dashboard output; not executed |
| Code.js | Empty myFunction placeholder |
| appsscript.json | Declares deployer execution and anonymous access; actual deployment is unverified |
| SANITIZATION-NOTES.txt | Provides source-derived schema, cautions and redaction inventory |

The owner supplied current ordered headers; they exactly match the 14 Attendees
and 10 Activity headers declared in backend/Attendance.gs. Entry Time, Meal Time
and QR Token remain the existing fields. Active means exactly `Active`. Tokens
are trimmed and uppercased. Gate/Meal timestamps are written only when blank;
duplicate scans preserve the original timestamp and do not add an Activity row.
Meal service has no Gate prerequisite. Staging preserves these rules. No badge
URL or existing QR token is regenerated.

## Implementation

- backend/Attendance.gs is a new **staging-only standalone** adapter. It does not
  import or replace the registration system. The only web entry points are a
  read-only rejection from doGet and authenticated doPost. All other helpers
  have private trailing-underscore names.
- bridge/authority.js implements administrator provisioning, atomic five-minute
  single-use codes, twelve-hour device sessions, role binding and revocation.
  Enrollment/admin traffic has coarse durable limits; edge limits are still
  required. Device credentials are stored as digests on the server.
- bridge/backend.js signs a time-limited HMAC POST envelope, binding request ID,
  device, role, normalized token, staging environment and audience. It validates
  backend response codes and confirmed timestamps. ContentService redirects can
  only become GET requests to script.googleusercontent.com/macros/echo; secrets
  and POST bodies are not forwarded to the redirect.
- src/attendance.js retains an unresolved request ID/token in tab sessionStorage
  for safe retry and refresh recovery. Only one request is in flight per client.
  It does not show green before server acknowledgement. New scans wait while an
  unresolved request needs retry, but the camera remains active.
- staging.html uses the existing qr-scanner camera engine and adds one-time
  provisioning, server role, green/amber/red feedback and Retry. The ordinary
  index.html camera test remains the default Pages build. `build:staging` writes
  a separate dist-staging artifact; it is never uploaded by the Pages workflow.
- scripts/load-staging.js is a bounded manual runner with staging spreadsheet ID
  deny fingerprint, ID/origin allowlists, mandatory staging session and synthetic
  token namespace. It stops on errors. CI never invokes it.

## Atomicity, retries and isolation

The staging adapter validates environment, exact standalone script ID, a server
spreadsheet allowlist and the protected live-sheet fingerprint before any sheet
open. It never falls back to an active spreadsheet. A separate server write gate
starts false. A valid bridge signature and recent timestamp are required before
lookup or write; a badge QR alone never grants authority. Every bridge request
rechecks the authoritative device record and rejects cross-role actions.

One ScriptLock encloses lookup, duplicate check and commit. A single Sheets API
batchUpdate commits the attendance cell, existing-format Activity row and a
private staging ScannerRequests retry journal atomically. The journal binds the
request key to device, role and token digest. Exact replay returns the original
response; conflicting reuse fails. A lost response after commit therefore does
not lose an audit row or overwrite a timestamp on retry. The tests simulate both
precommit failure and a lost postcommit response.

The journal is an additional **staging-only tab**, not a proposed approved
production schema change. No production column is added. Production integration
will require an approved journal location and coordination with every legacy
writer. ScriptLocks in separate projects do not coordinate. Never point this
standalone staging adapter at the live sheet. Shared-project production locking,
legacy routes and HR status races must be resolved in a separately approved
production design. Atomic Sheets semantics still require real staging tests.

Token lookup reads only the token column and matching attendee row; it preserves
legacy trim/case normalization and rejects duplicate token rows. The retry journal
currently reads its request-key column. This is O(n) and is not a capacity claim.
No volatile cache is used for authorization, attendance or row identity.

## Security findings and remaining review

The manifest's anonymous access is necessary for a server-to-server Apps Script
web app only when all write requests enforce application authorization. The new
adapter verifies signatures and cannot expose arbitrary operations. Signing keys
belong only in Worker secrets and staging Script Properties. No spreadsheet ID,
backend key or Google credential is embedded in the frontend.

The supplied legacy HR approval methods do not show an authorization check, and
the default GET renders approval data. If the actual deployment has the manifest's
anonymous access, this needs a separate owner security review before production
acceptance. This is a source finding, not a verified claim about live exposure.
No legacy auth was removed and no production fix was attempted.

Provisioned browser credentials are exportable by phone holders and same-origin
XSS. This version uses tab sessionStorage: refresh recovers a shift; closing the
tab may require reprovisioning. Host staging on a dedicated origin with a Worker
/api route. GitHub Pages projects sharing a hostname share browser storage and
are not isolated security origins. Do not persist device credentials on a shared
Pages origin. Keep strict CSP, no-referrer and no external scripts. The current
CSP permits the same-origin /api calls; no no-cors workaround is used.

Revocation rejects subsequent authorizations; it cannot cancel an already-signed
request in flight. Signed envelopes expire after two minutes and replays are
idempotent. Administrator bootstrap bearer is powerful: restrict admin routes at
the edge, enforce IP/request limits, configure log redaction and budget controls.
Expired durable records/journal need an event retention policy before sustained
operation. Public deployment remains blocked on these controls and real runtime
validation. No security or readiness claim is made for the live system.

## Existing staging workbook and selected adapter — Step 64

The owner selected the HMAC bridge architecture and already has a staging workbook
with 20 synthetic attendees. The prepared baseline in backend/prepared-staging is
archived and MUST NOT be uploaded alongside this adapter. The old workbook creation
helper has been removed. Never create or seed another workbook for this task.

[Step 64 handoff](STEP-64-STAGING-HMAC.md) is authoritative for existing-workbook
configuration, the journal-only preparation, safe replacement upload, hosting,
secrets, rate limits, approval boundaries and current validation. It replaces all
prior new-workbook/50-record instructions. The load runner's old 49-token assumptions
must not be used against the current 20 synthetic records; no remote load run is
approved. Google Drive access and the owner's source upload are established in the
conversation, but runtime source, properties, triggers and deployment are not
independently verified by this repository.

## Tests and capacity

Historical pre-Step-64 validation: 60 offline unit cases passed. Current Step 64 has 77 passing offline cases, lint, credential checks and both builds; browser startup is blocked locally by sandbox loopback permissions. See the Step 64 handoff for current evidence. The historical cases cover Gate/Meal success and duplicates, invalid/inactive badges, QR shape,
missing tokens, unauthorized/cross-role requests, signature tampering/expiry,
concurrent mock submissions, lock contention, atomic-batch failure recovery,
timeouts, idempotent retry, refresh recovery, continuous multiple attendees and
staging isolation. The actual Apps Script adapter is evaluated in Node VM with
Google services replaced by synthetic doubles; it cannot contact Google.

Three new Chromium tests exercise the staging UI with a synthetic camera and
mocked API; the five existing camera regression tests remain. CI runs lint,
secret-pattern checks, unit tests, separate camera/staging builds and browser
checks. CI status is reported in the PR; physical Safari/iPhone and Android tests
and real Durable Object/Apps Script tests remain pending. Local dependencies are
not installed, so build/lint/browser verification is delegated to the existing
GitHub Actions runner. Offline fixtures use only the approved staging ID and synthetic records; no production ID is configured or contacted.

The existing load runner was designed around an earlier 50-record fixture and must
not be run against this 20-record workbook. A separately approved load plan must
use the actual staging-only tokens, exact staging ID and origin allowlists, bounded
requests and explicit enablement of both write gates. This step adds no load test
execution or capacity evidence. Never clear timestamps or logs to repeat a test.

Record p50/p95/p99 latency, throughput, lock contention, HTTP/API error rates,
Apps Script execution/Sheets quotas, and row/audit invariants. Stop on pressure
or errors. Duplicate-heavy tests are not a substitute for unique first-write
capacity; expand synthetic fixtures in a new staging workbook for full event
simulations. No measured cloud throughput or support for 6,000 attendees is
claimed. Planning budget remains roughly US$5–15/month for modest Worker/Durable
Object usage if a paid plan is needed; this is an unverified estimate, excluding
Workspace/domain costs. Verify current pricing; no paid provisioning is approved.

## Production readiness and rollback

- [x] Source and sanitization notes inspected; owner header rows confirmed.
- [x] Existing timestamp columns, normalization and Meal-before-Gate rules preserved.
- [x] Authenticated staging adapter, client, provisioning and offline tests implemented.
- [ ] Complete existing badge base including deployment ID and /exec received.
- [ ] Actual legacy execution/access settings and exported/deployed version confirmed.
- [ ] Isolated Google/Cloudflare resources created through authorized access.
- [ ] Real staging tests, phone checks, edge controls and capacity evidence completed.
- [ ] Legacy HR access review and shared-writer/production journal design approved.
- [ ] Separate production deployment and attendance activation explicitly approved.

Rollback of this staging implementation: set the staging script write flag false,
set the Worker attendance flag false, revoke staging device sessions, and restore
the previous reviewed frontend/backend versions or remove the staging route.
Keep all recorded timestamps, Activity and journal rows for reconciliation. The
camera-only Pages build is independently deployable. No production rollback is
needed because no production resources have been touched. Never run setup/reset
or delete attendance as a rollback mechanism.

Volunteer operation on staging: administrator provisions the correct role once;
volunteer starts the camera and checks the displayed server role. Scan a synthetic
badge and wait for green ENTRY OK/MEAL OK or amber duplicate confirmation. Red
NETWORK ERROR — RETRY means an uncertain outcome: keep the attendee present and
retry before scanning another badge. The same request ID survives refresh. Red
SCANNER NOT AUTHORIZED requires administrator help. Invalid/inactive badges are
not admitted. Do not use blue camera-only detection as an attendance result.

