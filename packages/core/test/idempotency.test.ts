import { test } from 'node:test';
import assert from 'node:assert/strict';
import { payoutKey, runKey } from '../src/idempotency.ts';

test('payoutKey: stable for same inputs', () => {
  assert.equal(payoutKey('run-1', 'c-42'), payoutKey('run-1', 'c-42'));
  assert.equal(payoutKey('run-1', 'c-42'), 'payout:run-1:c-42');
});

test('payoutKey: distinct for different inputs', () => {
  assert.notEqual(payoutKey('run-1', 'c-42'), payoutKey('run-2', 'c-42'));
  assert.notEqual(payoutKey('run-1', 'c-42'), payoutKey('run-1', 'c-43'));
});

test('runKey: stable and distinct by date', () => {
  assert.equal(runKey('2026-06-28'), runKey('2026-06-28'));
  assert.equal(runKey('2026-06-28'), 'run:2026-06-28');
  assert.notEqual(runKey('2026-06-28'), runKey('2026-06-29'));
});

test('payoutKey: escaping prevents delimiter collisions', () => {
  // Without escaping these both join to "payout:a:b:c".
  assert.notEqual(payoutKey('a:b', 'c'), payoutKey('a', 'b:c'));
});

test('payoutKey: escaped keys are stable and deterministic', () => {
  assert.equal(payoutKey('a:b', 'c'), payoutKey('a:b', 'c'));
  assert.equal(payoutKey('a:b', 'c'), 'payout:a%3Ab:c');
  assert.equal(payoutKey('a', 'b:c'), 'payout:a:b%3Ac');
});
