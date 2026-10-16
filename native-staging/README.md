# Native Camera attendance — selected staging implementation

This package supersedes the HMAC/Cloudflare approach and prepared legacy baseline
for the current requirements. Use only the four files in native-staging/src:
Native.gs, Login.html, Badge.html, appsscript.json. Do not combine them with
backend/, bridge/, old scanner pages, approval code or registration helpers.
No camera code, external JavaScript, additional hosting or new dependencies are
included. Existing camera/bridge files remain historical material; CI no longer
builds, launches or deploys them. No upload, deployment, Script Properties changes,
remote tests, seeding or attendance enablement has been performed for this change.

## Two volunteer links and existing badges

Once a separately approved staging deployment exists, exactly two login links are:
- `https://script.google.com/macros/s/<STAGING-DEPLOYMENT-ID>/exec?page=gate`
- `https://script.google.com/macros/s/<STAGING-DEPLOYMENT-ID>/exec?page=meal`

These are URL templates, not deployed links. The project has no new deployment.
Staging badge links use that same staging base with `?t=<synthetic-token>`.
Do not follow production badge URLs. Existing QR tokens are not regenerated.
Already-issued production badges point to the original deployment; a separately
approved controlled update to that deployment is eventually required. This
standalone staging project cannot intercept those URLs. Do not overwrite the
production project's registration/approval workflow with this standalone package.

The native Camera reads the QR and offers its link; the volunteer opens that link.
The badge page automatically records once authorization is recovered; no Gate,
Meal, Submit or Confirm buttons are present. HTTP GET itself is read-only. The
loaded page calls google.script.run.nativeRecord with the badge and session token.
There are no public attendee details before authorization, or in result messages.
Unknown/default routes return Not Approved; this standalone staging app does not
expose the legacy approval portal. Its existing production counterpart is untouched.

## Properties to configure later, privately (not changed by this task)

| Script Property | Required value |
| --- | --- |
| ENVIRONMENT | STAGING |
| SPREADSHEET_ID | 1rd-tQCnK5fm_rRzTwipU2gxMg9UP_BpjleIfhLOuqxQ |
| NATIVE_STAGING_SCRIPT_ID | Verified ID of the separate staging Apps Script project |
| STAGING_ATTENDANCE_WRITES_ENABLED | false |
| GATE_PIN | A privately chosen six-digit string |
| MEAL_PIN | A different privately chosen six-digit string |

PINs are stored only as owner-configured Script Properties and never in source,
URLs, localStorage, logs or sheets. A staging script editor can see the properties;
restrict editor access. Never paste PINs into chat or commit populated configs.
Server-side comparison is role-specific. Five failed attempts per role within a
one-minute window block that role until the window ends. This small shared limit
is persistent and locked, but can temporarily block all volunteers of a role.
It is not a public high-volume anti-abuse service; no extra infrastructure is used.

## Sessions and real-device limitation

A successful login issues a random two-UUID bearer token. The device persists only
that token in localStorage under a staging-specific key. Role and expiry are never
trusted from device state. Script Properties store only its SHA-256 digest plus
role, createdAt and expiresAt, fixed at exactly eight hours after login. Access is
rejected at the expiry boundary; scans never extend it. CacheService is not used.
Expired sessions are removed at later logins; the store is bounded to 300 active
sessions. This is a small-event session store, not an unlimited auth platform.
A role-switch login replaces the stored token and revokes the supplied previous
token server-side. Server-side token deletion revokes a session. Both PINs are
shared, so audit identity represents a login session, not an individual person.
Changing a PIN alone does not revoke previously issued sessions. Do not remove
Script Properties session records during the eight-hour shift unless revoking them.

Storage access is handled defensively. If a badge page cannot retrieve a token it
displays Not Approved without making an attendance call. Login reports an error if
it cannot save the returned token; it must not claim usable authorization then.
An expired token can remain in browser storage, but the server still rejects it.

**Eight-hour server validity is implemented; eight-hour browser recovery is not
proven.** Apps Script HTML Service runs inside a sandboxed iframe. Real phones
must demonstrate that successive native Camera links share access to the login's
storage across actual tabs/origins/browser profiles. A different browser, private
mode, embedded viewer, storage partition or blocked persistence may lose access.
No cookie, Google-user identity or fingerprint fallback bypasses authorization.
The workflow requires a normal browser context that passes staging validation;
if either required device cannot do so, revisit the requirement before attendance
activation. Offline JS shared-storage tests are not physical-phone evidence.

