export { ScannerAuthority } from './authority.js';

export default {
  async fetch(request, env) {
    if (env.ENVIRONMENT !== 'staging') return new Response('Staging only', { status: 503 });
    let allowed;
    try { allowed = new URL(env.SCANNER_ORIGIN); } catch { return new Response('Origin not configured', { status: 503 }); }
    if (allowed.protocol !== 'https:' || allowed.origin !== env.SCANNER_ORIGIN || allowed.username || allowed.password) {
      return new Response('Origin not configured', { status: 503 });
    }
    const origin = request.headers.get('Origin');
    if (origin && origin !== env.SCANNER_ORIGIN) return new Response('Forbidden', { status: 403 });
    const headers = {
      'Cache-Control': 'no-store', Vary: 'Origin',
      'X-Content-Type-Options': 'nosniff',
    };
    if (origin) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Methods'] = 'POST';
      headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
    }
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers });
    try {
      const id = env.SCANNER_AUTHORITY.idFromName('annual-day-2026-staging');
      const url = new URL(request.url);
      if (url.pathname.startsWith('/api/')) url.pathname = url.pathname.slice(4);
      const result = await env.SCANNER_AUTHORITY.get(id).fetch(new Request(url,request));
      const combined = new Headers(result.headers);
      for (const [key, value] of Object.entries(headers)) combined.set(key, value);
      return new Response(result.body, { status: result.status, headers: combined });
    } catch {
      return new Response(JSON.stringify({ code: 'SERVICE_UNAVAILABLE' }), {
        status: 503, headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }
  },
};

