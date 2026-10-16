import test from 'node:test';
import assert from 'node:assert/strict';
import { AttendanceClient } from '../src/attendance.js';

const base = 'https://script.google.com/macros/s/SYNTHETIC_BADGES/exec';
const credential = 'a'.repeat(64);
const session = { environment:'staging',role:'GATE',deviceId:'c'.repeat(64),badgeBase:base,expiresAt:Date.now()+3600000 };
const json = (body,status = 200) => new Response(JSON.stringify(body),{ status,headers:{ 'Content-Type':'application/json' } });
function fixture(attend = (body) => json({ code:'ENTRY_OK',requestId:body.requestId,role:'GATE',
  entryTime:'2026-10-21T12:30:00.000Z',attendeeName:'Synthetic Attendee' })) {
  const memory = new Map();
  const storage = { getItem:(key) => memory.get(key) ?? null,setItem:(key,value) => memory.set(key,value),removeItem:(key) => memory.delete(key) };
  const reports = [], calls = [];
  const network = async (path,options) => {
    const body = JSON.parse(options.body); calls.push({ path,body,headers:options.headers });
    if (path === '/api/enroll') return json({ credential });
    if (path === '/api/session') return json(session);
    return attend(body);
  };
  const client = new AttendanceClient({ storage,network,report:(code) => reports.push(code),timeoutMs:20 });
  return { client,network,storage,memory,calls,reports };
}
test('provision once and automatically submit valid badge with normalized token', async () => {
  const f = fixture(); await f.client.provision('synthetic-code');
  await f.client.scan(base+'?t=stage1');
  const call = f.calls.at(-1);
  assert.equal(call.body.token,'STAGE1'); assert.equal(call.body.action,'GATE');
  assert.equal(call.headers.Authorization,`Bearer ${credential}`);
  assert.equal(f.reports.at(-1),'ENTRY_OK'); assert.equal(f.client.pending,null);
  assert.equal([...f.memory.values()].some((value) => value.includes('STAGE1')),false);
});
test('default browser transport calls fetch with the global receiver', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = function () {
      assert.equal(this,globalThis);
      return Promise.resolve(json(session));
    };
    const client = new AttendanceClient({ storage:{ getItem:(name) => name.includes('pending') ? null : credential } });
    assert.equal((await client.restore()).role,'GATE');
  } finally { globalThis.fetch = original; }
});
test('missing token, malformed QR and wrong badge deployment never send attendance', async () => {
  const f = fixture(); await f.client.provision('synthetic-code');
  for (const raw of ['bad',base,base+'?t=',base+'?t=a&t=b',base.replace('SYNTHETIC','OTHER')+'?t=a']) await f.client.scan(raw);
  assert.equal(f.calls.filter((call) => call.path === '/api/attendance').length,0);
  assert.equal(f.reports.at(-1),'INVALID_BADGE');
});
test('unauthorized scanner cannot initiate a scan', async () => {
  const f = fixture(); await f.client.scan(base+'?t=STAGE1');
  assert.equal(f.calls.length,0); assert.equal(f.reports.at(-1),'SCANNER_NOT_AUTHORIZED');
});
test('no success is displayed until server acknowledgement', async () => {
  let release;
  const f = fixture((body) => new Promise((resolve) => { release = () => resolve(json({ code:'ENTRY_OK',role:'GATE',
    requestId:body.requestId,entryTime:'2026-10-21T12:30:00Z' })); }));
  await f.client.provision('synthetic-code');
  const scan = f.client.scan(base+'?t=STAGE1');
  assert.deepEqual(f.reports,['PROCESSING']);
  await f.client.scan(base+'?t=STAGE2');
  assert.equal(f.calls.filter((call) => call.path === '/api/attendance').length,1);
  release(); await scan; assert.equal(f.reports.at(-1),'ENTRY_OK');
});
test('network timeout keeps same request ID for explicit retry', async () => {
  let offline = true;
  const f = fixture((body) => offline ? new Promise(() => {}) : json({ code:'ALREADY_ENTERED',role:'GATE',
    requestId:body.requestId,entryTime:'2026-10-21T12:30:00Z' }));
  await f.client.provision('synthetic-code'); await f.client.scan(base+'?t=STAGE1');
  const first = f.calls.at(-1).body;
  assert.equal(f.reports.at(-1),'NETWORK_ERROR'); assert.ok(f.client.pending);
  await f.client.scan(base+'?t=STAGE2');
  offline = false; await f.client.retry();
  assert.deepEqual(f.calls.at(-1).body,first); assert.equal(f.reports.at(-1),'ALREADY_ENTERED');
});
test('refresh restores session and uncertain request from tab storage', async () => {
  let first = true;
  const f = fixture((body) => {
    if (first) throw new Error('offline');
    return json({ code:'ENTRY_OK',role:'GATE',requestId:body.requestId,entryTime:'2026-10-21T12:30:00Z' });
  });
  await f.client.provision('synthetic-code'); await f.client.scan(base+'?t=STAGE1');
  const id = f.client.pending.requestId;
  const recovered = new AttendanceClient({ storage:f.storage,network:f.network });
  await recovered.restore(); assert.equal(recovered.pending.requestId,id);
  first = false; await recovered.retry(); assert.equal(recovered.pending,null);
});
test('multiple different attendees continue after confirmed results', async () => {
  const f = fixture(); await f.client.provision('synthetic-code');
  for (let i=1; i<=5; i++) await f.client.scan(base+'?t=STAGE'+i);
  const writes = f.calls.filter((call) => call.path === '/api/attendance');
  assert.equal(writes.length,5); assert.equal(new Set(writes.map((call) => call.body.requestId)).size,5);
});
test('backend failures, mismatched IDs, wrong roles and missing timestamps cannot confirm success', async () => {
  for (const reply of [{ code:'BACKEND_ERROR' },{ code:'ENTRY_OK',requestId:'wrong' },
    { code:'MEAL_OK',role:'MEAL',mealTime:'2026-10-21T12:30:00Z' },{ code:'ENTRY_OK',role:'GATE' }]) {
    const f = fixture((body) => json({ requestId:body.requestId,...reply }));
    await f.client.provision('synthetic-code'); await f.client.scan(base+'?t=STAGE1');
    assert.equal(f.reports.at(-1),'NETWORK_ERROR'); assert.ok(f.client.pending);
  }
});
test('invalid/inactive badges produce confirmed errors and permit the next scan', async () => {
  for (const code of ['INVALID_BADGE','BADGE_INACTIVE']) {
    const f = fixture((body) => json({ code,requestId:body.requestId }));
    await f.client.provision('synthetic-code'); await f.client.scan(base+'?t=STAGE1');
    assert.equal(f.reports.at(-1),code); assert.equal(f.client.pending,null);
  }
});
test('revoked device response removes stored credential and prevents further scans', async () => {
  const f = fixture(() => json({ code:'SCANNER_NOT_AUTHORIZED' },401));
  await f.client.provision('synthetic-code'); await f.client.scan(base+'?t=STAGE1');
  assert.equal(f.reports.at(-1),'SCANNER_NOT_AUTHORIZED'); assert.equal(f.client.session,null);
  const count = f.calls.length; await f.client.scan(base+'?t=STAGE2'); assert.equal(f.calls.length,count);
});
