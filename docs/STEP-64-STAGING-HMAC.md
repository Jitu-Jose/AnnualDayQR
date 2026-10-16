# Step 64 — HMAC adapter for the existing staging workbook

Preparation only. No Apps Script upload, remote sheet modification, deployment,
attendance enablement or Google/Cloudflare attendance test is authorized by this
step. No production access. Do not run SETUP_V2 or any seeding helper.

## Selected package and existing workbook

Use **only backend/Attendance.gs, backend/Staging.gs and backend/appsscript.json**.
Do not upload backend/prepared-staging, its old properties/authentication, bridge
JavaScript or the sanitized export to Apps Script. The existing staging project is
Annual Day 2026 - STAGING Backend. Its exact Script ID must still be verified.

Pinned spreadsheet: `1rd-tQCnK5fm_rRzTwipU2gxMg9UP_BpjleIfhLOuqxQ`.
Required title: `Annual Day 2026 - STAGING TEST ONLY`.
The target property AND singleton allowlist must match this ID. The protected
fingerprint deny check remains. Script ID must match ScriptApp.getScriptId().
The workbook identity/title are checked after opening only the pinned ID.
There is no active-workbook fallback or workbook creation/seeding function.

Existing source-confirmed schema: Attendees 14 columns; Activity 10 columns.
Registrations (35 columns) and Volunteers (6 columns) are left untouched and unused
by the selected HMAC adapter. The owner reports 20 synthetic attendees; no data is
reseeded or regenerated. India timezone aliases Asia/Kolkata and Asia/Calcutta are
both accepted; other zones fail closed. Existing timestamps are not converted.

## Journal preparation — code prepared, NOT executed

ScannerRequests must have exactly three ordered headers:

| A | B | C |
| --- | --- | --- |
| Request Key | Payload Digest | Response JSON |

Request Key binds deviceId:requestId; Payload Digest binds device ID, role and
normalized token. Response JSON stores the original acknowledged result. Do not
clear, sort selectively, edit or delete journal rows during operation/retries.
Retention must exceed the supported retry period; no cleanup is implemented.

scannerJournalPlan_() reads identity, timezone and existing Attendees/Activity
headers; it reports whether the correctly headed journal exists. It writes nothing.
prepareScannerRequests_(confirmation) is a separate, private editor-only helper.
It requires pinned-ID confirmation, STAGING_WRITES_ENABLED exactly false and a
separate STAGING_JOURNAL_PREPARATION_ENABLED exactly true. It takes a ScriptLock,
validates existing schemas and uses one Sheets batch to add the journal and header
atomically. It creates no workbook, attendee or Activity row. Repeating it preserves
a valid journal; a damaged existing journal is rejected, never overwritten. It
reserves sheetId 640064; a pre-existing ID collision safely fails the batch and
requires review, not deletion of another tab.

A later approved owner invocation can use a temporary private editor wrapper:

```javascript
function approvedJournalPreparation_() {
  return prepareScannerRequests_('1rd-tQCnK5fm_rRzTwipU2gxMg9UP_BpjleIfhLOuqxQ');
}
```

This wrapper is an instruction for a future separately approved operation, not an
included auto-run function. After that operation, restore the preparation flag to
false, remove the wrapper and read back all journal headers and unchanged counts.

## Configuration (no secret values in Git)

config/hmac-staging-properties.example.json contains nonsecret properties. Replace
STAGING_SCRIPT_ID with the verified existing staging project's Script ID. Keep
STAGING_WRITES_ENABLED=false and STAGING_JOURNAL_PREPARATION_ENABLED=false.
The old ENVIRONMENT/SPREADSHEET_ID/STAGING_ATTENDANCE_WRITES_ENABLED properties are
not used by HMAC; remove obsolete baseline properties only during approved migration.
Never rely on the old false flag as the new adapter's gate.

