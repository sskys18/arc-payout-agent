import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InMemoryLedger, JsonFileLedger } from '../src/ledger.ts';
import type { LedgerStore } from '../src/ledger.ts';

const now = () => new Date('2026-06-28T00:00:00Z').toISOString();

function sharedBehavior(name: string, make: () => LedgerStore) {
  test(`${name}: append accumulates events`, () => {
    const led = make();
    assert.deepEqual(led.all(), []);
    led.append({ ts: now(), type: 'run_started', key: 'run:2026-06-28' });
    led.append({ ts: now(), type: 'payout_sent', key: 'payout:run-1:c-1', amount: '10' });
    const all = led.all();
    assert.equal(all.length, 2);
    assert.equal(all[0]?.type, 'run_started');
    assert.equal(all[1]?.amount, '10');
  });

  test(`${name}: hasTerminal/markTerminal`, () => {
    const led = make();
    assert.equal(led.hasTerminal('payout:run-1:c-1'), false);
    led.markTerminal('payout:run-1:c-1');
    assert.equal(led.hasTerminal('payout:run-1:c-1'), true);
    assert.equal(led.hasTerminal('payout:run-1:c-2'), false);
  });

  test(`${name}: markTerminal is idempotent (no duplicate terminal)`, () => {
    const led = make();
    led.markTerminal('run:2026-06-28');
    led.markTerminal('run:2026-06-28');
    assert.equal(led.hasTerminal('run:2026-06-28'), true);
  });
}

sharedBehavior('InMemoryLedger', () => new InMemoryLedger());

let tmp: string | null = null;
function makeFileLedger(): JsonFileLedger {
  tmp = mkdtempSync(join(tmpdir(), 'arc-ledger-'));
  return new JsonFileLedger(join(tmp, 'events.jsonl'));
}
sharedBehavior('JsonFileLedger', makeFileLedger);

test('JsonFileLedger: durable across reopen, no duplicate terminal marker line', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arc-ledger-dur-'));
  const path = join(dir, 'events.jsonl');
  try {
    const a = new JsonFileLedger(path);
    a.append({ ts: now(), type: 'payout_sent', key: 'payout:run-1:c-1' });
    a.markTerminal('payout:run-1:c-1');
    a.markTerminal('payout:run-1:c-1'); // duplicate, must not write a second line

    // Reopen: state is reloaded from disk.
    const b = new JsonFileLedger(path);
    assert.equal(b.hasTerminal('payout:run-1:c-1'), true);
    assert.equal(b.all().length, 1);

    const markers = readFileSync(b.terminalPath, 'utf8').trim().split('\n').filter(Boolean);
    assert.deepEqual(markers, ['payout:run-1:c-1']);
    assert.equal(existsSync(path), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test.after(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});
