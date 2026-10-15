import test from 'node:test';
import assert from 'node:assert/strict';
import { assertAllowedFingerprint, assertStagingTarget, assertStagingLoadTarget, PROTECTED_SPREADSHEET_SHA256 } from '../scripts/staging-safety.js';

const syntheticId = 'SYNTHETIC_STAGING_ONLY_0001';
const config = () => ({ environment: 'staging', spreadsheetId: syntheticId,
  allowedStagingSpreadsheetIds: [syntheticId], attendanceWritesEnabled: false });

test('preflight accepts only an explicitly allowlisted staging target with writes disabled', () => {
  assert.equal(assertStagingTarget(config()).spreadsheetId, syntheticId);
  assert.equal(Object.isFrozen(assertStagingTarget(config())), true);
});
test('protected fingerprint is rejected even if mistakenly allowlisted', () => {
  assert.throws(() => assertAllowedFingerprint(PROTECTED_SPREADSHEET_SHA256,
    [PROTECTED_SPREADSHEET_SHA256]), /protected/);
});
test('unknown fingerprints fail closed', () => {
  assert.throws(() => assertAllowedFingerprint('synthetic', []), /allowlisted/);
});
test('missing, production and unspecified environments are rejected', () => {
  for (const environment of [undefined, '', 'production', 'test']) {
    assert.throws(() => assertStagingTarget({ ...config(), environment }), /Staging/);
  }
  assert.throws(() => assertStagingTarget(null), /Staging/);
});
test('missing and malformed IDs are rejected without echoing them', () => {
  for (const spreadsheetId of [undefined, '', 'bad', 'https://example.invalid', 'x'.repeat(101), 42]) {
    assert.throws(() => assertStagingTarget({ ...config(), spreadsheetId }), /Invalid/);
  }
});
test('non-allowlisted targets and malformed allowlists are rejected', () => {
  for (const allowedStagingSpreadsheetIds of [undefined, [], 'all', [null], ['*']]) {
    assert.throws(() => assertStagingTarget({ ...config(), allowedStagingSpreadsheetIds }));
  }
});
test('write enablement cannot be smuggled into preparation configuration', () => {
  for (const attendanceWritesEnabled of [undefined, true, 'false', 0]) {
    assert.throws(() => assertStagingTarget({ ...config(), attendanceWritesEnabled }), /disabled/);
  }
});
test('load runner requires separate explicit enablement and exact origin allowlisting', () => {
  const value = { ...config(),attendanceWritesEnabled:true,scannerOrigin:'https://staging.example.invalid',
    allowedStagingOrigins:['https://staging.example.invalid'] };
  assert.equal(assertStagingLoadTarget(value).origin,'https://staging.example.invalid');
  for (const change of [{ attendanceWritesEnabled:false },{ allowedStagingOrigins:[] },
    { scannerOrigin:'http://staging.example.invalid' },{ environment:'production' },{ allowedStagingSpreadsheetIds:[] }]) {
    assert.throws(() => assertStagingLoadTarget({ ...value,...change }));
  }
});