Additional Script Properties needed before endpoint validation:
- BRIDGE_SIGNING_KEY: newly generated staging-only 32 random bytes encoded as 64
  lowercase hexadecimal characters. Match the Worker secret; never expose it in
  a browser, QR, repository, sheet, chat, logs or committed local configuration.
- SCANNER_AUDIENCE: distinct 16–100-character URL-safe staging identifier, matching
  the Worker's BACKEND_AUDIENCE. This is not the signing key.

Worker secrets: the matching BRIDGE_SIGNING_KEY and a separate random ADMIN_BEARER
(64 lowercase hexadecimal characters), in the provider's secret store only.
Worker variables: ENVIRONMENT=staging, exact dedicated HTTPS SCANNER_ORIGIN,
STAGING_ATTENDANCE_ENABLED=false, eventual STAGING_BACKEND_URL, BACKEND_AUDIENCE
and a staging-only BADGE_BASE. The base must match synthetic QR URLs and never
navigate to a legacy badge endpoint. The existing random test token format is
supported; no STAGE-prefix or 49-record assumption is required by the adapter.
Do not use the old load runner against this workbook without a new approved plan.

Enable the advanced Sheets v4 service and its associated API during approved
configuration. The manifest declares it and spreadsheet OAuth scope. API/OAuth
availability is not established by code review. A spreadsheet scope is broad;
target pinning is application enforcement, not an account-level IAM boundary.

## Atomicity, replay and authorization

Gate/Meal remain independent, require exactly Active, and write their own timestamp
only if blank. Meal has no Gate prerequisite. Normalized duplicate token rows are
rejected rather than choosing the first. Under one ScriptLock, one Sheets batch
commits timestamp + ten-column Activity + durable journal result. Activity timestamps
receive a DATE_TIME cell format in the same batch; no manual format fix is needed. Duplicate actions
preserve timestamps, add no Activity, and journal their response. A lost response
can be retried with the same device/request ID: a fresh signed envelope returns
the original result. Reusing the key for a changed role/token is rejected.

HMAC verifies environment, audience, schema and a two-minute timestamp window before
attendance processing. Durable replay handling prevents a repeat commit; a captured
valid request may return its saved result during its allowed window. Protect keys
and transport. Revocation is checked at the authoritative bridge before signing;
it cannot cancel a request already authorized/in flight (up to envelope expiry).
ScriptLocks coordinate this project only. Other scripts and manual sheet editors
must not write these tabs concurrently. Anyone-with-link editing was previously
observed: owner review/restriction of staging sharing remains a deployment blocker;
no sharing change was made here.

An administrator provisions a single-use five-minute Gate or Meal code. Enrollment
creates a role-bound, revocable twelve-hour device credential. Browser refresh
recovers it from tab sessionStorage; no repeated ID/PIN entry is required during
that session. Closing the tab, expiry or revocation requires reprovisioning. Only
a device digest is stored server-side. Activity records device ID as Volunteer ID,
server role as Volunteer Role and Provisioned Scanner as Scan Source. This is a
device audit identity, not independently verified human identity; administrators
must keep a private device-to-operator assignment record if required. The old
Volunteers tab and PIN pepper are not used by HMAC.

## Browser, CORS, hosting and rate limits

