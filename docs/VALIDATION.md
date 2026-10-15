# Current-instance validation — 15 October 2026

From `/workspace/annual-day-2026-scanner`, Node 24.19.0 and npm 11.9.0:

| Check | Result |
| --- | --- |
| Frozen `npm ci` using workspace npm cache | Passed |
| ESLint | Passed |
| Node unit tests | 3 passed, 0 failed, 0 skipped |
| Credential-pattern check | Passed; limited format scanner |
| Vite production build | Passed |
| Playwright, installed Chromium, synthetic canvas camera | 5 passed, 0 failed, 0 skipped |
| npm audit, production and development dependencies | 0 reported advisories |
| Git diff whitespace check | Passed |
| Pages deployment, published HTTPS check | Blocked by GitHub API network access |
| Physical iPhone/Android camera tests | Not run |
| Existing Apps Script source review | Blocked by repository visibility/access |
| Login, roles, sessions, attendance, staging Sheets and capacity | Not implemented or run; gated on phone acceptance |

Browser checks decode actual generated QR image frames through the library's browser decoder, alternate payloads, observe repeated detections, stop tracks, reject invalid URL shapes, recover from denied permission, refresh safely, show offline messaging and recover from a synthetic track-ended event. They do not simulate real optical conditions, iOS/WebKit behavior, native permission UI, physical app switching or an actual hardware interruption. They exercise the built site on an internal loopback origin; no user-facing preview URL is provided.

Initial test fixture failures were corrected: the synthetic QR needed to fit inside the decoder's central scan crop, permission denial needed to persist across camera fallback attempts, and the network assertion needed to treat a same-origin blob worker as local. The final run above used clean lockfile installation and the final application build.

No production Google service was accessed, no attendance was recorded, and no live code, sheets, forms, approvals, badges or credentials were changed. A network-only configuration draft adding `api.github.com` was saved, preserving existing network presets; it has not been activated or published. Fresh-task restoration has not been verified.
