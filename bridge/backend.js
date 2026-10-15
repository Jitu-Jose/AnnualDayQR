const encoder = new TextEncoder();
const successCodes = new Set(['ENTRY_OK','MEAL_OK','ALREADY_ENTERED','MEAL_ALREADY_SERVED']);
const failureCodes = new Set(['INVALID_BADGE','BADGE_INACTIVE','REQUEST_CONFLICT','BUSY_RETRY',
  'WRITES_DISABLED','SCANNER_NOT_AUTHORIZED','BACKEND_ERROR']);

async function readJson(response) {
  if (!response.ok || !(response.headers.get('Content-Type') || '').includes('application/json')) {
    throw new Error('BACKEND_ERROR');
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 8192) { await reader.cancel(); throw new Error('BACKEND_ERROR'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

// Network is injectable only to support offline tests. Worker uses native fetch.
export async function submitStagingAttendance(env, device, body, network = fetch) {
  if (env.ENVIRONMENT !== 'staging' || env.STAGING_ATTENDANCE_ENABLED !== 'true' ||
      !/^[a-f0-9]{64}$/.test(env.BRIDGE_SIGNING_KEY || '') ||
      !/^[A-Za-z0-9_-]{16,100}$/.test(env.BACKEND_AUDIENCE || '')) {
    return { code: 'BACKEND_NOT_CONFIGURED' };
  }
  const target = new URL(env.STAGING_BACKEND_URL);
  if (target.origin !== 'https://script.google.com' || target.username || target.password ||
      target.search || target.hash || !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(target.pathname)) {
    throw new Error('BACKEND_ERROR');
  }
  const payload = JSON.stringify({ version: 1, environment: 'staging', audience: env.BACKEND_AUDIENCE,
    issuedAt: Date.now(), requestId: body.requestId, deviceId: device.deviceId,
    action: device.role, token: body.token.trim().toUpperCase() });
  const key = await crypto.subtle.importKey('raw',encoder.encode(env.BRIDGE_SIGNING_KEY),
    { name: 'HMAC', hash: 'SHA-256' },false,['sign']);
  const signature = [...new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(payload)))]
    .map((byte) => byte.toString(16).padStart(2,'0')).join('');
  const signal = AbortSignal.timeout(15000);
  let result = await network(target.href,{ method:'POST',redirect:'manual',signal,
    headers:{ 'Content-Type':'application/json' },body:JSON.stringify({ payload,signature }) });
  if ([302,303].includes(result.status)) {
    const location = new URL(result.headers.get('Location'),target);
    if (location.origin !== 'https://script.googleusercontent.com' || location.username ||
        location.password || location.pathname !== '/macros/echo' || location.hash) throw new Error('BACKEND_ERROR');
    // ContentService response redirect: GET only, no body, secrets or auth headers.
    result = await network(location.href,{ method:'GET',redirect:'manual',signal });
  }
  const value = await readJson(result);
  if (!value || (!successCodes.has(value.code) && !failureCodes.has(value.code))) throw new Error('BACKEND_ERROR');
  if (successCodes.has(value.code)) {
    const expected = device.role === 'GATE' ? ['ENTRY_OK','ALREADY_ENTERED'] : ['MEAL_OK','MEAL_ALREADY_SERVED'];
    const timestamp = device.role === 'GATE' ? value.entryTime : value.mealTime;
    if (!expected.includes(value.code) || value.requestId !== body.requestId || value.role !== device.role ||
        typeof timestamp !== 'string' || !Number.isFinite(Date.parse(timestamp)) ||
        typeof value.attendeeName !== 'string' || value.attendeeName.length > 500) throw new Error('BACKEND_ERROR');
  }
  return value;
}
