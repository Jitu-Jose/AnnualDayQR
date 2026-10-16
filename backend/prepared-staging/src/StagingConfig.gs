var STAGING_SPREADSHEET_ID = '1rd-tQCnK5fm_rRzTwipU2gxMg9UP_BpjleIfhLOuqxQ';
var STAGING_EXPECTED_TITLE = 'Annual Day 2026 - STAGING TEST ONLY';
function ss_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('ENVIRONMENT') !== 'STAGING' ||
      props.getProperty('SPREADSHEET_ID') !== STAGING_SPREADSHEET_ID) {
    throw new Error('Staging configuration required');
  }
  var ss = SpreadsheetApp.openById(STAGING_SPREADSHEET_ID);
  if (ss.getId() !== STAGING_SPREADSHEET_ID || ss.getName() !== STAGING_EXPECTED_TITLE) {
    throw new Error('Staging identity mismatch');
  }
  return ss;
}
function requireStagingAttendanceEnabled_() {
  ss_();
  if (PropertiesService.getScriptProperties().getProperty('STAGING_ATTENDANCE_WRITES_ENABLED') !== 'true') {
    throw new Error('Staging attendance writes disabled');
  }
}
