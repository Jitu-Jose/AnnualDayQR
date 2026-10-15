import { test, expect } from '@playwright/test';
import { fakeCamera } from './helpers/fake-camera.js';

const base = 'https://script.google.com/macros/s/SYNTHETIC_STAGING_BADGES/exec';
async function api(page,{ role = 'GATE', failFirst = false } = {}) {
  const requests = [];
  let enrolled = false;
  await page.route('**/api/**',async (route) => {
    const path = new URL(route.request().url()).pathname;
    const data = route.request().postDataJSON();
    if (path === '/api/enroll') {
      enrolled = true;
      return route.fulfill({ json:{ credential:'a'.repeat(64) } });
    }
    if (path === '/api/session') return route.fulfill({ status:enrolled ? 200 : 401,
      json:enrolled ? { environment:'staging',deviceId:'b'.repeat(64),role,badgeBase:base,expiresAt:Date.now()+3600000 } :
        { code:'SCANNER_NOT_AUTHORIZED' } });
    requests.push(data);
    if (failFirst && requests.length === 1) return route.abort('connectionfailed');
    return route.fulfill({ json:{ code:role === 'GATE' ? 'ENTRY_OK' : 'MEAL_OK',role,
      requestId:data.requestId,entryTime:role === 'GATE' ? '2026-10-21T12:30:00Z' : '',
      mealTime:role === 'MEAL' ? '2026-10-21T12:30:00Z' : '',attendeeName:'Synthetic Attendee' } });
  });
  return requests;
}
async function provision(page) {
  await page.goto('/staging.html');
  await expect(page.locator('#scanner-role')).toHaveText('SCANNER NOT AUTHORIZED');
  await page.locator('#provision-code').fill('synthetic-code');
  await page.getByRole('button',{ name:'Provision this scanner' }).click();
  await expect(page.locator('#provisioning')).toBeHidden();
}
for (const role of ['GATE','MEAL']) test(`continuous camera confirms server-authorized ${role} and refresh recovery`,async ({ page }) => {
  await fakeCamera(page,base+'?t=STAGE1');
  const requests = await api(page,{ role });
  await provision(page);
  await expect(page.locator('#scanner-role')).toHaveText(`STAGING · ${role} SCANNER`);
  await page.getByRole('button',{ name:'Start camera' }).click();
  await expect(page.locator('#result-title')).toHaveText(role === 'GATE' ? 'ENTRY OK' : 'MEAL OK',{ timeout:15000 });
  await expect(page.locator('#camera-status')).toContainText('Camera active');
  expect(requests[0].action).toBe(role);
  await page.reload();
  await expect(page.locator('#scanner-role')).toHaveText(`STAGING · ${role} SCANNER`);
  await expect(page.locator('#provisioning')).toBeHidden();
});
test('uncertain network result survives refresh and retries the same request ID',async ({ page }) => {
  await fakeCamera(page,base+'?t=STAGE1');
  const requests = await api(page,{ failFirst:true });
  await provision(page);
  await page.getByRole('button',{ name:'Start camera' }).click();
  await expect(page.locator('#result-title')).toHaveText('NETWORK ERROR — RETRY',{ timeout:15000 });
  await expect(page.locator('#camera-status')).toContainText('Camera active');
  const first = requests[0];
  await page.reload();
  await expect(page.locator('#retry')).toBeVisible();
  await page.locator('#retry').click();
  await expect(page.locator('#result-title')).toHaveText('ENTRY OK');
  expect(requests[1]).toEqual(first);
});
