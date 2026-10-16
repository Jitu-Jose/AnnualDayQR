# Prepared staging backend — local package published 16 October 2026

This is the minimal package prepared during spreadsheet initialization in the Drive chat. It is separate from the PR's existing HMAC bridge adapter in backend/Attendance.gs and backend/Staging.gs. Do not combine the two packages: they have different authentication, properties and entry points. This package has no doGet/doPost and cannot yet serve the QR scanner. Upload is source transfer only, not deployment or readiness.

## Provenance and verification

Original workspace source: /workspace/work/annualday-staging/package/backend/ (four .js files plus appsscript.json). Published copies use Apps Script .gs extensions in src/. A missing VOLUNTEER_SESSION_SECONDS declaration was restored from the sanitized source; the original eight-hour request is preserved, but Apps Script cache TTL/eviction does not guarantee an eight-hour session and requires correction/review before login testing.

All published source was manually inspected and syntax-checked. No private credential values, PIN literals, authorization secrets, actual attendee records, QR token literals, production spreadsheet ID, production deployment URL, production script ID or clasp credential/configuration files are included. Property names are not secrets. Only the authorized staging spreadsheet ID is embedded. Data fixtures and the raw uploaded legacy archive are excluded. Headers are source-derived; Volunteers headers label six positional source fields.

Staging target is hard-pinned, its title and matching ENVIRONMENT/SPREADSHEET_ID properties are checked, there is no active-sheet fallback, and attendance writes require an explicit true property. No setup, registration/approval, test helper or public HTTP entry point is included. Gate/Meal logic remains source-derived. Attendance and Activity writes are separate and not atomic; runtime/concurrency/session validation remains pending. Syntax checks are not behavioral tests or complete isolation proof.

## Download and prepare locally

Use GitHub branch feature/attendance-integration, Code > Download ZIP, extract it, then open backend/prepared-staging. Alternatively:

```sh
git clone --single-branch --branch feature/attendance-integration https://github.com/Jitu-Jose/AnnualDayQR.git
cd AnnualDayQR/backend/prepared-staging
```

Only src/ is Apps Script code. Keep schema.json and script-properties.nonsecret.json outside the upload root. Do not upload the parent backend directory, its other adapter, bridge files or the original ZIP.

## Link the owner's existing STAGING project (no new project)

The following are owner-run instructions; Codex has not run clasp or contacted Apps Script. Use the Google account owning Annual Day 2026 - STAGING Backend. Enable the Apps Script API in that account if clasp requires it. With clasp installed, run clasp login locally. Never commit .clasprc.json or authentication tokens.

In the Apps Script editor open Project Settings and copy the Script ID of that exact staging project (not a deployment ID). Create .clasp.json locally in this prepared-staging directory:

```json
{
  "scriptId": "PASTE_VERIFIED_STAGING_SCRIPT_ID_HERE",
  "rootDir": "src"
}
```

Do not copy any old production .clasp.json. Verify the ID against the staging editor before proceeding. The project title alone does not establish its ID. Run:

```sh
clasp status
```

Review the list: only Attendance.gs, StagingConfig.gs, Utils.gs, VolunteerAuth.gs and appsscript.json should be pending. Preserve any owner code already in the destination before uploading; clasp push can overwrite project source. Do not use --force.

Stop here under the current instruction. After source-upload authorization, the owner can run:

```sh
clasp push
```

Push uploads source; it does not create a deployment. Do not run clasp deploy, clasp run, SETUP_V2 or any attendance helper. No upload was performed in this task.

After upload, set the three properties from script-properties.nonsecret.json manually in the staging project's Script Properties. Keep STAGING_ATTENDANCE_WRITES_ENABLED=false. A separate staging-only VOLUNTEER_PIN_PEPPER and synthetic volunteers will need secure provisioning later; no credentials are included. Do not put credentials in the spreadsheet or GitHub. Do not enable writes or deploy until separately approved and the package/adapter choice and runtime blockers are resolved.
