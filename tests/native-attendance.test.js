import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { backendFixture, scriptId, stagingId } from './helpers/backend-fixture.js';
const source = readFileSync(new URL('../native-staging/src/Native.gs',import.meta.url),'utf8');
function fixture() {
  const f = backendFixture(); let now = Date.now(); let locked=false;
  f.context.Date = class extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } };
  Object.assign(f.props,{ ENVIRONMENT:'STAGING',SPREADSHEET_ID:stagingId,NATIVE_STAGING_SCRIPT_ID:scriptId,
    GATE_PIN:String(123000+456),MEAL_PIN:String(654000+321),STAGING_ATTENDANCE_WRITES_ENABLED:'false' });
  f.context.PropertiesService.getScriptProperties = () => ({
    getProperty:(k) => f.props[k] ?? null, setProperty:(k,v) => { f.props[k]=v; },
    getProperties:() => ({ ...f.props }),deleteProperty:(k) => { delete f.props[k]; },
  });
  f.context.Utilities.getUuid = randomUUID;
  f.context.LockService.getScriptLock = () => ({ tryLock:() => { if(locked)return false;locked=true;return true; },
    hasLock:() => locked,releaseLock:() => { locked=false; } });
  vm.runInContext(source,f.context);
  const login = (role='GATE',previous='') => f.context.nativeLogin(role,f.props[role+'_PIN'],previous);
  return { ...f,login,advance:(ms) => { now+=ms; },enable:() => { f.props.STAGING_ATTENDANCE_WRITES_ENABLED='true'; },
    hold:() => { locked=true; },isLocked:() => locked };
}
test('native logins persist only digest/role/absolute eight-hour expiry server-side', () => {
  const f=fixture(); const result=f.login(); assert.equal(result.code,'AUTHORIZED');
  const entries=Object.entries(f.props).filter(([k])=>k.startsWith('NATIVE_SESSION_'));
  assert.equal(entries.length,1); assert.ok(!entries[0][0].includes(result.token));
  assert.ok(!entries[0][1].includes(result.token)); const s=JSON.parse(entries[0][1]);
  assert.equal(s.role,'GATE'); assert.equal(s.expiresAt-s.createdAt,8*60*60*1000);
  assert.equal(f.stats().opened,0);
});
test('native session works until eight hours and expires at the exact boundary without sliding', () => {
  const f=fixture();const login=f.login(); f.enable();
  f.advance(8*60*60*1000-1); assert.equal(f.context.nativeRecord('STAGE1',login.token).code,'ENTRY_RECORDED');
  f.advance(1);assert.equal(f.context.nativeRecord('STAGE2',login.token).code,'NOT_APPROVED');
  assert.equal(f.stats().batches,1);
});
test('role replacement revokes the prior token; legacy wrong-role and missing-session calls fail', () => {
  const f=fixture();const gate=f.login(); const meal=f.login('MEAL',gate.token); f.enable();
  assert.equal(f.context.nativeRecord('STAGE1',gate.token).code,'NOT_APPROVED');
  assert.equal(f.context.recordBadgeAction('STAGE1','gate',meal.token).code,'NOT_APPROVED');
  assert.equal(f.context.recordBadgeAction('STAGE1','food').code,'NOT_APPROVED');
  assert.equal(f.context.recordBadgeAction('STAGE1','unknown',meal.token).code,'NOT_APPROVED');
  assert.equal(f.context.nativeRecord('STAGE1',meal.token).code,'MEAL_RECORDED');
  assert.equal(f.sheets.Attendees.rows[1][11],'');
});
test('shared role PINs must be distinct; invalid PINs throttle after five failures', () => {
  const f=fixture(); const wrong=String(999000+999);
  for(let i=0;i<5;i++)assert.equal(f.context.nativeLogin('GATE',wrong,'').code,'NOT_APPROVED');
  assert.equal(f.login().code,'THROTTLED');f.advance(60001);assert.equal(f.login().code,'AUTHORIZED');
  f.props.MEAL_PIN=f.props.GATE_PIN;assert.equal(f.login().code,'ERROR');
});
test('native unauthorized, expired and malformed sessions never open Sheets or create Activity', () => {
  const f=fixture();f.enable();
  for(const token of ['',undefined,'invalid',randomUUID()+randomUUID()]) {
    const result=f.context.nativeRecord('STAGE1',token);assert.equal(result.code,'NOT_APPROVED');
    assert.deepEqual(Object.keys(result).sort(),['code','message']);
  }
  assert.equal(f.stats().opened,0);assert.equal(f.sheets.Activity.rows.length,1);
});
test('native writes remain disabled by default; only exact true enables a valid session', () => {
  const f=fixture();const login=f.login();
  for(const value of ['false',undefined,'TRUE',true]) {
    f.props.STAGING_ATTENDANCE_WRITES_ENABLED=value;
    assert.equal(f.context.nativeRecord('STAGE1',login.token).code,'WRITES_DISABLED');
  }
  assert.equal(f.stats().opened,0);assert.equal(f.stats().batches,0);
});
test('native both roles atomically commit attendance and audit, duplicates never append', () => {
  for(const role of ['GATE','MEAL']) {
    const f=fixture();const login=f.login(role);f.enable();
    assert.equal(f.context.nativeRecord(' stage1 ',login.token).code,role==='GATE'?'ENTRY_RECORDED':'MEAL_RECORDED');
    assert.equal(f.submitted.length,1);assert.equal(f.submitted[0].length,2);
    assert.equal(f.context.nativeRecord('STAGE1',login.token).code,'ALREADY_RECORDED');
    assert.equal(f.stats().batches,1);assert.equal(f.sheets.Activity.rows.length,2);
    const audit=f.sheets.Activity.rows[1];assert.equal(audit.length,10);assert.equal(audit[8],role);
    assert.equal(audit[9],'Native Camera Session');assert.match(audit[7],/^[0-9a-f]{64}$/);
    assert.equal(f.sheets.Attendees.rows[1][role==='GATE'?12:11],'');
    assert.equal(f.sheets.ScannerRequests.rows.length,1);
  }
});
test('native invalid/inactive/ambiguous tokens fail without attendance or audit', () => {
  const f=fixture();const login=f.login();f.enable();
  for(const token of ['MISSING','STAGE3','', 'a\nb'])assert.equal(f.context.nativeRecord(token,login.token).code,'NOT_APPROVED');
  f.sheets.Attendees.rows[2][9]=' stage1 ';
  assert.equal(f.context.nativeRecord('STAGE1',login.token).code,'NOT_APPROVED');assert.equal(f.stats().batches,0);
});
test('native atomic failure before commit is retryable, lost response yields one audit on rescan', () => {
  for(const mode of ['before','after']) {
    const f=fixture();const login=f.login();f.enable();f.injectFailure(mode);
    assert.equal(f.context.nativeRecord('STAGE1',login.token).code,'ERROR');
    assert.equal(f.isLocked(),false);
    assert.equal(f.context.nativeRecord('STAGE1',login.token).code,mode==='before'?'ENTRY_RECORDED':'ALREADY_RECORDED');
    assert.equal(f.stats().batches,1);assert.equal(f.sheets.Activity.rows.length,2);
  }
});
test('native target/script pinning, title, schema and timezone fail closed', () => {
  for(const change of [(f)=>{f.props.SPREADSHEET_ID='SYNTHETIC_OTHER_ONLY_0001';},
    (f)=>{f.props.NATIVE_STAGING_SCRIPT_ID='other';},(f)=>{f.workbook.title='Other';},
    (f)=>{f.workbook.timeZone='UTC';},(f)=>{f.sheets.Activity.rows[0].pop();}]) {
    const f=fixture();const login=f.login();f.enable();change(f);
    assert.equal(f.context.nativeRecord('STAGE1',login.token).code,'ERROR');assert.equal(f.stats().batches,0);
  }
  const f=fixture();const login=f.login();f.enable();f.workbook.timeZone='Asia/Calcutta';
  assert.equal(f.context.nativeRecord('STAGE1',login.token).code,'ENTRY_RECORDED');
});
test('native lock contention returns technical error without opening Sheets', () => {
  const f=fixture();const login=f.login();f.enable();f.hold();
  assert.equal(f.context.nativeRecord('STAGE1',login.token).code,'ERROR');assert.equal(f.stats().opened,0);
});
test('native pages expose exactly two login routes and no camera or attendance controls', () => {
  const pages=['Login','Badge'].map(name=>readFileSync(new URL('../native-staging/src/'+name+'.html',import.meta.url),'utf8'));
  assert.doesNotMatch(pages.join('\n'),/sessionStorage|getUserMedia|qr-scanner|<video|document\.cookie/);
  assert.doesNotMatch(pages[1],/<button|<form/);
  assert.match(pages[1],/\.nativeRecord\(badgeToken,session\)/);
  assert.doesNotMatch(source,/SpreadsheetApp\.(create|getActive)|CacheService|UrlFetchApp|HMAC|createSyntheticStaging/);
  const f=fixture();const pagesRendered=[];
  f.context.HtmlService={createTemplateFromFile:(name)=>{
    const t={evaluate:()=>({addMetaTag:()=>t})};pagesRendered.push({name,template:t});return t;
  },createHtmlOutput:(html)=>html};
  f.context.doGet({parameter:{page:'gate'}});assert.equal(pagesRendered[0].template.role,'GATE');
  f.context.doGet({parameter:{page:'meal'}});assert.equal(pagesRendered[1].template.role,'MEAL');
  f.context.doGet({parameter:{t:'</script><script>hostile</script>'}});
  assert.ok(!pagesRendered[2].template.tokenJson.includes('<'));
  assert.match(f.context.doGet({parameter:{}}),/Not Approved/);
  assert.equal(f.stats().opened,0);assert.equal(f.stats().batches,0);
});

