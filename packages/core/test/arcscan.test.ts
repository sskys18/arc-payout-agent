import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARCSCAN_BASE, txUrl, addressUrl } from '../src/arcscan.ts';

test('txUrl: builds correct URL', () => {
  const hash = '0xabc123';
  assert.equal(txUrl(hash), `${ARCSCAN_BASE}/tx/${hash}`);
  assert.equal(txUrl(hash), 'https://testnet.arcscan.app/tx/0xabc123');
});

test('txUrl: throws on empty or non-0x hash', () => {
  assert.throws(() => txUrl(''), /invalid tx hash/);
  assert.throws(() => txUrl('abc123'), /invalid tx hash/);
  assert.throws(() => txUrl('0xZZZ'), /invalid tx hash/);
});

test('addressUrl: builds correct URL', () => {
  const addr = '0xdeadBEEF';
  assert.equal(addressUrl(addr), `${ARCSCAN_BASE}/address/${addr}`);
});

test('addressUrl: throws on bad address', () => {
  assert.throws(() => addressUrl(''), /invalid address/);
  assert.throws(() => addressUrl('nope'), /invalid address/);
});
