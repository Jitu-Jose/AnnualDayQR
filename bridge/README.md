# Staging authorization bridge

Implementation approved for development only; no paid resource or production
deployment is authorized. This module is not connected to the camera app yet.

Run offline tests from the repository root:

```sh
node --test --test-isolation=none --test-reporter=spec tests/*.test.js
```

No dependencies or network access are needed for those unit tests. The in-memory
storage double serializes transactions but does not simulate the Cloudflare
runtime, persistence, outages, billing or actual concurrency. Perform deployment
tests before relying on the implementation.

## Deployment preparation

Review docs/ATTENDANCE-INTEGRATION.md, current Cloudflare pricing and the staging
account first. No Cloudflare account/credentials are configured in this session.
The example Wrangler config disables workers.dev and has no public route. Do not
publish it publicly until edge/IP rate limits, logging redaction and account
budget controls are configured and reviewed. Enrollment/admin currently have a
coarse global limit of 60 requests per minute per route group; this can be used
for denial of service and does not replace edge controls. Session traffic also
needs edge limits. No credentials or QR bodies should be logged.

Copy wrangler.example.jsonc to a local ignored file outside this repository, use
the reviewed staging-only account and confirm Durable Object/free plan support.
Store a new 32-byte random lowercase hex ADMIN_BEARER using the provider's secret
store, never in configuration or frontend assets. Keep it in an administrator's
password manager. The staging environment flag is mandatory and cannot be set
to production. There is no production configuration in this branch. Never supply
a Google credential or spreadsheet ID to this authorization-only Worker.

The following deployment sequence must be performed using a pinned, reviewed
Wrangler version in the authorized account; it has not been run here:

1. Configure the exact dedicated scanner origin, isolated staging bindings and
   secret. Choose a private staging route/access policy for initial runtime tests.
2. Deploy with workers.dev still disabled; attach only the reviewed staging route.
3. Test CORS, errors, expiry, actual transactional redemption and revocation using
   synthetic staging credentials. Record version, configuration and measured results.
4. Only after source/schema review, implement the signed Apps Script transport and
   server-side isolation/idempotency. Do not change the existing 503 response into
   an unconditional success. No attendance adapter exists in this branch.

## Protocol

All requests use POST with application/json and bounded bodies (2 KiB). Responses
are JSON with no-store. Credentials are never accepted in query parameters.

| Route | Authorization | JSON body | Result |
| --- | --- | --- | --- |
| /admin/provision | Admin bearer | role: GATE or MEAL | Single-use code, five-minute expiry |
| /enroll | Single-use code in body | code only | Device credential, ID, server role and expiry |
| /session | Device bearer | empty object | Role/expiry for refresh recovery |
| /admin/revoke | Admin bearer | deviceId | Revokes subsequent authorizations |
| /attendance | Device bearer | action | 403 for wrong role; 503 BACKEND_NOT_CONFIGURED otherwise |

No UI currently stores a device credential. A later integration must resolve the
dedicated-origin/browser-storage decision before wiring provisioning into Pages.
There is no GET write endpoint. Unknown routes and malformed requests fail closed.
The adapter and backend eligibility checks remain required even with bridge auth.

Revocation cannot cancel an already-authorized request in flight. ADMIN_BEARER is
a powerful staging-only bootstrap credential, not a complete multi-user admin
identity system. Restrict admin routes at the edge to administrators before
exposure. No bearer credential is hardware bound. The staging code has no alarm
cleanup for expired records yet; implement retention before prolonged operation.

Rollback: remove the staging route/disable its deployment and revoke staging
devices. Preserve test evidence. No Google data needs rollback because no Google
client exists in this bridge. Frontend camera code is unchanged.
