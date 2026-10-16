// Standalone STAGING ONLY. Do not upload alongside legacy or bridge source.
var NATIVE_ID_ = '1rd-tQCnK5fm_rRzTwipU2gxMg9UP_BpjleIfhLOuqxQ';
var NATIVE_TITLE_ = 'Annual Day 2026 - STAGING TEST ONLY';
var NATIVE_HOURS_ = 8 * 60 * 60 * 1000;
var NATIVE_HEADERS_ = ['Badge ID','Registration ID','Staff Name','Employee ID','Department','Mobile Number','Attendee Name','Relationship','Age','QR Token','Printed At','Entry Time','Meal Time','Status'];
var NATIVE_ACTIVITY_ = ['Timestamp','Badge ID','Registration ID','Attendee Name','Department','Action','Result','Volunteer ID','Volunteer Role','Scan Source'];
function nativeConfig_() {
  var p = PropertiesService.getScriptProperties();
  if (p.getProperty('ENVIRONMENT') !== 'STAGING' || p.getProperty('SPREADSHEET_ID') !== NATIVE_ID_ ||
      !p.getProperty('NATIVE_STAGING_SCRIPT_ID') || p.getProperty('NATIVE_STAGING_SCRIPT_ID') !== ScriptApp.getScriptId()) {
    throw new Error('STAGING_CONFIGURATION_REQUIRED');
  }
  return p;
}
function nativeDigest_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
    .map(function(b) { return ('0'+((b+256)%256).toString(16)).slice(-2); }).join('');
}
function nativeEqual_(a,b) {
  if (a.length !== b.length) return false;
  var d = 0;
  for (var i=0;i<a.length;i++) d |= a.charCodeAt(i)^b.charCodeAt(i);
  return d === 0;
}
function nativeDenied_() { return { code: 'NOT_APPROVED', message: 'Not Approved' }; }
function nativeError_() { return { code: 'ERROR', message: 'Technical error. Attendance is not confirmed. Scan again after checking the connection.' }; }
function nativeSession_(token,p) {
  if (typeof token !== 'string' || !/^[a-fA-F0-9-]{72}$/.test(token)) return null;
  var key = 'NATIVE_SESSION_'+nativeDigest_(token);
  var raw = p.getProperty(key);
  if (!raw) return null;
  var s;
  try { s = JSON.parse(raw); } catch (_) { return null; }
  if (!s || ['GATE','MEAL'].indexOf(s.role)<0 || !Number.isFinite(s.createdAt) ||
      !Number.isFinite(s.expiresAt) || s.expiresAt !== s.createdAt+NATIVE_HOURS_ ||
      Date.now()<s.createdAt || Date.now()>=s.expiresAt) return null;
  return { role:s.role, id:key.substring('NATIVE_SESSION_'.length), expiresAt:s.expiresAt };
}
// PINs never leave Script Properties; callers supply only the login PIN in RPC body.
function nativeLogin(role,pin,previousToken) {
  var lock = LockService.getScriptLock();
  try {
    var p = nativeConfig_();
    if (['GATE','MEAL'].indexOf(role)<0 || typeof pin !== 'string' || !/^[0-9]{6}$/.test(pin)) return nativeDenied_();
    if (!lock.tryLock(10000)) return nativeError_();
    var gate = p.getProperty('GATE_PIN') || '';
    var meal = p.getProperty('MEAL_PIN') || '';
    if (!/^[0-9]{6}$/.test(gate) || !/^[0-9]{6}$/.test(meal) || gate === meal) return nativeError_();
    var now = Date.now();
    var key = 'NATIVE_FAILURES_'+role;
    var prior = JSON.parse(p.getProperty(key) || 'null');
    var window = prior && prior.until>now ? prior : { count:0,until:now+60000 };
    if (window.count>=5) return { code:'THROTTLED',message:'Too many PIN attempts. Wait one minute and try again.' };
    if (!nativeEqual_(pin,role==='GATE' ? gate : meal)) {
      window.count++;
      p.setProperty(key,JSON.stringify(window));
      return nativeDenied_();
    }
    // Bounded persistent store, with expired sessions removed only at login.
    var all = p.getProperties(); var count = 0;
    Object.keys(all).forEach(function(k) {
      if (k.indexOf('NATIVE_SESSION_')!==0) return;
      var saved;
      try { saved=JSON.parse(all[k]); } catch (_) { saved=null; }
      if (!saved || !(saved.expiresAt>now)) p.deleteProperty(k); else count++;
    });
    if (count>=300) return nativeError_();
    var token = Utilities.getUuid()+Utilities.getUuid();
    var digest = nativeDigest_(token);
    p.setProperty('NATIVE_SESSION_'+digest,JSON.stringify({ role:role,createdAt:now,expiresAt:now+NATIVE_HOURS_ }));
    // Role replacement revokes the previous browser token if supplied.
    if (typeof previousToken==='string' && /^[a-fA-F0-9-]{72}$/.test(previousToken)) {
      p.deleteProperty('NATIVE_SESSION_'+nativeDigest_(previousToken));
    }
    p.deleteProperty(key);
    return { code:'AUTHORIZED',token:token,role:role };
  } catch (_) { return nativeError_(); }
  finally { if (lock.hasLock()) lock.releaseLock(); }
}
function nativeSchema_(sheet,headers) {
  if (!sheet || sheet.getLastColumn() !== headers.length ||
      JSON.stringify(sheet.getRange(1,1,1,headers.length).getValues()[0])!==JSON.stringify(headers)) throw new Error('SCHEMA');
}
// Sole attendance implementation; role is always read from the server session.
function nativeRecord(token,sessionToken) {
  return nativeRecord_(token,sessionToken,null);
}
// Compatibility guard: any retained caller must supply a valid matching role session.
// Never upload the old recordBadgeAction definition alongside this wrapper.
function recordBadgeAction(token,action,sessionToken) {
  if (action!=='gate' && action!=='food') return nativeDenied_();
  return nativeRecord_(token,sessionToken,action==='gate' ? 'GATE' : 'MEAL');
}
function nativeRecord_(token,sessionToken,expectedRole) {
  var lock = LockService.getScriptLock();
  try {
    var p = nativeConfig_();
    if (!lock.tryLock(10000)) return nativeError_();
    var session = nativeSession_(sessionToken,p);
    if (!session || expectedRole && session.role!==expectedRole) return nativeDenied_();
    if (typeof token!=='string' || !token.trim() || token.length>512 || /[\x00-\x20\x7f]/.test(token.trim())) return nativeDenied_();
    token = token.trim().toUpperCase();
    if (p.getProperty('STAGING_ATTENDANCE_WRITES_ENABLED')!=='true') {
      return { code:'WRITES_DISABLED',message:'Staging attendance writes are disabled.' };
    }
    var ss = SpreadsheetApp.openById(NATIVE_ID_);
    if (ss.getId()!==NATIVE_ID_ || ss.getName()!==NATIVE_TITLE_ ||
        ['Asia/Kolkata','Asia/Calcutta'].indexOf(ss.getSpreadsheetTimeZone())<0) throw new Error('STAGING_IDENTITY');
    var attendees = ss.getSheetByName('Attendees'); var activity = ss.getSheetByName('Activity');
    nativeSchema_(attendees,NATIVE_HEADERS_); nativeSchema_(activity,NATIVE_ACTIVITY_);
    var matches = [];
    if (attendees.getLastRow()>1) {
      attendees.getRange(2,10,attendees.getLastRow()-1,1).getValues().forEach(function(r,i) {
        if (String(r[0] || '').trim().toUpperCase()===token) matches.push(i+2);
      });
    }
    if (matches.length!==1) return nativeDenied_();
    var row = attendees.getRange(matches[0],1,1,14).getValues()[0];
    if (String(row[9] || '').trim().toUpperCase()!==token || String(row[13])!=='Active') return nativeDenied_();
    var column = session.role==='GATE' ? 11 : 12;
    if (row[column]) return { code:'ALREADY_RECORDED',message:'Already Recorded' };
    var now = new Date(); var serial = (now.getTime()+330*60000)/86400000+25569;
    var audit = [serial,row[0],row[1],row[6],row[4],session.role==='GATE' ? 'gate' : 'food',
      session.role==='GATE' ? 'ENTRY OK' : 'MEAL OK',session.id,session.role,'Native Camera Session'];
    var cells = audit.map(function(v) { return { userEnteredValue: typeof v==='number' ? { numberValue:v } : { stringValue:String(v==null ? '' : v) } }; });
    var format = { numberFormat:{ type:'DATE_TIME',pattern:'dd-mmm-yyyy h:mm:ss' } };
    cells[0].userEnteredFormat = format;
    // One API transaction: either both attendance and Activity commit, or neither.
    Sheets.Spreadsheets.batchUpdate({ requests:[
      { updateCells:{ range:{ sheetId:attendees.getSheetId(),startRowIndex:matches[0]-1,endRowIndex:matches[0],startColumnIndex:column,endColumnIndex:column+1 },
        rows:[{ values:[{ userEnteredValue:{ numberValue:serial },userEnteredFormat:format }] }],fields:'userEnteredValue,userEnteredFormat.numberFormat' } },
      { appendCells:{ sheetId:activity.getSheetId(),rows:[{ values:cells }],fields:'userEnteredValue,userEnteredFormat.numberFormat' } }
    ] },NATIVE_ID_);
    return session.role==='GATE' ? { code:'ENTRY_RECORDED',message:'Entry Recorded' } : { code:'MEAL_RECORDED',message:'Meal Recorded' };
  } catch (_) { return nativeError_(); }
  finally { if (lock.hasLock()) lock.releaseLock(); }
}
function doGet(e) {
  var q = e && e.parameter || {};
  var page;
  // Exactly two role login URLs: ?page=gate and ?page=meal. GET never records.
  if ((q.page==='gate' || q.page==='meal') && !q.t) {
    page = HtmlService.createTemplateFromFile('Login');
    page.role = q.page==='gate' ? 'GATE' : 'MEAL';
  } else if (typeof q.t==='string' && q.t && !q.page) {
    page = HtmlService.createTemplateFromFile('Badge');
    page.tokenJson = JSON.stringify(q.t).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  } else {
    return HtmlService.createHtmlOutput('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><h1>Not Approved</h1>');
  }
  return page.evaluate().addMetaTag('viewport','width=device-width, initial-scale=1');
}
