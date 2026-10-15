# Security review — camera proof of concept

No credentials or sessions are required or stored. No attendance logic, privileged GET route, public shared key, token URL navigation or Apps Script bridge is included. The original live system has not been audited because source access is blocked.

The static page sets a restrictive meta CSP, no-referrer policy, local dependencies and text-only rendering of fixed messages. Decoded QR text is never inserted into HTML. Only HTTPS `script.google.com/macros/s/<deployment>/exec?t=<token>` shapes are recognized; this is provisional until the actual source is inspected and does not establish badge authenticity. No decoded value is used for a fetch. Camera frames stay local. A short-lived in-memory map is cleared when the camera stops; neither tokens nor images persist through reload.

GitHub Pages cannot set arbitrary response headers from this repository. Meta CSP does not support `frame-ancestors`; users must open the page directly. Production hosting/header needs and any service-worker introduction need a separate review. Client assets are public and must never contain backend secrets. Dependencies are lockfile-pinned, Actions are SHA-pinned, and PR jobs have contents-read only. The simple credential-pattern check is limited and is not a comprehensive secret or history audit; GitHub secret scanning/push protection should be enabled where available. Review npm advisories and upstream library activity before production.

Remaining required reviews: current PIN hashing and throttling, role checks on every route, old QR bypasses, cached session eviction/expiry, shared-account revocation, removal/rotation of test credentials by an authorized operator, exact badge endpoint allowlist, safe browser session storage/XSS impact, rate limits and atomic duplicate prevention. Do not enter or commit real PINs, secret keys, sessions or attendee records. Do not rotate production credentials without explicit approval.

The prototype is **not production ready**. No security claim about the existing backend is made.
