// Manual, bounded staging-only load runner. Never invoked by CI or unit tests.
// No Google credentials or direct Google Sheets API access.
import { readFile } from 'node:fs/promises';
import { assertStagingLoadTarget } from './staging-safety.js';

const config = JSON.parse(await readFile(process.argv[2],'utf8'));
const target = assertStagingLoadTarget(config); // Before any network client/call.
const credential = process.env.SCANNER_STAGING_DEVICE_CREDENTIAL;
if (!/^[a-f0-9]{64}$/.test(credential || '')) throw new Error('Staging device credential required');
const { count = 50,concurrency = 2,intervalMs = 1000,fixtureCount = 49 } = config;
if (!Number.isInteger(count) || count < 1 || count > 6000 || !Number.isInteger(concurrency) ||
    concurrency < 1 || concurrency > 16 || !Number.isInteger(intervalMs) || intervalMs < 100 ||
    !Number.isInteger(fixtureCount) || fixtureCount < 1 || fixtureCount > 49) throw new Error('Unsafe load bounds');
async function call(path,body) {
  const result = await fetch(target.origin+'/api/'+path,{ method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),
    headers:{ 'Content-Type':'application/json',Authorization:`Bearer ${credential}` },body:JSON.stringify(body) });
  if (!result.ok) throw new Error('Staging request failed with HTTP '+result.status);
  return result.json();
}
const session = await call('session',{});
if (session.environment !== 'staging' || !['GATE','MEAL'].includes(session.role)) throw new Error('Staging session required');
let next = 0;
let stop = false;
const latencies = [], outcomes = {};
await Promise.all(Array.from({ length:concurrency },async () => {
  while (!stop) {
    const index = next++;
    if (index >= count) return;
    const started = performance.now();
    try {
      const result = await call('attendance',{ action:session.role,requestId:crypto.randomUUID(),
        token:'STAGE'+String(index%fixtureCount+1).padStart(11,'0') });
      const allowed = session.role === 'GATE' ? ['ENTRY_OK','ALREADY_ENTERED'] : ['MEAL_OK','MEAL_ALREADY_SERVED'];
      if (!allowed.includes(result.code)) throw new Error('Unexpected staging result');
      latencies.push(performance.now()-started);
      outcomes[result.code] = (outcomes[result.code] || 0)+1;
    } catch { stop = true; outcomes.ERROR = (outcomes.ERROR || 0)+1; }
    await new Promise((resolve) => setTimeout(resolve,intervalMs));
  }
}));
latencies.sort((a,b) => a-b);
const percentile = (fraction) => latencies[Math.max(0,Math.ceil(latencies.length*fraction)-1)] ?? null;
console.log(JSON.stringify({ completed:latencies.length,outcomes,p50Ms:percentile(.5),p95Ms:percentile(.95),p99Ms:percentile(.99),
  note:'Staging only. Reconcile timestamps, Activity and ScannerRequests using the staging sheet; this run does not reset data.' },null,2));
if (stop) process.exitCode = 1;