The selected staging UI calls same-origin /api/enroll, /api/session and
/api/attendance. GitHub Pages alone cannot serve these routes. Merely setting
CORS on a separate Worker does not connect this client. Choose a dedicated HTTPS
staging origin that serves the static staging build AND routes /api/* to the
Worker, or separately approve a client/API-origin redesign. Do not publish the
credential-bearing staging UI on a shared github.io origin. Default camera Pages
build and its deployment workflow remain unchanged; no staging deployment occurs
on this branch.

Worker origin configuration must be an exact HTTPS origin; missing/malformed
configuration fails closed. Foreign browser origins are refused; preflight permits
only POST, Authorization and Content-Type. Origin-less server requests still need
the relevant credential: CORS is not authentication. Do not add no-cors, JSONP,
query-string credentials or state-changing GET routes. ContentService redirects
are followed server-to-server only to the expected echo host/path using GET with
no copied secret headers or POST body. Actual redirect/CORS behavior is untested.

Durable limits: admin/enroll route classes have 60/minute coarse windows;
authorized attendance has 120/minute per-device windows including retries. Excess
requests return 429; the scanner keeps uncertain attendance pending for explicit
retry. These defaults are not measured capacity and do not replace independent
edge/IP limits against unauthenticated traffic, restricted admin access, request
cost budgets, log redaction and retention controls. No cloud rules are provisioned.
Browser device credentials remain vulnerable to same-origin XSS or a phone holder;
use dedicated origin, strict CSP, HTTPS and controlled devices.

## Safe replacement with clasp — STOP before upload without approval

1. Download/clone feature/attendance-integration, verify the reviewed commit and
   locate the three selected top-level backend files. Do not select the archived
   prepared-staging directory. backend/.claspignore excludes that directory.
2. Independently verify the Script ID in Project Settings of Annual Day 2026 -
   STAGING Backend. Use the authorized staging Google account. Check existing
   deployments/triggers and preserve a local backup of current source (for example,
   clasp clone VERIFIED_STAGING_SCRIPT_ID from a fresh backup-only directory).
   Never reuse a production .clasp.json. Do not commit credentials or backup code.
3. In a separate clean local upload directory create src/ and copy ONLY
   Attendance.gs, Staging.gs and appsscript.json into it. Create a local .clasp.json:

```json
{
  "scriptId": "VERIFIED_EXISTING_STAGING_SCRIPT_ID",
  "rootDir": "src"
}
```

4. Use an already installed clasp (or install it on the owner's authorized machine),
   clasp login if required, then clasp status. Confirm only these three selected
   files are pending; there must be no prepared StagingConfig/Utils/VolunteerAuth,
   setup or legacy files in src. Source upload replaces the remote project content,
   so review that removal explicitly. Avoid --force. STOP for upload approval.
5. After explicit upload approval only: clasp push. This is source replacement,
   not deployment. Read back the project to a separate directory and compare all
   source/manifest files; verify old baseline functions are absent. Do not deploy,
   run attendance functions or enable either write gate. The upload must not invoke
   journal preparation. The manifest describes future transport settings, not
   evidence of a current deployment.
6. Configure and verify HMAC nonsecret properties with both attendance gates false.
   Journal creation, secret provisioning, hosting/resource setup, deployment and
   remote tests each remain outside this code-preparation step. Obtain separate
   approval for the exact next operation; do not treat source upload approval as
   permission to enable attendance.

## Validation and unresolved runtime evidence

Automated tests run against the actual Apps Script source in Node VM with Google
services replaced by synthetic doubles, plus Worker/storage/browser transport
mocks. No Google API, actual device enrollment or remote attendance was exercised.
They validate emitted atomic-batch shape and retry behavior; they do not prove
Google transaction behavior, cloud concurrency, quotas or deployed isolation.

Remaining evidence: verified script ID/remote source, properties and triggers;
staging sharing/other writers; journal readback; advanced API authorization;
secret provisioning and admin/operator custody; approved dedicated hosting and
edge limits; deployment access/version/redirect behavior; independently approved
unauthorized/role/replay/retry/concurrency tests; physical phone camera/session
acceptance; measured capacity and retention/rollback policy. No capacity claim.

The next approval is **source replacement upload only** to the verified existing
staging project, with readback and both attendance gates disabled. It does not
include journal creation, deployment, secret publication or attendance testing.

Step 64 local validation: 77 offline cases passed; ESLint, credential-pattern scan,
Apps Script syntax checks and camera/staging builds passed. The eight Chromium
scenarios were attempted but could not start because this sandbox denies binding
127.0.0.1:4173 (EPERM). They are not reported as passing locally. PR CI runs them
with synthetic cameras and mocked APIs; neither result is a remote attendance test.
