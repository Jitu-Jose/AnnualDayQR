import test from 'node:test';
import assert from 'node:assert/strict';
import { submitStagingAttendance } from '../bridge/backend.js';
import { backendFixture, signingKey, audience, deviceId, requestId } from './helpers/backend-fixture.js';

const env = { ENVIRONMENT:'staging',STAGING_ATTENDANCE_ENABLED:'true',BRIDGE_SIGNING_KEY:signingKey,
  BACKEND_AUDIENCE:audience,STAGING_BACKEND_URL:'https://script.google.com/macros/s/SYNTHETIC_STAGING/exec' };
const body = { action:'GATE',token:'STAGE1',requestId };
const device = { deviceId,role:'GATE' };
const json = (value) => new Response(JSON.stringify(value),{ headers:{ 'Content-Type':'application/json' } });

test('signed bridge request is accepted by the real staging adapter code with Sheets mocked', async () => {
  const f = backendFixture();
  const result = await submitStagingAttendance(env,device,body,async (_url,options) => {
    assert.equal(options.redirect,'manual');
    return json(f.postEnvelope(JSON.parse(options.body)));
  });
  assert.equal(result.code,'ENTRY_OK'); assert.equal(f.stats().batches,1);
});
test('ContentService redirect follows only expected host/path with GET and no credentials', async () => {
  const f = backendFixture(); let calls = 0; let value;
  const result = await submitStagingAttendance(env,device,body,async (url,options) => {
    calls++;
    if (calls === 1) {
      value = f.postEnvelope(JSON.parse(options.body));
      return new Response(null,{ status:302,headers:{ Location:'https://script.googleusercontent.com/macros/echo?synthetic=1' } });
    }
    assert.equal(new URL(url).hostname,'script.googleusercontent.com');
    assert.equal(options.method,'GET'); assert.equal(options.body,undefined); assert.equal(options.headers,undefined);
    return json(value);
  });
  assert.equal(result.code,'ENTRY_OK'); assert.equal(calls,2);
});
test('hostile and login redirects are never followed', async () => {
  for (const location of ['https://evil.example.invalid/macros/echo','https://accounts.google.com/login',
    'https://script.googleusercontent.com/other']) {
    let calls = 0;
    await assert.rejects(submitStagingAttendance(env,device,body,async () => {
      calls++; return new Response(null,{ status:302,headers:{ Location:location } });
    }));
    assert.equal(calls,1);
  }
});
test('production/disabled bridge configuration makes no network request', async () => {
  for (const config of [{ ...env,ENVIRONMENT:'production' },{ ...env,STAGING_ATTENDANCE_ENABLED:'false' }]) {
    const result = await submitStagingAttendance(config,device,body,() => { throw new Error('Network forbidden'); });
    assert.equal(result.code,'BACKEND_NOT_CONFIGURED');
  }
});
test('arbitrary backend URLs are rejected before sending a signed envelope', async () => {
  await assert.rejects(submitStagingAttendance({ ...env,STAGING_BACKEND_URL:'https://evil.example.invalid/exec' },device,body,
    () => { throw new Error('Network forbidden'); }));
});
test('HTML, malformed JSON and fabricated success cannot confirm attendance', async () => {
  for (const result of [new Response('<html>Login</html>'),json({ code:'ENTRY_OK' }),json({ code:'UNKNOWN' }),
    new Response('{',{ headers:{ 'Content-Type':'application/json' } })]) {
    await assert.rejects(submitStagingAttendance(env,device,body,async () => result));
  }
});
test('network failure is propagated as uncertain, and identical retry recovers one commit', async () => {
  const f = backendFixture();
  await assert.rejects(submitStagingAttendance(env,device,body,async (_url,options) => {
    f.postEnvelope(JSON.parse(options.body)); throw new Error('Connection lost');
  }));
  const recovered = await submitStagingAttendance(env,device,body,async (_url,options) => json(f.postEnvelope(JSON.parse(options.body))));
  assert.equal(recovered.code,'ENTRY_OK'); assert.equal(f.stats().batches,1);
});
test('concurrent two-device submissions share the mocked staging system of record', async () => {
  const f = backendFixture();
  const network = async (_url,options) => json(f.postEnvelope(JSON.parse(options.body)));
  const results = await Promise.all([submitStagingAttendance(env,device,body,network),
    submitStagingAttendance(env,{ deviceId:'d'.repeat(64),role:'GATE' },body,network)]);
  assert.deepEqual(results.map((value) => value.code).sort(),['ALREADY_ENTERED','ENTRY_OK']);
  assert.equal(f.sheets.Activity.rows.length,2);
});
