> SUPERSEDED: the owner selected the Apps Script-only native Camera package in native-staging/README.md. This historical bridge plan is not selected and must not be combined with it.

Follow [Step 64](../docs/STEP-64-STAGING-HMAC.md) for the selected HMAC adapter and existing staging workbook. No workbook creation or seeding is permitted.

# Staging scanner bridge

Read [the integration guide](../docs/ATTENDANCE-INTEGRATION.md) for the current
architecture, security limitations, resource creation, deployment, capacity tests
and rollback instructions. It supersedes the initial authorization-only proposal.

The owner approved bridge implementation, with no paid provisioning or production
deployment. The Worker and Apps Script adapter are staging-only. Writes require
both independently configured staging flags; the template keeps them disabled.
No Google/Cloudflare resource has been created or deployed in this session.

All routes are POST application/json, body-limited and no-store:

| Route (same-origin /api prefix) | Authorization | Purpose |
| --- | --- | --- |
| /admin/provision | Administrator bearer | Mint five-minute single-use Gate/Meal code |
| /enroll | Provisioning code in body | Issue twelve-hour device credential |
| /session | Device bearer | Recover server role, badge base and expiry |
| /admin/revoke | Administrator bearer | Revoke device ID |
| /attendance | Device bearer plus role check | Signed, staging-only Apps Script request |

Every attendance request rechecks authoritative device status. No shared key goes
into the browser or QR. Revocation cannot cancel an already-authorized request.
CORS is exact-origin but is not authorization. Configure edge/IP limits, restricted
admin access, redacted logging and account budget controls before deployment.
Do not deploy on a shared Pages origin with browser-stored device credentials.

`wrangler.example.jsonc` has workers.dev disabled and no public route. Set
BRIDGE_SIGNING_KEY and ADMIN_BEARER through the provider's secret store. Current
account credentials, deployment IDs and secret values must never be committed.

Local tests: `node --test --test-isolation=none --test-reporter=spec tests/*.test.js`.
Cloudflare storage and Google services are mocked. Actual runtime validation and
physical phone testing remain outstanding.


Attendance has an additional durable per-device limit of 120 requests per minute, including retries. Provisioning/admin retain their coarse 60/minute route-class limits. These are operational defaults, not measured event capacity; edge/IP and restricted admin access are deployment blockers.
