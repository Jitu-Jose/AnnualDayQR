function headerMap_(headers) {
  var m = {};

  headers.forEach(function(x, i) {
    m[String(x).trim()] = i;
  });

  return m;
}

function newId_(prefix) {
  return prefix + '-' +
    Utilities.getUuid()
      .replace(/-/g, '')
      .substring(0, 10)
      .toUpperCase();
}

function newToken_() {
  return Utilities.getUuid()
    .replace(/-/g, '')
    .substring(0, 16)
    .toUpperCase();
}

function esc_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function js_(s) {
  return String(s == null ? '' : s)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r?\n/g, ' ');
}

function dateText_(d) {
  if (!d) return '';

  try {
    return Utilities.formatDate(
      new Date(d),
      Session.getScriptTimeZone(),
      'dd-MMM-yyyy h:mm a'
    );
  } catch (e) {
    return String(d);
  }
}

function attendeeByToken_(token) {

  var sh = ss_().getSheetByName('Attendees');
  var data = sh.getDataRange().getValues();

  if (data.length < 2) return null;

  var h = headerMap_(data[0]);

  for (var i = 1; i < data.length; i++) {

    if (
      String(data[i][h['QR Token']] || '')
        .trim()
        .toUpperCase() === token
    ) {
      return {
        sh: sh,
        row: i + 1,
        h: h,
        values: data[i]
      };
    }
  }

  return null;
}


function logActivity_(r, h, action, result, volunteerId, volunteerRole) {

  ss_()
    .getSheetByName('Activity')
    .appendRow([
      new Date(),
      r[h['Badge ID']],
      r[h['Registration ID']],
      r[h['Attendee Name']],
      r[h['Department']],
      action,
      result,
      volunteerId || '',
      volunteerRole || '',
      volunteerId ? 'Volunteer Scanner' : 'Legacy Scanner'
    ]);
}

function simplePage_(colour, title, note) {

  return '<!doctype html>' +
    '<html>' +
    '<head>' +
    '<style>' +
    baseCss_() +
    '</style>' +
    '</head>' +

    '<body style="background:' + colour + ';color:white">' +
    '<div class="wrap">' +
    '<h1>' + esc_(title) + '</h1>' +
    '<p>' + esc_(note) + '</p>' +
    '</div>' +
    '</body>' +
    '</html>';
}

function baseCss_() {

  return 'body{font-family:Arial,sans-serif;margin:0}' +
    '.light{background:#f4f6f8;color:#222}' +
    '.scanner{background:#0b5d3b;color:#fff}' +
    '.wrap{max-width:900px;margin:auto;padding:18px}' +
    '.sub{margin-bottom:14px;opacity:.9}' +
    '.filters{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}' +
    'select,button{font-size:16px;padding:10px;border-radius:8px;border:1px solid #bbb}' +
    '.card{background:#fff;color:#222;border-radius:12px;padding:14px;margin:10px 0;box-shadow:0 1px 4px #0002}' +
    '.row{display:flex;justify-content:space-between;gap:12px}' +
    '.card h2{margin:0 0 5px}' +
    '.muted{color:#666;margin-top:4px}' +
    '.warn{color:#a33;margin-top:6px}' +
    '.status{font-weight:bold}' +
    '.actions{margin-top:10px;display:flex;gap:8px}' +
    '.ok{background:#1b5e20;color:#fff}' +
    '.bad{background:#b71c1c;color:#fff}' +
    '.scan{width:100%;font-size:24px;font-weight:bold;color:#fff;border:0;padding:20px}' +
    '.gate{background:#0d47a1}' +
    '.food{background:#4a148c}' +
    '.done{font-size:20px;font-weight:bold;padding:15px;color:#1b5e20}' +
    '.notice,.success,.error{background:#fff;color:#222;padding:12px;border-radius:10px;margin:10px 0}' +
    '.success{color:#1b5e20}' +
    '.error{color:#b71c1c}' +
    'button:disabled{opacity:.45}';
}