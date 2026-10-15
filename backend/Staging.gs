// Run ONLY in a newly created standalone STAGING Apps Script project.
// Always creates a new spreadsheet; cannot clear or seed an existing target.
function createSyntheticStaging_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('SCANNER_ENVIRONMENT') !== 'staging' ||
      props.getProperty('STAGING_SCRIPT_ID') !== ScriptApp.getScriptId() ||
      props.getProperty('STAGING_SPREADSHEET_ID')) throw new Error('NEW_STAGING_PROJECT_REQUIRED');
  var ss = SpreadsheetApp.create('Annual Day 2026 - ISOLATED SYNTHETIC STAGING');
  ss.setSpreadsheetTimeZone('Asia/Kolkata');
  var attendees = ss.insertSheet('Attendees');
  attendees.getRange(1,1,1,SCANNER_ATTENDEE_HEADERS_.length).setValues([SCANNER_ATTENDEE_HEADERS_]);
  var rows = [];
  for (var i=1; i<=50; i++) rows.push(['STAGE-BADGE-'+i,'STAGE-REG-'+i,
    'Synthetic Staff '+i,'STAGE-EMP-'+i,'Synthetic Department','','Synthetic Attendee '+i,
    'Staff','','STAGE'+String(i).padStart(11,'0'),'','','',i===50?'Inactive':'Active']);
  attendees.getRange(2,1,rows.length,SCANNER_ATTENDEE_HEADERS_.length).setValues(rows);
  ['Entry Time','Meal Time'].forEach(function(name) {
    attendees.getRange(2,SCANNER_ATTENDEE_HEADERS_.indexOf(name)+1,rows.length,1).setNumberFormat('dd-mmm-yyyy h:mm:ss');
  });
  var activity = ss.insertSheet('Activity');
  activity.getRange(1,1,1,SCANNER_ACTIVITY_HEADERS_.length).setValues([SCANNER_ACTIVITY_HEADERS_]);
  activity.getRange(2,1,activity.getMaxRows()-1,1).setNumberFormat('dd-mmm-yyyy h:mm:ss');
  var journal = ss.insertSheet('ScannerRequests');
  journal.getRange(1,1,1,3).setValues([SCANNER_REQUEST_HEADERS_]);
  // Store the freshly-created ID only after seeding; no fallback to a bound sheet.
  props.setProperties({ STAGING_SPREADSHEET_ID: ss.getId(),
    ALLOWED_STAGING_SPREADSHEET_IDS: JSON.stringify([ss.getId()]), STAGING_WRITES_ENABLED: 'false' });
  return ss.getId();
}
