import { test, expect } from '@playwright/test';
import QRCode from 'qrcode';
import { fakeCamera } from './helpers/fake-camera.js';

const badge = 'https://script.google.com/macros/s/TEST_DEPLOYMENT/exec?t=SYNTHETIC_ONLY';


test('decodes QR continuously in browser, stops tracks, never sends QR externally', async ({ page }) => {
  await fakeCamera(page, badge);
  const external = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== 'http://127.0.0.1:4173') external.push(request.url());
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Start camera' }).click();
  await expect(page.getByRole('heading', { name: 'QR DETECTED', exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#count')).toHaveText('1');
  await expect(page.locator('#count')).toHaveText('2', { timeout: 10000 });
  const nextQr = await QRCode.toDataURL(badge.replace('SYNTHETIC_ONLY', 'SECOND_SYNTHETIC'), { width: 480, margin: 5 });
  await page.evaluate((data) => window.testSetQr(data), nextQr);
  await expect(page.locator('#count')).toHaveText('3', { timeout: 10000 });
  await expect(page.locator('body')).not.toContainText('SYNTHETIC_ONLY');
  await page.getByRole('button', { name: 'Stop camera' }).click();
  await expect.poll(() => page.evaluate(() => window.testStream.getTracks().every((t) => t.readyState === 'ended'))).toBe(true);
  await expect(page.locator('#camera-status')).toContainText('Camera stopped');
  expect(external).toEqual([]);
});

test('permission denial gives recovery instructions and restart works', async ({ page }) => {
  await fakeCamera(page, badge, true);
  await page.goto('/');
  await page.getByRole('button', { name: 'Start camera' }).click();
  await expect(page.locator('#result-title')).toHaveText('Camera unavailable');
  await expect(page.locator('#result-detail')).toContainText('permission');
  await page.evaluate(() => { window.testDenyCamera = false; });
  await page.getByRole('button', { name: 'Restart camera' }).click();
  await expect(page.locator('#count')).not.toHaveText('0', { timeout: 15000 });
});

test('unrecognized QR is rejected without following its URL', async ({ page }) => {
  await fakeCamera(page, 'https://example.invalid/not-a-badge');
  await page.goto('/');
  await page.getByRole('button', { name: 'Start camera' }).click();
  await expect(page.locator('#result-title')).toHaveText('UNRECOGNIZED QR', { timeout: 15000 });
  expect(page.url()).toBe('http://127.0.0.1:4173/');
});

test('refresh resets camera and counter; offline never claims attendance', async ({ page, context }) => {
  await fakeCamera(page, badge);
  await page.goto('/');
  await page.getByRole('button', { name: 'Start camera' }).click();
  await expect(page.locator('#count')).not.toHaveText('0', { timeout: 15000 });
  await page.reload();
  await expect(page.locator('#count')).toHaveText('0');
  await expect(page.getByRole('button', { name: 'Start camera' })).toBeEnabled();
  await context.setOffline(true);
  await expect(page.locator('#connection')).toContainText('Offline');
  await expect(page.locator('#connection')).toContainText('Attendance is unavailable');
});

test('camera interruption offers restart', async ({ page }) => {
  await fakeCamera(page, badge);
  await page.goto('/');
  await page.getByRole('button', { name: 'Start camera' }).click();
  await expect(page.locator('#camera-status')).toContainText('Camera active');
  await page.evaluate(() => window.testStream.getVideoTracks()[0].dispatchEvent(new Event('ended')));
  await expect(page.locator('#result-title')).toHaveText('Camera interrupted');
  await page.getByRole('button', { name: 'Restart camera' }).click();
  await expect(page.locator('#camera-status')).toContainText('Camera active');
});

