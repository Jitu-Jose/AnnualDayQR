// STAGING ONLY. Deploy in a NEW standalone project, without legacy source.
// Every helper is private to google.script.run (trailing underscore).
var SCANNER_PROTECTED_SHA256_ = '0a6acf713a7dd956f80ea557fa6076e066d3708dc8efdb439adb32cfdb4ce05d';
var SCANNER_ATTENDEE_HEADERS_ = ['Badge ID','Registration ID','Staff Name','Employee ID','Department','Mobile Number','Attendee Name','Relationship','Age','QR Token','Printed At','Entry Time','Meal Time','Status'];
var SCANNER_ACTIVITY_HEADERS_ = ['Timestamp','Badge ID','Registration ID','Attendee Name','Department','Action','Result','Volunteer ID','Volunteer Role','Scan Source'];
var SCANNER_REQUEST_HEADERS_ = ['Request Key','Payload Digest','Response JSON'];

function scannerHex_(bytes) {
  return bytes.map(function(b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}
function scannerDigest_(value) {
  return scannerHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8));
}
function scannerSame_(a, b) {
  if (a.length !== b.length) return false;
  var difference = 0;
  for (var i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
function scannerConfig_() {
  var p = PropertiesService.getScriptProperties().getProperties();
  if (p.SCANNER_ENVIRONMENT !== 'staging' || !p.STAGING_SCRIPT_ID ||
      p.STAGING_SCRIPT_ID !== ScriptApp.getScriptId()) throw new Error('STAGING_ONLY');
  var id = p.STAGING_SPREADSHEET_ID;
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(id || '') || scannerDigest_(id) === SCANNER_PROTECTED_SHA256_) {
    throw new Error('UNSAFE_TARGET');
  }
  var allow = JSON.parse(p.ALLOWED_STAGING_SPREADSHEET_IDS || '[]');
  if (!Array.isArray(allow) || allow.indexOf(id) < 0) throw new Error('UNSAFE_TARGET');
  if (!/^[a-f0-9]{64}$/.test(p.BRIDGE_SIGNING_KEY || '') ||
      !/^[A-Za-z0-9_-]{16,100}$/.test(p.SCANNER_AUDIENCE || '')) throw new Error('NOT_CONFIGURED');
  return { id: id, key: p.BRIDGE_SIGNING_KEY, audience: p.SCANNER_AUDIENCE,
    writes: p.STAGING_WRITES_ENABLED === 'true' };
}
function scannerEnvelope_(text, config) {
  if (typeof text !== 'string' || text.length > 4096) throw new Error('INVALID_REQUEST');
  var envelope = JSON.parse(text);
  if (!envelope || typeof envelope.payload !== 'string' ||
      !/^[a-f0-9]{64}$/.test(envelope.signature || '')) throw new Error('UNAUTHORIZED');
  var expected = scannerHex_(Utilities.computeHmacSha256Signature(envelope.payload, config.key, Utilities.Charset.UTF_8));
  if (!scannerSame_(expected, envelope.signature)) throw new Error('UNAUTHORIZED');
  var p = JSON.parse(envelope.payload);
  if (!p || p.version !== 1 || p.environment !== 'staging' || p.audience !== config.audience ||
      !Number.isSafeInteger(p.issuedAt) || Math.abs(Date.now() - p.issuedAt) > 120000 ||
      !/^[a-f0-9]{64}$/.test(p.deviceId || '') ||
      !/^[a-f0-9-]{36}$/.test(p.requestId || '') || !['GATE','MEAL'].includes(p.action) ||
      typeof p.token !== 'string' || !p.token.trim() || p.token.length > 512 ||
      /[\x00-\x20\x7f]/.test(p.token.trim())) throw new Error('UNAUTHORIZED');
  p.token = p.token.trim().toUpperCase();
  return p;
}
function scannerHeaders_(sheet, expected) {
  if (!sheet) throw new Error('SCHEMA_MISMATCH');
  var row = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
  if (JSON.stringify(row) !== JSON.stringify(expected)) throw new Error('SCHEMA_MISMATCH');
  var h = {};
  row.forEach(function(value, index) { h[value] = index; });
  return h;
}
function scannerMatches_(sheet, column, value) {
  if (sheet.getLastRow() < 2) return [];
  // Read one identifier column, preserving legacy trim/uppercase matching.
  // Do not cache row offsets: registration/HR may move or append records.
  return sheet.getRange(2,column,sheet.getLastRow()-1,1).getValues().reduce(function(matches,row,index) {
    if (String(row[0] || '').trim().toUpperCase() === value.toUpperCase()) matches.push(index+2);
    return matches;
  },[]);
}
function scannerCell_(value) {
  if (typeof value === 'number') return { userEnteredValue: { numberValue: value } };
  return { userEnteredValue: { stringValue: String(value == null ? '' : value) } };
}
function scannerAppend_(sheet, values) {
  return { appendCells: { sheetId: sheet.getSheetId(), rows: [{ values: values.map(scannerCell_) }], fields: 'userEnteredValue' } };
}
function scannerResult_(code, request, row, h) {
  function iso(column) {
    var value = row[h[column]];
    if (!value) return '';
    return new Date(value).toISOString();
  }
  return { code: code, requestId: request.requestId, role: request.action,
    attendeeName: String(row[h['Attendee Name']] || ''),
    entryTime: iso('Entry Time'), mealTime: iso('Meal Time') };
}
function scannerRecord_(request, config) {
  if (!config.writes) return { code: 'WRITES_DISABLED', requestId: request.requestId };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { code: 'BUSY_RETRY', requestId: request.requestId };
  try {
    // Explicit ID only, never SpreadsheetApp.getActive() fallback.
    var ss = SpreadsheetApp.openById(config.id);
    if (ss.getSpreadsheetTimeZone() !== 'Asia/Kolkata') throw new Error('SCHEMA_MISMATCH');
    var attendees = ss.getSheetByName('Attendees');
    var activity = ss.getSheetByName('Activity');
    var requests = ss.getSheetByName('ScannerRequests');
    var h = scannerHeaders_(attendees, SCANNER_ATTENDEE_HEADERS_);
    scannerHeaders_(activity, SCANNER_ACTIVITY_HEADERS_);
    scannerHeaders_(requests, SCANNER_REQUEST_HEADERS_);
    var key = request.deviceId + ':' + request.requestId;
    var binding = scannerDigest_(JSON.stringify([request.deviceId,request.action,request.token]));
    var prior = scannerMatches_(requests,1,key);
    if (prior.length > 1) throw new Error('JOURNAL_CONFLICT');
    if (prior.length) {
      var saved = requests.getRange(prior[0],1,1,3).getValues()[0];
      if (saved[1] !== binding) return { code: 'REQUEST_CONFLICT', requestId: request.requestId };
      return JSON.parse(saved[2]);
    }
    var matches = scannerMatches_(attendees,h['QR Token']+1,request.token);
    // A malformed source sheet with duplicate tokens must never choose a row.
    if (matches.length > 1) throw new Error('TOKEN_CONFLICT');
    if (!matches.length) return { code: 'INVALID_BADGE', requestId: request.requestId };
    var rowNumber = matches[0];
    var row = attendees.getRange(rowNumber,1,1,SCANNER_ATTENDEE_HEADERS_.length).getValues()[0];
    if (String(row[h['QR Token']] || '').trim().toUpperCase() !== request.token) throw new Error('TOKEN_CONFLICT');
    if (String(row[h['Status']]) !== 'Active') return { code: 'BADGE_INACTIVE', requestId: request.requestId };
    var column = request.action === 'GATE' ? 'Entry Time' : 'Meal Time';
    var duplicate = !!row[h[column]];
    var code = duplicate ? (request.action === 'GATE' ? 'ALREADY_ENTERED' : 'MEAL_ALREADY_SERVED') :
      (request.action === 'GATE' ? 'ENTRY_OK' : 'MEAL_OK');
    var now = new Date();
    if (!duplicate) row[h[column]] = now;
    var result = scannerResult_(code,request,row,h);
    var operations = [];
    if (!duplicate) {
      // Sheets numeric date serial uses local Asia/Kolkata wall time. Responses
      // contain UTC ISO timestamps; spreadsheet display remains a real date cell.
      var serial = (now.getTime() + 330*60000)/86400000 + 25569;
      operations.push({ updateCells: { range: { sheetId: attendees.getSheetId(),
        startRowIndex: rowNumber-1, endRowIndex: rowNumber,
        startColumnIndex: h[column], endColumnIndex: h[column]+1 },
        rows: [{ values: [{ userEnteredValue: { numberValue: serial },
          userEnteredFormat: { numberFormat: { type: 'DATE_TIME', pattern: 'dd-mmm-yyyy h:mm:ss' } } }] }],
        fields: 'userEnteredValue,userEnteredFormat.numberFormat' } });
      operations.push(scannerAppend_(activity,[serial,row[h['Badge ID']],row[h['Registration ID']],
        row[h['Attendee Name']],row[h['Department']],request.action === 'GATE' ? 'gate' : 'food',
        code.replace(/_/g,' '),request.deviceId,request.action,'Provisioned Scanner']));
    }
    // One batch is atomic in Sheets: timestamp + audit + durable retry result.
    // ScriptLock coordinates requests within this new isolated project only.
    operations.push(scannerAppend_(requests,[key,binding,JSON.stringify(result)]));
    Sheets.Spreadsheets.batchUpdate({ requests: operations },config.id);
    return result;
  } finally { lock.releaseLock(); }
}
function scannerJson_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
function doGet() { return scannerJson_({ code: 'METHOD_NOT_ALLOWED' }); }
function doPost(e) {
  try {
    var config = scannerConfig_();
    var request = scannerEnvelope_(e && e.postData && e.postData.contents,config);
    return scannerJson_(scannerRecord_(request,config));
  } catch (error) {
    // Do not leak tokens, keys, attendee data or internal errors to callers/logs.
    return scannerJson_({ code: error && error.message === 'UNAUTHORIZED' ? 'SCANNER_NOT_AUTHORIZED' : 'BACKEND_ERROR' });
  }
}
