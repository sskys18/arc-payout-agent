import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUnits, formatUnits, assertPositiveAmount } from '../src/amounts.ts';

test('parseUnits: whole and fractional with default 6 decimals', () => {
  assert.equal(parseUnits('1'), 1_000_000n);
  assert.equal(parseUnits('1.5'), 1_500_000n);
  assert.equal(parseUnits('0.000001'), 1n);
  assert.equal(parseUnits('1234.567890'), 1_234_567_890n);
});

test('parseUnits: custom decimals', () => {
  assert.equal(parseUnits('1.5', 2), 150n);
  assert.equal(parseUnits('42', 0), 42n);
});

test('formatUnits: trims trailing zeros and round-trips', () => {
  assert.equal(formatUnits(1_000_000n), '1');
  assert.equal(formatUnits(1_500_000n), '1.5');
  assert.equal(formatUnits(1n), '0.000001');
  for (const v of ['1', '1.5', '0.000001', '1234.56789', '0.1']) {
    assert.equal(formatUnits(parseUnits(v)), v, `round-trip ${v}`);
  }
});

test('parseUnits: rejects negative', () => {
  assert.throws(() => parseUnits('-1'), /negative/);
});

test('parseUnits: rejects empty / whitespace', () => {
  assert.throws(() => parseUnits(''), /empty/);
  assert.throws(() => parseUnits('   '), /empty/);
});

test('parseUnits: rejects NaN / garbage', () => {
  assert.throws(() => parseUnits('abc'), /invalid decimal/);
  assert.throws(() => parseUnits('1.2.3'), /invalid decimal/);
  assert.throws(() => parseUnits('1e6'), /invalid decimal/);
});

test('parseUnits: rejects over-precision', () => {
  assert.throws(() => parseUnits('1.1234567'), /fractional digits/);
  assert.throws(() => parseUnits('0.001', 2), /fractional digits/);
});

test('assertPositiveAmount: passes positive, throws on zero/negative', () => {
  assert.doesNotThrow(() => assertPositiveAmount('0.01'));
  assert.throws(() => assertPositiveAmount('0'), /must be > 0/);
  assert.throws(() => assertPositiveAmount('0.000000'), /must be > 0/);
  assert.throws(() => assertPositiveAmount('-5'), /negative/);
});
