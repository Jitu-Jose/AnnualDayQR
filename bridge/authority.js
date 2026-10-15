const encoder = new TextEncoder();
const digest = async (value) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))]
  .map((byte) => byte.toString(16).padStart(2, '0')).join('');
const random = () => [...crypto.getRandomValues(new Uint8Array(32))]
  .map((byte) => byte.toString(16).padStart(2, '0')).join('');
const response = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
const bearer = (request) => {
  const match = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.get('Authorization') || '');
  return match?.[1];
};
const same = (left, right) => {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
};

// One Durable Object is the authority for the isolated staging event.
export class ScannerAuthority {
  constructor(state, env) { this.storage = state.storage; this.env = env; }

  async fetch(request) {
    try { return await this.handle(request); }
    catch { return response(503, { code: 'SERVICE_UNAVAILABLE' }); }
  }

  async handle(request) {
    if (this.env.ENVIRONMENT !== 'staging') return response(503, { code: 'STAGING_ONLY' });
    if (request.method !== 'POST') return response(405, { code: 'METHOD_NOT_ALLOWED' });
    if (!(request.headers.get('Content-Type') || '').startsWith('application/json')) {
      return response(415, { code: 'JSON_REQUIRED' });
    }
    // Stream limit, including requests without a Content-Length header.
    const reader = request.body?.getReader();
    if (!reader) return response(400, { code: 'INVALID_REQUEST' });
    const chunks = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 2048) { await reader.cancel(); return response(413, { code: 'BODY_TOO_LARGE' }); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    let body;
    try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { return response(400, { code: 'INVALID_REQUEST' }); }
    if (!body || Array.isArray(body) || typeof body !== 'object') return response(400, { code: 'INVALID_REQUEST' });

    const path = new URL(request.url).pathname;
    const now = Date.now();
    // Coarse durable limits protect provisioning from unlimited guesses. Apply
    // additional IP/edge limits before any public staging deployment.
    if (path === '/enroll' || path.startsWith('/admin/')) {
      const allowed = await this.storage.transaction(async (tx) => {
        const key = 'limit:' + (path === '/enroll' ? 'enroll' : 'admin');
        const prior = await tx.get(key);
        const window = prior && prior.until > now ? prior : { count: 0, until: now + 60_000 };
        if (window.count >= 60) return false;
        await tx.put(key, { ...window, count: window.count + 1 });
        return true;
      });
      if (!allowed) return response(429, { code: 'RATE_LIMITED' });
    }
    const token = bearer(request);
    if (path === '/admin/provision' || path === '/admin/revoke') {
      const configured = this.env.ADMIN_BEARER;
      if (!token || !/^[a-f0-9]{64}$/.test(configured || '') ||
          !same(await digest(token), await digest(configured))) {
        return response(401, { code: 'SCANNER_NOT_AUTHORIZED' });
      }
      if (path === '/admin/revoke') {
        if (typeof body.deviceId !== 'string' || !/^[a-f0-9]{64}$/.test(body.deviceId)) {
          return response(400, { code: 'INVALID_REQUEST' });
        }
        const found = await this.storage.transaction(async (tx) => {
          const device = await tx.get('device:' + body.deviceId);
          if (!device) return false;
          await tx.put('device:' + body.deviceId, { ...device, revoked: true });
          return true;
        });
        return response(found ? 200 : 404, { code: found ? 'REVOKED' : 'NOT_FOUND' });
      }
      if (!['GATE', 'MEAL'].includes(body.role)) return response(400, { code: 'INVALID_ROLE' });
      const code = random();
      const key = 'provision:' + await digest(code);
      await this.storage.put(key, { role: body.role, expiresAt: now + 5 * 60_000 });
      return response(201, { code, expiresAt: now + 5 * 60_000 });
    }
    if (path === '/enroll') {
      if (Object.keys(body).length !== 1 || typeof body.code !== 'string' ||
          !/^[a-f0-9]{64}$/.test(body.code)) return response(400, { code: 'INVALID_REQUEST' });
      const key = 'provision:' + await digest(body.code);
      const secret = random();
      const deviceId = random();
      const secretDigest = await digest(secret);
      const device = await this.storage.transaction(async (tx) => {
        const provision = await tx.get(key);
        if (!provision || provision.expiresAt <= now) return null;
        await tx.delete(key);
        const value = { deviceId, role: provision.role, expiresAt: now + 12 * 60 * 60_000,
          revoked: false, secretDigest, environment: 'staging' };
        await tx.put('device:' + deviceId, value);
        await tx.put('secret:' + secretDigest, deviceId);
        return value;
      });
      if (!device) return response(401, { code: 'SCANNER_NOT_AUTHORIZED' });
      return response(201, { credential: secret, deviceId, role: device.role, expiresAt: device.expiresAt });
    }
    if (path !== '/session' && path !== '/attendance') return response(404, { code: 'NOT_FOUND' });
    if (!token) return response(401, { code: 'SCANNER_NOT_AUTHORIZED' });
    const tokenDigest = await digest(token);
    // The authorization read and revocation use the same authoritative store.
    const deviceId = await this.storage.get('secret:' + tokenDigest);
    const device = deviceId && await this.storage.get('device:' + deviceId);
    if (!device || device.revoked || device.expiresAt <= now || device.environment !== 'staging') {
      return response(401, { code: 'SCANNER_NOT_AUTHORIZED' });
    }
    if (path === '/session') return response(200, {
      deviceId: device.deviceId, role: device.role, expiresAt: device.expiresAt, environment: 'staging',
      badgeBase: this.env.BADGE_BASE || '',
    });
    if (body.action !== device.role) return response(403, { code: 'ROLE_FORBIDDEN' });
    if (this.env.STAGING_ATTENDANCE_ENABLED !== 'true') return response(503, { code: 'BACKEND_NOT_CONFIGURED' });
    if (Object.keys(body).sort().join(',') !== 'action,requestId,token' ||
        !/^[a-f0-9-]{36}$/.test(body.requestId || '') || typeof body.token !== 'string' ||
        !body.token.trim() || body.token.length > 512 || [...body.token.trim()].some((char) =>
          char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127)) {
      return response(400, { code: 'INVALID_REQUEST' });
    }
    const outcome = await submitStagingAttendance(this.env,device,body);
    const retry = ['BACKEND_NOT_CONFIGURED','BACKEND_ERROR','WRITES_DISABLED','BUSY_RETRY'].includes(outcome.code);
    return response(retry ? 503 : outcome.code === 'REQUEST_CONFLICT' ? 409 :
      outcome.code === 'SCANNER_NOT_AUTHORIZED' ? 401 : 200,outcome);
  }
}
import { submitStagingAttendance } from './backend.js';

