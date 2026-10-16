import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { backendFixture, stagingId } from './helpers/backend-fixture.js';

const helper = (f) => vm.runInContext(readFileSync(new URL('../backend/Staging.gs',import.meta.url),'utf8'),f.context);
test('both India timezone aliases allow a commit; other zones fail without writes', () => {
  for (const timeZone of ['Asia/Kolkata','Asia/Calcutta','UTC','Etc/GMT','Europe/London']) {
    const f = backendFixture(); f.workbook.timeZone = timeZone;
    assert.equal(f.post().code,timeZone.startsWith('Asia/') ? 'ENTRY_OK' : 'BACKEND_ERROR');
    assert.equal(f.stats().batches,timeZone.startsWith('Asia/') ? 1 : 0);
  }
});
test('target pin rejects a different ID even when the property allowlist agrees', () => {
  const f = backendFixture();
  f.props.STAGING_SPREADSHEET_ID = 'SYNTHETIC_DIFFERENT_TARGET_0001';
  f.props.ALLOWED_STAGING_SPREADSHEET_IDS = JSON.stringify([f.props.STAGING_SPREADSHEET_ID]);
  assert.equal(f.post().code,'BACKEND_ERROR'); assert.equal(f.stats().opened,0);
});
test('allowlist must contain only the pinned staging ID', () => {
  const f = backendFixture();
  f.props.ALLOWED_STAGING_SPREADSHEET_IDS = JSON.stringify([stagingId,'SYNTHETIC_OTHER_TARGET_0001']);
  f.post(); assert.equal(f.stats().opened,0);
});
test('wrong workbook title or returned identity fails before writes', () => {
  for (const change of [{ title:'Other staging' },{ id:'SYNTHETIC_OTHER_TARGET_0001' }]) {
    const f = backendFixture(); Object.assign(f.workbook,change);
    assert.equal(f.post().code,'BACKEND_ERROR'); assert.equal(f.stats().batches,0);
  }
});
test('write flag must be exact true; disabled requests never open a workbook', () => {
  for (const value of ['false',undefined,'TRUE',true,'']) {
    const f = backendFixture(); f.props.STAGING_WRITES_ENABLED = value;
    assert.equal(f.post().code,'WRITES_DISABLED');
    assert.equal(f.stats().opened,0); assert.equal(f.stats().batches,0);
  }
});
test('normalized duplicate tokens fail closed for both Gate and Meal', () => {
  for (const action of ['GATE','MEAL']) {
    const f = backendFixture(); f.sheets.Attendees.rows[2][9] = ' stage1 ';
    assert.equal(f.post({ action }).code,'BACKEND_ERROR');
    assert.equal(f.stats().batches,0); assert.equal(f.stats().locked,false);
  }
});
test('both roles commit timestamp, ten-column audit and bound journal in one batch', () => {
  for (const action of ['GATE','MEAL']) {
    const f = backendFixture(); const result = f.post({ action });
    assert.equal(f.submitted.length,1); assert.equal(f.submitted[0].length,3);
    assert.equal(f.submitted[0][1].appendCells.rows[0].values[0].userEnteredFormat.numberFormat.type,'DATE_TIME');
    const audit = f.sheets.Activity.rows[1];
    assert.equal(audit.length,10); assert.equal(audit[7],'c'.repeat(64));
    assert.equal(audit[8],action); assert.equal(audit[9],'Provisioned Scanner');
    assert.equal(audit[5],action === 'GATE' ? 'gate' : 'food');
    assert.equal(result.role,action);
    assert.ok(f.sheets.Attendees.rows[1][action === 'GATE' ? 11 : 12] instanceof Date);
    assert.equal(f.sheets.Attendees.rows[1][action === 'GATE' ? 12 : 11],'');
    assert.deepEqual(f.post({ action,issuedAt:Date.now()+1000 }),result);
    assert.equal(f.stats().batches,1);
  }
});
test('both roles recover precommit failure and lost commit response without audit loss', () => {
  for (const action of ['GATE','MEAL']) for (const mode of ['before','after']) {
    const f = backendFixture(); f.injectFailure(mode);
    assert.equal(f.post({ action }).code,'BACKEND_ERROR');
    assert.equal(f.sheets.Activity.rows.length,mode === 'before' ? 1 : 2);
    assert.equal(f.post({ action }).code,action === 'GATE' ? 'ENTRY_OK' : 'MEAL_OK');
    assert.equal(f.sheets.Activity.rows.length,2); assert.equal(f.sheets.ScannerRequests.rows.length,2);
    assert.equal(f.stats().batches,1);
  }
});
test('missing or mismatched journal rejects attendance without changing records', () => {
  for (const change of [(f) => { delete f.sheets.ScannerRequests; },
    (f) => { f.sheets.ScannerRequests.rows[0][1] = 'Wrong Header'; }]) {
    const f = backendFixture(); change(f);
    assert.equal(f.post().code,'BACKEND_ERROR'); assert.equal(f.stats().batches,0);
    assert.equal(f.sheets.Attendees.rows[1][11],''); assert.equal(f.sheets.Activity.rows.length,1);
  }
});
test('journal preparation requires separate flag, pinned confirmation and disabled writes', () => {
  const f = backendFixture(); helper(f);
  for (const change of [{ STAGING_WRITES_ENABLED:'true',STAGING_JOURNAL_PREPARATION_ENABLED:'true' },
    { STAGING_WRITES_ENABLED:'false',STAGING_JOURNAL_PREPARATION_ENABLED:'false' }]) {
    Object.assign(f.props,change);
    assert.throws(() => f.context.prepareScannerRequests_(stagingId),/NOT_AUTHORIZED/);
  }
  f.props.STAGING_JOURNAL_PREPARATION_ENABLED = 'true';
  assert.throws(() => f.context.prepareScannerRequests_('wrong'),/NOT_AUTHORIZED/);
  assert.equal(f.stats().batches,0); assert.equal(f.stats().opened,0);
});
test('journal preparation atomically adds only the journal and is idempotent', () => {
  const f = backendFixture(); helper(f); delete f.sheets.ScannerRequests;
  Object.assign(f.props,{ STAGING_WRITES_ENABLED:'false',STAGING_JOURNAL_PREPARATION_ENABLED:'true' });
  const before = structuredClone(f.sheets.Attendees.rows); let batches = 0;
  f.context.Sheets.Spreadsheets.batchUpdate = (body,id) => {
    assert.equal(id,stagingId); assert.equal(body.requests.length,2);
    const add = body.requests[0].addSheet; const update = body.requests[1].updateCells;
    assert.equal(add.properties.title,'ScannerRequests');
    assert.equal(add.properties.sheetId,update.range.sheetId);
    assert.deepEqual(Array.from(update.rows[0].values,cell => cell.userEnteredValue.stringValue),
      ['Request Key','Payload Digest','Response JSON']);
    f.sheets.ScannerRequests = new f.sheets.Activity.constructor(add.properties.sheetId,
      [Array.from(update.rows[0].values,cell => cell.userEnteredValue.stringValue)]);
    batches++;
  };
  assert.equal(f.context.prepareScannerRequests_(stagingId).created,true);
  assert.equal(f.context.prepareScannerRequests_(stagingId).exists,true);
  assert.equal(batches,1); assert.equal(f.stats().locked,false);
  assert.deepEqual(f.sheets.Attendees.rows,before); assert.equal(f.sheets.Activity.rows.length,1);
  assert.equal(f.props.STAGING_WRITES_ENABLED,'false');
});
test('journal preparation refuses a damaged existing journal and releases lock on failure', () => {
  const f = backendFixture(); helper(f);
  Object.assign(f.props,{ STAGING_WRITES_ENABLED:'false',STAGING_JOURNAL_PREPARATION_ENABLED:'true' });
  f.sheets.ScannerRequests.rows[0].pop();
  assert.throws(() => f.context.prepareScannerRequests_(stagingId),/SCHEMA_MISMATCH/);
  assert.equal(f.stats().locked,false); assert.equal(f.stats().batches,0);
});
test('selected backend has no workbook creation, seeding or prepared implementation', () => {
  const source = ['Attendance.gs','Staging.gs'].map(name => readFileSync(new URL('../backend/'+name,import.meta.url),'utf8')).join('\n');
  assert.doesNotMatch(source.replace(/\/\/[^\n]*/g,''),/SpreadsheetApp\.(create|getActive)|SETUP_V2|createSyntheticStaging_|volunteerLogin/);
  const ignore = readFileSync(new URL('../backend/.claspignore',import.meta.url),'utf8');
  assert.equal(ignore,'**/**\n!Attendance.gs\n!Staging.gs\n!appsscript.json\n');
});
