import { parseBadgeQr } from './qr.js';

export const messages = {
  ENTRY_OK: ['ENTRY OK','success'], MEAL_OK: ['MEAL OK','success'],
  ALREADY_ENTERED: ['ALREADY ENTERED','duplicate'], MEAL_ALREADY_SERVED: ['MEAL ALREADY SERVED','duplicate'],
  INVALID_BADGE: ['INVALID BADGE','error'], BADGE_INACTIVE: ['BADGE INACTIVE','error'],
  SCANNER_NOT_AUTHORIZED: ['SCANNER NOT AUTHORIZED','error'], ROLE_FORBIDDEN: ['SCANNER NOT AUTHORIZED','error'],
};
const key = 'annual-day-staging-device-v1';
const pendingKey = 'annual-day-staging-pending-v1';

// Same-origin /api route is required. No spreadsheet ID or signing key in JS.
export class AttendanceClient {
  constructor({ storage, network = fetch, report = () => {}, timeoutMs = 20000 }) {
    this.storage = storage; this.network = network; this.report = report; this.timeoutMs = timeoutMs;
    this.session = null; this.pending = null; this.busy = false;
  }
  async request(path, body, credential = this.storage.getItem(key)) {
    const abort = new AbortController();
    let timer;
    try {
      // Race even when a browser/network implementation ignores abort.
      return await Promise.race([(async () => {
        const response = await this.network('/api/' + path,{ method:'POST',signal:abort.signal,
          headers:{ 'Content-Type':'application/json', ...(credential ? { Authorization:`Bearer ${credential}` } : {}) },
          body:JSON.stringify(body),cache:'no-store',credentials:'omit',redirect:'error' });
        const value = await response.json();
        if (response.status === 401 || response.status === 403) {
          this.session = null;
          this.storage.removeItem(key);
          throw new Error('SCANNER_NOT_AUTHORIZED');
        }
        if (!response.ok || !value || typeof value.code === 'undefined' && path === 'attendance') throw new Error('NETWORK_ERROR');
        return value;
      })(),new Promise((_, reject) => {
        timer = setTimeout(() => { abort.abort(); reject(new Error('NETWORK_ERROR')); },this.timeoutMs);
      })]);
    } finally { clearTimeout(timer); }
  }
  async provision(code) {
    const value = await this.request('enroll',{ code },null);
    if (!/^[a-f0-9]{64}$/.test(value.credential || '')) throw new Error('SCANNER_NOT_AUTHORIZED');
    this.storage.setItem(key,value.credential);
    return this.restore();
  }
  async restore() {
    const value = await this.request('session',{});
    if (value.environment !== 'staging' || !['GATE','MEAL'].includes(value.role) ||
        !Number.isFinite(value.expiresAt) || value.expiresAt <= Date.now() ||
        !parseBadgeQr(value.badgeBase + '?t=synthetic',value.badgeBase)) throw new Error('SCANNER_NOT_AUTHORIZED');
    this.session = value;
    this.pending = null;
    const saved = this.storage.getItem(pendingKey);
    if (saved) {
      try {
        const p = JSON.parse(saved);
        if (p.deviceId === value.deviceId && p.action === value.role && typeof p.token === 'string' &&
            p.token.length <= 512 && /^[a-f0-9-]{36}$/.test(p.requestId)) this.pending = p;
        else this.storage.removeItem(pendingKey);
      } catch { this.storage.removeItem(pendingKey); }
    }
    return value;
  }
  async scan(raw) {
    if (!this.session) { this.report('SCANNER_NOT_AUTHORIZED'); return; }
    if (this.busy || this.pending) return;
    const badge = parseBadgeQr(raw,this.session.badgeBase);
    if (!badge) { this.report('INVALID_BADGE'); return; }
    this.pending = { deviceId:this.session.deviceId,action:this.session.role,
      requestId:crypto.randomUUID(),token:badge.token.trim().toUpperCase() };
    // Only the unresolved token is retained in this tab; cleared on confirmation.
    this.storage.setItem(pendingKey,JSON.stringify(this.pending));
    await this.retry();
  }
  async retry() {
    if (this.busy || !this.pending || !this.session) return;
    this.busy = true;
    this.report('PROCESSING');
    const pending = this.pending;
    try {
      const { deviceId: _deviceId, ...body } = pending;
      void _deviceId;
      const value = await this.request('attendance',body);
      if (!this.session || this.session.deviceId !== pending.deviceId) throw new Error('SCANNER_NOT_AUTHORIZED');
      if (!messages[value.code] || value.requestId !== pending.requestId ||
          ['ENTRY_OK','ALREADY_ENTERED','MEAL_OK','MEAL_ALREADY_SERVED'].includes(value.code) &&
          (value.role !== this.session.role || !Number.isFinite(Date.parse(
            this.session.role === 'GATE' ? value.entryTime : value.mealTime)))) throw new Error('NETWORK_ERROR');
      const permitted = this.session.role === 'GATE' ? ['ENTRY_OK','ALREADY_ENTERED'] : ['MEAL_OK','MEAL_ALREADY_SERVED'];
      if (['ENTRY_OK','ALREADY_ENTERED','MEAL_OK','MEAL_ALREADY_SERVED'].includes(value.code) && !permitted.includes(value.code)) {
        throw new Error('NETWORK_ERROR');
      }
      this.pending = null;
      this.storage.removeItem(pendingKey);
      this.report(value.code,value);
    } catch (error) {
      this.report(error.message === 'SCANNER_NOT_AUTHORIZED' ? 'SCANNER_NOT_AUTHORIZED' : 'NETWORK_ERROR');
    } finally { this.busy = false; }
  }
}
