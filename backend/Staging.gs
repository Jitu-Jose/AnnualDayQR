// EXISTING staging workbook only. No creation/seeding/reset functions.
// Read-only preview; callable from the editor, never from the public web endpoint.
function scannerJournalPlan_() {
  var target = scannerTarget_();
  var ss = scannerWorkbook_(target.id);
  scannerHeaders_(ss.getSheetByName('Attendees'), SCANNER_ATTENDEE_HEADERS_);
  scannerHeaders_(ss.getSheetByName('Activity'), SCANNER_ACTIVITY_HEADERS_);
  var journal = ss.getSheetByName('ScannerRequests');
  if (journal) scannerHeaders_(journal, SCANNER_REQUEST_HEADERS_);
  return { spreadsheetId: target.id, tab: 'ScannerRequests',
    headers: SCANNER_REQUEST_HEADERS_.slice(), exists: !!journal,
    attendanceWritesEnabled: target.properties.STAGING_WRITES_ENABLED === 'true' };
}
// Prepared for a separately approved owner run. Does NOT run during clasp push.
// This creates only the missing journal tab, atomically with its three headers.
function prepareScannerRequests_(confirmation) {
  var target = scannerTarget_();
  if (confirmation !== SCANNER_STAGING_ID_ ||
      target.properties.STAGING_WRITES_ENABLED !== 'false' ||
      target.properties.STAGING_JOURNAL_PREPARATION_ENABLED !== 'true') {
    throw new Error('JOURNAL_PREPARATION_NOT_AUTHORIZED');
  }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('BUSY_RETRY');
  try {
    var plan = scannerJournalPlan_();
    if (plan.exists) return plan; // Never clear, reseed or overwrite an existing tab.
    var journalId = 640064;
    Sheets.Spreadsheets.batchUpdate({ requests: [
      { addSheet: { properties: { sheetId: journalId, title: 'ScannerRequests',
        gridProperties: { rowCount: 1000, columnCount: 3, frozenRowCount: 1 } } } },
      { updateCells: { range: { sheetId: journalId, startRowIndex: 0, endRowIndex: 1,
        startColumnIndex: 0, endColumnIndex: 3 },
        rows: [{ values: SCANNER_REQUEST_HEADERS_.map(scannerCell_) }], fields: 'userEnteredValue' } }
    ] }, target.id);
    return { spreadsheetId: target.id, tab: 'ScannerRequests', created: true,
      headers: SCANNER_REQUEST_HEADERS_.slice() };
  } finally { lock.releaseLock(); }
}
