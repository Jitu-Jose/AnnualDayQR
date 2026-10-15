import test from 'node:test';
import assert from 'node:assert/strict';
import { ScannerAuthority } from '../bridge/authority.js';
import worker from '../bridge/worker.js';

// Synthetic-only in-memory Durable Object storage double. Transactions are
// serialized to model atomic one-time redemption, not real Cloudflare latency.
class Storage {
  constructor() { this.values = new Map(); this.tail = Promise.resolve(); }
  async get(key) { return structuredClone(this.values.get(key)); }
  async put(key, value) { this.values.set(key, structuredClone(value)); }
  async delete(key) { return this.values.delete(key); }
  transaction(callback) {
    const next = this.tail.then(() => callback(this));
    this.tail = next.catch(() => {});
    return next;
  }
}
const admin = 'a'.repeat(64);
function fixture() {
  const storage = new Storage();
  const authority = new ScannerAuthority({ storage }, { ENVIRONMENT: 'staging', ADMIN_BEARER: admin });
  return { storage, authority };
}
async function call(authority, path, body = {}, credential) {
  const headers = { 'Content-Type': 'application/json' };
  if (credential) headers.Authorization = `Bearer ${credential}`;
  const response = await authority.fetch(new Request('https://bridge.example.invalid' + path,
    { method: 'POST', headers, body: JSON.stringify(body) }));
  return { status: response.status, body: await response.json() };
}
async function enroll(authority, role) {
  const provision = await call(authority, '/admin/provision', { role }, admin);
  assert.equal(provision.status, 201);
  const result = await call(authority, '/enroll', { code: provision.body.code });
  assert.equal(result.status, 201);
  return result.body;
}

test('administrator provisions device once; session role survives a new request', async () => {
  const { authority, storage } = fixture();
  const device = await enroll(authority, 'GATE');
  const session = await call(authority, '/session', {}, device.credential);
  assert.equal(session.status, 200);
  assert.equal(session.body.role, 'GATE');
  assert.equal(session.body.deviceId, device.deviceId);
  assert.equal(JSON.stringify([...storage.values]).includes(device.credential), false);
});
test('provisioning and revocation require administrator authentication', async () => {
  const { authority } = fixture();
  for (const path of ['/admin/provision', '/admin/revoke']) {
    assert.equal((await call(authority, path, { role: 'GATE' })).status, 401);
    assert.equal((await call(authority, path, { role: 'GATE' }, 'b'.repeat(64))).status, 401);
  }
});
test('provisioning cannot grant an invented role', async () => {
  const { authority } = fixture();
  assert.equal((await call(authority, '/admin/provision', { role: 'ADMIN' }, admin)).status, 400);
});
test('two simultaneous redemptions yield exactly one device', async () => {
  const { authority } = fixture();
  const { body } = await call(authority, '/admin/provision', { role: 'MEAL' }, admin);
  const results = await Promise.all([call(authority, '/enroll', { code: body.code }),
    call(authority, '/enroll', { code: body.code })]);
  assert.deepEqual(results.map((result) => result.status).sort(), [201, 401]);
});
test('expired provisioning codes are rejected', async () => {
  const { authority, storage } = fixture();
  const { body } = await call(authority, '/admin/provision', { role: 'MEAL' }, admin);
  for (const [key, value] of storage.values) {
    if (key.startsWith('provision:')) await storage.put(key, { ...value, expiresAt: 0 });
  }
  assert.equal((await call(authority, '/enroll', { code: body.code })).status, 401);
});
test('provisioning abuse is bounded by a durable window', async () => {
  const { authority } = fixture();
  for (let i = 0; i < 60; i++) {
    assert.equal((await call(authority, '/enroll', { code: 'b'.repeat(64) })).status, 401);
  }
  assert.equal((await call(authority, '/enroll', { code: 'b'.repeat(64) })).status, 429);
});
test('enrollment rejects role injection and unknown codes', async () => {
  const { authority } = fixture();
  assert.equal((await call(authority, '/enroll', { code: 'b'.repeat(64), role: 'GATE' })).status, 400);
  assert.equal((await call(authority, '/enroll', { code: 'b'.repeat(64) })).status, 401);
});
test('each role is restricted server-side; allowed actions fail closed without backend', async () => {
  const { authority } = fixture();
  for (const role of ['GATE', 'MEAL']) {
    const device = await enroll(authority, role);
    const opposite = role === 'GATE' ? 'MEAL' : 'GATE';
    assert.equal((await call(authority, '/attendance', { action: opposite }, device.credential)).status, 403);
    const allowed = await call(authority, '/attendance', { action: role }, device.credential);
    assert.equal(allowed.status, 503);
    assert.equal(allowed.body.code, 'BACKEND_NOT_CONFIGURED');
  }
});
test('attendee-like strings and missing credentials cannot authorize attendance', async () => {
  const { authority } = fixture();
  for (const credential of [undefined, 'synthetic-badge', 'c'.repeat(64)]) {
    assert.equal((await call(authority, '/attendance', { action: 'GATE' }, credential)).status, 401);
  }
});
test('revocation is checked on subsequent requests', async () => {
  const { authority } = fixture();
  const device = await enroll(authority, 'GATE');
  assert.equal((await call(authority, '/admin/revoke', { deviceId: device.deviceId }, admin)).status, 200);
  for (const path of ['/session', '/attendance']) {
    assert.equal((await call(authority, path, { action: 'GATE' }, device.credential)).status, 401);
  }
});
test('expired sessions cannot recover or write', async () => {
  const { authority, storage } = fixture();
  const device = await enroll(authority, 'MEAL');
  const key = 'device:' + device.deviceId;
  await storage.put(key, { ...await storage.get(key), expiresAt: 0 });
  assert.equal((await call(authority, '/session', {}, device.credential)).status, 401);
});
test('production environment is refused before any storage access', async () => {
  const authority = new ScannerAuthority({ storage: null }, { ENVIRONMENT: 'production' });
  assert.equal((await call(authority, '/session')).body.code, 'STAGING_ONLY');
});
test('malformed, large and incorrect-method requests fail safely', async () => {
  const { authority } = fixture();
  assert.equal((await authority.fetch(new Request('https://example.invalid/session'))).status, 405);
  for (const body of ['{', JSON.stringify(null), JSON.stringify([])]) {
    const result = await authority.fetch(new Request('https://example.invalid/session', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
    }));
    assert.equal(result.status, 400);
  }
  const result = await call(authority, '/session', { value: 'x'.repeat(2100) });
  assert.equal(result.status, 413);
});
test('storage failures produce generic retryable errors without exposing details', async () => {
  const authority = new ScannerAuthority({ storage: { get() { throw new Error('internal detail'); } } },
    { ENVIRONMENT: 'staging' });
  assert.deepEqual(await call(authority, '/session', {}, 'b'.repeat(64)),
    { status: 503, body: { code: 'SERVICE_UNAVAILABLE' } });
});
test('worker rejects wrong origins and gives exact readable preflight headers', async () => {
  const env = { ENVIRONMENT: 'staging', SCANNER_ORIGIN: 'https://scanner.example.invalid' };
  assert.equal((await worker.fetch(new Request('https://bridge.example.invalid/session', {
    headers: { Origin: 'https://hostile.example.invalid' },
  }), env)).status, 403);
  const preflight = await worker.fetch(new Request('https://bridge.example.invalid/session', {
    method: 'OPTIONS', headers: { Origin: env.SCANNER_ORIGIN },
  }), env);
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), env.SCANNER_ORIGIN);
  assert.equal(preflight.headers.get('Access-Control-Allow-Methods'), 'POST');
});
