import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBadgeQr, ScanGate } from '../src/qr.js';

const base = 'https://script.google.com/macros/s/TEST_DEPLOYMENT/exec';
test('extracts token without navigating; supports exact deployment allowlist', () => {
  assert.deepEqual(parseBadgeQr(`${base}?t=mock-token`, base), { base, token: 'mock-token' });
  assert.equal(parseBadgeQr(`${base}?t=mock-token`, base.replace('TEST', 'OTHER')), null);
});
test('rejects hostile, ambiguous and malformed URLs', () => {
  for (const input of [null, '', 'mock-token', 'javascript:alert(1)', `${base}?t=`,
    `${base}?t=a&t=b`, `${base}?t=a&action=gate`, `${base}?t=a#x`,
    `${base}?t=a%0Ab`, `${base}?t=a%20b`, `${base}?t=${'x'.repeat(513)}`,
    base.replace('https:', 'http:') + '?t=a',
    base.replace('script.google.com', 'script.google.com.evil.example') + '?t=a',
    base.replace('script.google.com', 'user@script.google.com') + '?t=a',
    base.replace('/exec', '/dev') + '?t=a', 'x'.repeat(2049)]) {
    assert.equal(parseBadgeQr(input), null, String(input).slice(0, 80));
  }
});
test('debounces same QR across intervening badges and expires old values', () => {
  const gate = new ScanGate(2500);
  assert.equal(gate.accept('a', 0), true);
  assert.equal(gate.accept('a', 1), false);
  assert.equal(gate.accept('b', 2), true);
  assert.equal(gate.accept('a', 3), false);
  assert.equal(gate.accept('a', 2500), true);
  gate.clear();
  assert.equal(gate.accept('a', 2501), true);
});
