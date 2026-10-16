import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createHash, createHmac } from 'node:crypto';

export const signingKey = 'b'.repeat(64);
export const stagingId = '1rd-tQCnK5fm_rRzTwipU2gxMg9UP_BpjleIfhLOuqxQ';
export const scriptId = 'SYNTHETIC_STAGING_SCRIPT';
export const audience = 'synthetic-staging-audience';
export const deviceId = 'c'.repeat(64);
export const requestId = '00000000-0000-4000-8000-000000000001';
const sha = (value) => createHash('sha256').update(value).digest();
class Sheet {
  constructor(id, rows) { this.id = id; this.rows = rows; }
  getSheetId() { return this.id; }
  getLastColumn() { return this.rows[0].length; }
  getLastRow() { return this.rows.length; }
  getRange(row, column, height = 1, width = 1) {
    return { getValues:() => structuredClone(Array.from({ length:height },(_, r) =>
      Array.from({ length:width },(_, c) => this.rows[row+r-1]?.[column+c-1] ?? ''))) };
  }
}
export function backendFixture() {
  const workbook = { id: stagingId, title: 'Annual Day 2026 - STAGING TEST ONLY', timeZone: 'Asia/Kolkata' };
  const submitted = [];
  let opened = 0;
  let batches = 0;
  let locked = false;
  let fail = '';
  const props = { SCANNER_ENVIRONMENT:'staging',STAGING_SCRIPT_ID:scriptId,
    STAGING_SPREADSHEET_ID:stagingId,ALLOWED_STAGING_SPREADSHEET_IDS:JSON.stringify([stagingId]),
    BRIDGE_SIGNING_KEY:signingKey,SCANNER_AUDIENCE:audience,STAGING_WRITES_ENABLED:'true' };
  const sheets = {};
  const context = vm.createContext({ Date,Number,JSON,Array,String,Error,
    Utilities:{ DigestAlgorithm:{ SHA_256:'SHA256' },Charset:{ UTF_8:'UTF8' },
      computeDigest:(_algorithm,value) => [...sha(value)],
      computeHmacSha256Signature:(value,key) => [...createHmac('sha256',key).update(value).digest()] },
    PropertiesService:{ getScriptProperties:() => ({ getProperties:() => ({ ...props }) }) },
    ScriptApp:{ getScriptId:() => scriptId },
    ContentService:{ MimeType:{ JSON:'application/json' },createTextOutput:(text) => ({
      setMimeType:() => ({ text }) }) },
    LockService:{ getScriptLock:() => ({ tryLock:() => { if (locked) return false; locked = true; return true; },
      releaseLock:() => { locked = false; } }) },
    SpreadsheetApp:{ openById:(id) => {
      if (id !== stagingId) throw new Error('Unexpected target');
      opened++;
      return { getId:() => workbook.id, getName:() => workbook.title,
        getSpreadsheetTimeZone:() => workbook.timeZone,getSheetByName:(name) => sheets[name] };
    } },
    Sheets:{ Spreadsheets:{ batchUpdate:(body,id) => {
      if (id !== stagingId) throw new Error('Unexpected target');
      submitted.push(structuredClone(body.requests));
      if (fail === 'before') { fail = ''; throw new Error('Injected API failure'); }
      // Apply the batch to a clone so all effects commit together in this double.
      const next = Object.fromEntries(Object.entries(sheets).map(([k,v]) => [k,structuredClone(v.rows)]));
      for (const operation of body.requests) {
        const request = operation.updateCells || operation.appendCells;
        const [name] = Object.entries(sheets).find(([,sheet]) => sheet.id === (request.sheetId ?? request.range.sheetId));
        if (operation.updateCells) {
          const range = request.range;
          const serial = request.rows[0].values[0].userEnteredValue.numberValue;
          next[name][range.startRowIndex][range.startColumnIndex] = new Date(Math.round((serial-25569)*86400000-330*60000));
        } else {
          next[name].push(request.rows[0].values.map((cell) => cell.userEnteredValue.stringValue ?? cell.userEnteredValue.numberValue));
        }
      }
      for (const [name,rows] of Object.entries(next)) sheets[name].rows = rows;
      batches++;
      if (fail === 'after') { fail = ''; throw new Error('Injected lost response after commit'); }
      return {};
    } } },
  });
  vm.runInContext(readFileSync(new URL('../../backend/Attendance.gs',import.meta.url),'utf8'),context);
  const headers = [...context.SCANNER_ATTENDEE_HEADERS_];
  const row = (i,status = 'Active') => {
    const values = Array(headers.length).fill('');
    for (const [name,value] of Object.entries({ 'Badge ID':'STAGE-BADGE-'+i,'Registration ID':'STAGE-REG-'+i,
      'Department':'Synthetic Department','Attendee Name':'Synthetic Attendee '+i,'QR Token':'STAGE'+i,Status:status })) {
      values[headers.indexOf(name)] = value;
    }
    return values;
  };
  sheets.Attendees = new Sheet(1,[headers,row(1),row(2),row(3,'Inactive')]);
  sheets.Activity = new Sheet(2,[[...context.SCANNER_ACTIVITY_HEADERS_]]);
  sheets.ScannerRequests = new Sheet(3,[[...context.SCANNER_REQUEST_HEADERS_]]);
  const payload = (overrides = {}) => ({ version:1,environment:'staging',audience,issuedAt:Date.now(),
    requestId,deviceId,action:'GATE',token:'STAGE1',...overrides });
  const envelope = (value) => {
    const text = JSON.stringify(value);
    return { payload:text,signature:createHmac('sha256',signingKey).update(text).digest('hex') };
  };
  const postEnvelope = (value) => JSON.parse(context.doPost({ postData:{ contents:JSON.stringify(value) } }).text);
  return { props,sheets,context,payload,envelope,postEnvelope,workbook,submitted,
    post:(overrides) => postEnvelope(envelope(payload(overrides))),
    stats:() => ({ opened,batches,locked }),lock:() => { locked = true; },injectFailure:(mode) => { fail = mode; } };
}

