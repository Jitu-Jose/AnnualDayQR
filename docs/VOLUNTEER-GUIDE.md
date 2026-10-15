# Phone camera acceptance and volunteer guide

This build does not admit anyone or record a meal. Do not use it to decide whether an attendee may enter. Keep the existing event process in place.

## Exact phone test

Once a verified Pages HTTPS URL is provided, perform this checklist separately on a physical iPhone and Android phone. Record phone model, OS version, browser version, URL, deployed commit and time. Do not put badge tokens or attendee information in the report or screenshots.

1. **iPhone:** open the URL directly in Safari. **Android:** open directly in Chrome. Avoid WhatsApp/other embedded browsers. iPhone Chrome can be tested additionally, but does not replace Safari acceptance.
2. Confirm the page says **CAMERA TEST ONLY**. Tap **Start camera**, allow camera permission, and verify the rear preview opens. Record startup time displayed under the preview. If permission was previously denied, enable it in browser/site settings and tap **Restart camera**.
3. Present an existing test badge without opening its QR URL. Confirm **QR DETECTED**, a detection count increment and the explicit **No attendance recorded** notice. No attendee name or token should appear. An unrecognized URL can mean the expected shape differs; report a redacted format for review, not a live token.
4. Alternate between two different synthetic/test badges for at least 30 scans without navigation. Hold one badge steady: its count must not increase more often than once every 2.5 seconds. This is camera debounce, not attendance duplicate prevention.
5. Scan a non-badge QR. Confirm **UNRECOGNIZED QR**; no site should open. Toggle sound and test sound/vibration where the phone supports them. Silent feedback must remain usable.
6. Tap **Stop camera**. Verify the camera indicator turns off. Tap **Restart camera**, then scan again.
7. Switch apps for 15 seconds, return and tap **Restart camera**. Repeat after locking/unlocking the phone. Refresh: the counter resets, camera is stopped, and Start camera is available.
8. Deny permission on a fresh site-permission state. Confirm clear permission instructions, then re-enable permission and restart successfully.
9. Load the page, then enable airplane mode. Confirm offline messaging and no admission-success wording. A fresh offline page load is not guaranteed. Restore connectivity.
10. Test outdoors, in shade, low light, on laminated badges and with different QR sizes/distances. Record unreadable conditions and scan-to-feedback timings. Run a 15-minute continuous scan/idle/recovery session on both phones.

Acceptance requires both phones to complete these checks. Report failures with device/browser and step, without private data. Synthetic-stream Chromium tests do not constitute phone acceptance. Only after acceptance may backend development proceed. No attendance-writing deployment is authorized by passing this checklist.

## Future production guide

Pending backend integration, separate staging tests and production approval. Production instructions must cover role-specific login, server-validated session restore, green acknowledged commit, amber duplicate timestamp, red invalid/unauthorized and explicit connection-error retry. Those behaviors do not exist in this camera build.