## Attendance and reporting compatibility

All reads/writes open only the hardcoded staging ID after matching environment,
spreadsheet property and verified project ID. Workbook title and either India
timezone alias are checked. Only Attendees (14 exact headers) and Activity (10)
are used. Registrations, Volunteers and any old ScannerRequests journal are
untouched. No sheet creation, reset, registration, approval or badge generation
functions are included.

Authorization is checked server-side under a ScriptLock before every write.
The only compatibility wrapper, recordBadgeAction, also requires a valid session
whose server role matches the requested action; old calls lacking a session fail.
Do not upload duplicate legacy definitions that could override the guarded route.
The HTTP route never writes; RPC helpers have private trailing-underscore names.

Eligibility follows the supplied source: exact Status=Active. In the established
workflow, approved registrations generate Active attendees. No registration status
is changed or inferred from browser input. If a different independent approval
condition is required, it needs an explicit schema/rule decision before activation.
The token is trimmed/uppercased and must match exactly one row; zero or ambiguous
matches return Not Approved. Gate writes Entry Time; Meal writes Meal Time without
requiring Gate. The other timestamp stays unchanged.

One advanced Sheets batch atomically commits the timestamp and ten-column Activity
row, including date formats. Existing gate/food action and ENTRY OK/MEAL OK result
values are retained for reporting. Volunteer ID is the session digest, Volunteer
Role is GATE/MEAL and Scan Source is Native Camera Session. No PIN or raw bearer is
written to Activity. The lock serializes this project's scans, and a nonblank
role timestamp yields Already Recorded with no extra audit row.

No extra journal is needed for this simplified response contract: timestamp plus
Activity commit together, and a retry after lost acknowledgement returns Already
Recorded. It does not reconstruct the original successful response or log duplicate
attempts. Unexpected failures or timeouts never claim success; the volunteer can
rescan the same badge. Original timestamps are never cleared or overwritten.
Locks do not coordinate manual editors or other script projects. Restrict staging
sharing/other writers before validation (anyone-with-link editing was previously
observed). Source checks do not restrict the deployer's broader Google permissions.

Visible results: Entry Recorded, Meal Recorded, Already Recorded or Not Approved.
Configuration/connection/API failures display a technical error. The disabled
staging gate displays Staging attendance writes are disabled, not a false success.
Only the exact string true would permit writes; it remains false.

## Upload and approval boundaries

Next proposed operation: source-only replacement in the existing separate staging
Apps Script project, with readback and attendance writes still disabled. Requires
explicit upload approval and independent confirmation of its Script ID first.
No new Apps Script project is needed. Preserve a local backup of its current source.
Use a clean local directory with ONLY these four files in src and a local clasp
configuration pointing at the verified staging Script ID with rootDir=src.
Do not copy .clasp.json from any other project or commit login credentials.

Run clasp status to inspect the pending files. After upload approval only, clasp
push replaces project source; do not force. Read back to a separate directory and
compare all four files; verify every bridge/legacy function is absent. Upload is
not deployment. The manifest's webapp settings describe intended later transport
as deployer/anonymous; actual deployment settings need review. Enablement of the
advanced Sheets v4 service and associated API is needed for eventual atomic writes.

PIN property configuration, a new staging deployment, writes-disabled real-phone
session checks, and later synthetic attendance tests each need separate approval.
No SETUP_V2, new workbook, attendee reseeding or registration edits are required.
Any production migration needs an isolated patch/route audit against the actual
original project's source, preservation of approval/registration code and explicit
owner authorization. This package is not a production replacement project.

## Validation

Offline Node VM tests run the actual Apps Script source with Google services
replaced by in-memory doubles and inspect the emitted atomic batch. Browser-page
scripts are also evaluated with mocked DOM, storage and google.script.run. No
camera is launched, cloud endpoint contacted or remote attendance written.
Coverage includes PIN throttling, distinct roles, durable eight-hour expiry,
role replacement/revocation, disabled writes, authorization bypass attempts,
normalized duplicate tokens, eligibility, independent timestamps, atomic audit,
failures before/after commit, duplicate rescans, storage failure and auto-submit.
Physical iPhone/Android persistence, actual Apps Script context behavior, OAuth,
Sheets atomicity under real load, quotas, response times and production deployment
parity remain unverified. There is no cloud throughput claim.
