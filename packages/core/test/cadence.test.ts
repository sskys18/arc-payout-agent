import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextDue, isDue } from '../src/cadence.ts';
import type { Cadence } from '../src/cadence.ts';

const at = (iso: string) => new Date(iso);

test('nextDue: weekly adds 7 days', () => {
  assert.equal(
    nextDue('weekly', at('2026-06-01T00:00:00Z')).toISOString(),
    '2026-06-08T00:00:00.000Z',
  );
});

test('nextDue: monthly adds 1 month', () => {
  assert.equal(
    nextDue('monthly', at('2026-06-15T12:00:00Z')).toISOString(),
    '2026-07-15T12:00:00.000Z',
  );
});

test('isDue: true when never paid', () => {
  for (const cadence of ['weekly', 'monthly'] as Cadence[]) {
    assert.equal(isDue({ cadence, lastPaidAt: null, now: at('2026-06-01T00:00:00Z') }), true);
  }
});

test('isDue: weekly not due before 7 days, due at/after', () => {
  const lastPaidAt = at('2026-06-01T00:00:00Z');
  assert.equal(isDue({ cadence: 'weekly', lastPaidAt, now: at('2026-06-07T23:59:59Z') }), false);
  assert.equal(isDue({ cadence: 'weekly', lastPaidAt, now: at('2026-06-08T00:00:00Z') }), true);
  assert.equal(isDue({ cadence: 'weekly', lastPaidAt, now: at('2026-06-20T00:00:00Z') }), true);
});

test('isDue: monthly not due before 1 month, due at/after', () => {
  const lastPaidAt = at('2026-06-15T00:00:00Z');
  assert.equal(isDue({ cadence: 'monthly', lastPaidAt, now: at('2026-07-14T00:00:00Z') }), false);
  assert.equal(isDue({ cadence: 'monthly', lastPaidAt, now: at('2026-07-15T00:00:00Z') }), true);
});

test('nextDue: monthly clamps Jan 31 -> Feb 28 (non-leap)', () => {
  assert.equal(
    nextDue('monthly', at('2026-01-31T00:00:00Z')).toISOString(),
    '2026-02-28T00:00:00.000Z',
  );
});

test('nextDue: monthly clamps Jan 31 -> Feb 29 (leap year)', () => {
  assert.equal(
    nextDue('monthly', at('2024-01-31T00:00:00Z')).toISOString(),
    '2024-02-29T00:00:00.000Z',
  );
});

test('nextDue: monthly clamps Jan 30 -> Feb 28 (non-leap)', () => {
  assert.equal(
    nextDue('monthly', at('2026-01-30T00:00:00Z')).toISOString(),
    '2026-02-28T00:00:00.000Z',
  );
});

test('nextDue: monthly keeps day-of-month for a normal mid-month case', () => {
  assert.equal(
    nextDue('monthly', at('2026-03-15T09:30:00Z')).toISOString(),
    '2026-04-15T09:30:00.000Z',
  );
});
