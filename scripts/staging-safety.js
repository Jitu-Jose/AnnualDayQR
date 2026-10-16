import { createHash } from 'node:crypto';

// Fingerprint of the live spreadsheet supplied by the owner. The literal ID
// stays out of fixtures, environment templates and CI configuration.
export const PROTECTED_SPREADSHEET_SHA256 =
  '0a6acf713a7dd956f80ea557fa6076e066d3708dc8efdb439adb32cfdb4ce05d';

export function assertAllowedFingerprint(fingerprint, allowedFingerprints) {
  if (fingerprint === PROTECTED_SPREADSHEET_SHA256) {
    throw new Error('Refusing protected spreadsheet target');
  }
  if (!Array.isArray(allowedFingerprints) || !allowedFingerprints.includes(fingerprint)) {
    throw new Error('Target is not explicitly allowlisted for staging');
  }
}

// Local preflight only. No Google API calls, credentials or writes.
// Future staging runners must call this before constructing a network client.
function assertStagingIdentity(config) {
  if (!config || config.environment !== 'staging') throw new Error('Staging environment required');
  const id = config.spreadsheetId;
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{20,100}$/.test(id)) {
    throw new Error('Invalid staging spreadsheet ID');
  }
  if (!Array.isArray(config.allowedStagingSpreadsheetIds) ||
      config.allowedStagingSpreadsheetIds.some((value) => typeof value !== 'string' ||
        !/^[A-Za-z0-9_-]{20,100}$/.test(value))) {
    throw new Error('Explicit staging allowlist required');
  }
  const fingerprint = (value) => createHash('sha256').update(value).digest('hex');
  assertAllowedFingerprint(fingerprint(id), config.allowedStagingSpreadsheetIds.map(fingerprint));
  return id;
}
export function assertStagingTarget(config) {
  const id = assertStagingIdentity(config);
  if (config.attendanceWritesEnabled !== false) {
    throw new Error('Preparation configuration must keep attendance writes disabled');
  }
  return Object.freeze({ environment: 'staging', spreadsheetId: id, attendanceWritesEnabled: false });
}

export function assertStagingLoadTarget(config) {
  const id = assertStagingIdentity(config);
  if (config.attendanceWritesEnabled !== true) throw new Error('Explicit staging write enablement required');
  const origin = new URL(config.scannerOrigin);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' ||
      origin.search || origin.hash || !Array.isArray(config.allowedStagingOrigins) ||
      !config.allowedStagingOrigins.includes(origin.origin)) throw new Error('Staging origin not allowlisted');
  return Object.freeze({ spreadsheetId:id,origin:origin.origin });
}
