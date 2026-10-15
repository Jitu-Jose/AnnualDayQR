import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { backendFixture } from './helpers/backend-fixture.js';

test('Gate commits Entry Time, existing-format audit and retry result together', () => {
  const f = backendFixture();
  assert.equal(f.post().code,'ENTRY_OK');
  assert.equal(f.stats().batches,1);
  assert.ok(f.sheets.Attendees.rows[1][11] instanceof Date);
  assert.equal(f.sheets.Attendees.rows[1][12],'');
  assert.equal(f.sheets.Activity.rows.length,2);
  assert.deepEqual(Array.from(f.sheets.Activity.rows[1].slice(5,7)),['gate','ENTRY OK']);
  assert.equal(f.sheets.ScannerRequests.rows.length,2);
});
test('duplicate Gate scan from another scanner preserves timestamp and one audit', () => {
  const f = backendFixture();
  const first = f.post();
  const duplicate = f.post({ deviceId:'d'.repeat(64) });
  assert.equal(duplicate.code,'ALREADY_ENTERED');
  assert.equal(duplicate.entryTime,first.entryTime);
  assert.equal(f.sheets.Activity.rows.length,2);
});
test('Meal does not require Gate; duplicates preserve Meal Time', () => {
  const f = backendFixture();
  const first = f.post({ action:'MEAL' });
  assert.equal(first.code,'MEAL_OK');
  assert.equal(first.entryTime,'');
  const next = f.post({ action:'MEAL',deviceId:'d'.repeat(64) });
  assert.equal(next.code,'MEAL_ALREADY_SERVED');
  assert.equal(next.mealTime,first.mealTime);
  assert.equal(f.sheets.Activity.rows.length,2);
});
test('legacy token normalization accepts case and surrounding whitespace', () => {
  const f = backendFixture();
  f.sheets.Attendees.rows[1][9] = ' stage1 ';
  assert.equal(f.post({ token:' stage1 ' }).code,'ENTRY_OK');
});
test('invalid and inactive badges cause no writes', () => {
  const f = backendFixture();
  assert.equal(f.post({ token:'not-a-badge' }).code,'INVALID_BADGE');
  assert.equal(f.post({ token:'STAGE3' }).code,'BADGE_INACTIVE');
  assert.equal(f.stats().batches,0);
});
test('empty/malformed tokens, roles, stale signatures and wrong audiences never open Sheets', () => {
  for (const override of [{ token:'' },{ token:'a\nb' },{ action:'ADMIN' },
    { issuedAt:Date.now()-130000 },{ audience:'other-audience' },{ environment:'production' },{ requestId:'bad' }]) {
    const f = backendFixture();
    assert.equal(f.post(override).code,'SCANNER_NOT_AUTHORIZED');
    assert.equal(f.stats().opened,0);
  }
});
test('unsigned or tampered requests never open Sheets', () => {
  const f = backendFixture();
  assert.equal(f.postEnvelope({ payload:'{}',signature:'a'.repeat(64) }).code,'SCANNER_NOT_AUTHORIZED');
  const envelope = f.envelope(f.payload());
  envelope.payload = envelope.payload.replace('GATE','MEAL');
  assert.equal(f.postEnvelope(envelope).code,'SCANNER_NOT_AUTHORIZED');
  assert.equal(f.stats().opened,0);
});
test('same request replay returns original response; changed payload is rejected', () => {
  const f = backendFixture();
  const first = f.post();
  assert.deepEqual(f.post(),first);
  assert.equal(f.stats().batches,1);
  assert.equal(f.post({ token:'STAGE2' }).code,'REQUEST_CONFLICT');
  assert.equal(f.post({ action:'MEAL' }).code,'REQUEST_CONFLICT');
});
test('API failure before commit leaves neither timestamp nor audit and can retry', () => {
  const f = backendFixture(); f.injectFailure('before');
  assert.equal(f.post().code,'BACKEND_ERROR');
  assert.equal(f.sheets.Attendees.rows[1][11],'');
  assert.equal(f.sheets.Activity.rows.length,1);
  assert.equal(f.sheets.ScannerRequests.rows.length,1);
  assert.equal(f.stats().locked,false);
  assert.equal(f.post().code,'ENTRY_OK');
});
test('lost API response after commit recovers original result without a second audit', () => {
  const f = backendFixture(); f.injectFailure('after');
  assert.equal(f.post().code,'BACKEND_ERROR');
  assert.equal(f.post().code,'ENTRY_OK');
  assert.equal(f.stats().batches,1);
  assert.equal(f.sheets.Activity.rows.length,2);
});
test('lock contention returns retry without opening Sheets', () => {
  const f = backendFixture(); f.lock();
  assert.equal(f.post().code,'BUSY_RETRY');
  assert.equal(f.stats().opened,0);
});
test('schema mismatch and duplicate QR tokens fail closed', () => {
  for (const change of [(f) => { f.sheets.Activity.rows[0].pop(); },
    (f) => { f.sheets.Attendees.rows[2][9] = 'STAGE1'; }]) {
    const f = backendFixture(); change(f);
    assert.equal(f.post().code,'BACKEND_ERROR');
    assert.equal(f.stats().batches,0);
    assert.equal(f.stats().locked,false);
  }
});
test('staging isolation, script binding, allowlist and write gate run before Sheets', () => {
  for (const change of [{ SCANNER_ENVIRONMENT:'production' },{ STAGING_SCRIPT_ID:'different-script' },
    { ALLOWED_STAGING_SPREADSHEET_IDS:'[]' },{ STAGING_WRITES_ENABLED:'false' },{ STAGING_SPREADSHEET_ID:'' }]) {
    const f = backendFixture(); Object.assign(f.props,change); f.post();
    assert.equal(f.stats().opened,0);
  }
});
test('protected spreadsheet fingerprint is independently denied by deployed guard', () => {
  const f = backendFixture();
  // Override only the digest service in the local double: no production ID is
  // present in this test or used as a configured/attempted network target.
  const protectedBytes = Buffer.from(f.context.SCANNER_PROTECTED_SHA256_,'hex');
  f.context.Utilities.computeDigest = () => [...protectedBytes];
  f.post(); assert.equal(f.stats().opened,0);
});
test('staging initializer creates a new synthetic workbook once and leaves writes disabled', () => {
  const f = backendFixture();
  delete f.props.STAGING_SPREADSHEET_ID;
  f.context.PropertiesService.getScriptProperties = () => ({ getProperty:(key) => f.props[key],
    setProperties:(values) => Object.assign(f.props,values) });
  const created = {};
  let creates = 0;
  f.context.SpreadsheetApp.create = () => {
    creates++;
    return { setSpreadsheetTimeZone:() => {},getId:() => 'NEW_SYNTHETIC_STAGING_0001',insertSheet:(name) => {
      created[name] = [];
      return { getMaxRows:() => 1000,getRange:(row) => ({
        setValues:(values) => { created[name].push({ row,values }); },setNumberFormat:() => {},
      }) };
    } };
  };
  vm.runInContext(readFileSync(new URL('../backend/Staging.gs',import.meta.url),'utf8'),f.context);
  f.context.createSyntheticStaging_();
  assert.equal(creates,1); assert.equal(f.props.STAGING_WRITES_ENABLED,'false');
  assert.equal(created.Attendees[1].values.length,50);
  assert.equal(created.Attendees[1].values[49][13],'Inactive');
  assert.throws(() => f.context.createSyntheticStaging_(),/NEW_STAGING_PROJECT_REQUIRED/);
  assert.equal(creates,1); assert.equal(f.stats().opened,0);
});