test('native badge page auto-submits only a recovered token and shows fixed results', () => {
  const html=readFileSync(new URL('../native-staging/src/Badge.html',import.meta.url),'utf8');
  const script=/<script>([\s\S]*?)<\/script>/.exec(html)[1].replace('<?!= tokenJson ?>',JSON.stringify('SYNTHETIC-TOKEN'));
  for(const scenario of ['missing','blocked','authorized','technical']) {
    const out={textContent:'',className:''};let calls=0;
    const runner={withSuccessHandler(fn){this.success=fn;return this;},withFailureHandler(fn){this.failure=fn;return this;},
      nativeRecord(token,session){calls++;assert.equal(token,'SYNTHETIC-TOKEN');assert.equal(session,'synthetic-session');
        if(scenario==='technical')this.failure();else this.success({code:'ENTRY_RECORDED'});
      }};
    const context={document:{getElementById:()=>out},setTimeout:()=>1,clearTimeout:()=>{},google:{script:{run:runner}},
      localStorage:{getItem:()=>{if(scenario==='blocked')throw Error('Denied');return scenario==='missing'?'':'synthetic-session';}}};
    vm.runInNewContext(script,context);
    assert.equal(calls,scenario==='missing'||scenario==='blocked'?0:1);
    assert.equal(out.textContent,scenario==='missing'||scenario==='blocked'?'Not Approved':scenario==='authorized'?'Entry Recorded':'Technical error. Attendance is not confirmed. Scan again after checking the connection.');
  }
});
test('same browser storage can be recovered by independent page contexts without storing role or PIN', () => {
  const html=readFileSync(new URL('../native-staging/src/Badge.html',import.meta.url),'utf8');
  const script=/<script>([\s\S]*?)<\/script>/.exec(html)[1].replace('<?!= tokenJson ?>',JSON.stringify('SYNTHETIC-TOKEN'));
  const store=new Map([['annualday-native-staging-session-v1','random-token-only']]);let calls=0;
  for(let i=0;i<2;i++) {
    const runner={withSuccessHandler(fn){this.success=fn;return this;},withFailureHandler(){return this;},nativeRecord(_token,s){assert.equal(s,'random-token-only');calls++;this.success({code:'ALREADY_RECORDED'});}};
    vm.runInNewContext(script,{document:{getElementById:()=>({})},setTimeout:()=>1,clearTimeout:()=>{},
      localStorage:{getItem:(key)=>store.get(key)},google:{script:{run:runner}}});
  }
  assert.equal(calls,2);assert.equal(store.size,1);
  // This models shared storage only, not actual iOS/Android Camera context behavior.
});
