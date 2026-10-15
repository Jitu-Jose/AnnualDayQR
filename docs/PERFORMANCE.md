# Performance and capacity report

## Evidence boundaries

No phones, deployed Pages site, existing Apps Script source or staging Sheets integration have been tested. Event throughput and safe simultaneous scanner count are unknown. Unit tests and synthetic-camera browser decoding do not measure backend capacity.

The prototype limits decoder attempts to 12 per second and suppresses repeated identical QR results for 2.5 seconds. It records `camera-initialization` as a browser Performance measure and the first detection as a Performance mark without storing QR data. First detection time includes the operator's time presenting a badge and is not a pure decoder latency benchmark. Use known-time synthetic frames or instrumented phone video for detection latency. Phone startup is also displayed on screen. No camera timing is currently a capacity claim.

## Staging measurement plan after camera acceptance

1. Inspect actual token lookup, lock scope, read/write batching, cache validity, triggers and Apps Script deployment identity. Pin official quota documentation and the account tier/date; limits can change. Measure actual execution duration and exceptions, not assumed published maxima.
2. Create a separate staging spreadsheet with synthetic attendee records representative of 6,000 attendees and expected activity growth. Never run a destructive setup against production. Preserve approval/active semantics and test duplicate checks inside the same atomic operation as writes.
3. Measure 1, 2, 4, 8 and increasing concurrent synthetic clients with unique and repeated tokens. Collect p50/p95/p99 lookup, lock wait, commit, total backend and end-to-end latency; success/error rates; timeouts; rows written; execution overlap and quota errors. Include response-loss-after-commit retries and simultaneous Gate/Meal actions.
4. A script-wide lock with mean critical-section duration `s` seconds has a theoretical ceiling below `1/s` writes/second; queueing and quotas reduce this. Whole-sheet scans may grow with rows and add contention. Do not replace lookup/indexing until authoritative code, cache invalidation and registration-write concurrency are understood.
5. Test at least twice the agreed peak arrival rate with representative bursts, then publish a conservative capacity recommendation with headroom. For example, 6,000 people in 30 minutes implies 3.33 people/second **on average**, not the burst target; Gate and Meal traffic differ. Event arrival windows and volunteer counts remain inputs.

Required acceptance: no duplicate Gate/Meal records under concurrency or safe retries, bounded lock waits, explicit failures on quota exhaustion, no false success, and an agreed latency/error budget. A limit or service failure must stop admission confirmation rather than silently queue offline admissions. No offline reconciliation process is authorized.
