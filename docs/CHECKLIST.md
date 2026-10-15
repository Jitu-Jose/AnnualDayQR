# Delivery checklist

- [x] Attempt read-only authoritative source access; document denial.
- [x] Attempt scanner discovery and repository creation; document denial.
- [x] Prepare local scanner repository without touching existing live files.
- [x] Implement camera-only continuous scanning and safe URL shape parsing.
- [x] Add synthetic-data unit/browser tests and recovery checks.
- [x] Add least-privilege PR validation and Pages workflow.
- [x] Document security, proposed architecture, capacity testing and phone operations.
- [ ] Inspect authoritative source and current uncommitted auth/scanner files.
- [ ] Confirm remote scanner owner and repository access; push branch/open PR.
- [ ] Apply branch/environment protections and Pages source settings.
- [ ] Deploy and verify returned HTTPS URL and assets.
- [ ] Pass physical iPhone Safari and Android Chrome camera acceptance.
- [ ] Select and approve backend architecture using inspected source.
- [ ] Implement and test authentication, roles, session restore and staging attendance.
- [ ] Test valid/invalid PIN, throttling, expiry, unauthorized role, inactive badges, Gate/Meal duplicates, concurrent commit and network retries in staging.
- [ ] Measure backend capacity, lock contention, quotas and safe scanner count.
- [ ] Obtain explicit approval before deploying attendance-writing endpoints or changing production Apps Script.
- [ ] Publish production-readiness report based on real integration and device evidence.

The remaining backend deliverables are deferred by the explicit camera-acceptance gate, not represented by passing mock attendance tests.
