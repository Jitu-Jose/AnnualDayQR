// Shape validation only. The real deployment URL must be confirmed from source
// and allowlisted exactly before any future attendance integration.
export function parseBadgeQr(value, expectedBase) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' || url.hostname !== 'script.google.com' ||
      url.port || url.username || url.password || url.hash ||
      !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname)) return null;
  const entries = [...url.searchParams];
  if (entries.length !== 1 || entries[0][0] !== 't') return null;
  const token = entries[0][1];
  if (!token || token.length > 512 || /\s/.test(token) ||
      [...token].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return null;
  const base = url.origin + url.pathname;
  if (expectedBase && base !== expectedBase) return null;
  return { token, base };
}

export class ScanGate {
  constructor(cooldownMs = 2500) {
    this.cooldownMs = cooldownMs;
    this.recent = new Map();
  }
  accept(value, now = performance.now()) {
    for (const [key, time] of this.recent) {
      if (now - time >= this.cooldownMs) this.recent.delete(key);
    }
    if (this.recent.has(value)) return false;
    this.recent.set(value, now);
    return true;
  }
  clear() { this.recent.clear(); }
}
