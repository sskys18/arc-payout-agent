import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ethers } from 'ethers';
import { InMemoryContractorStore } from '../src/store.ts';
import type { UpdateContractorPatch } from '../src/store.ts';
import { InMemoryLedger } from '@arc/core/ledger';
import { parseUnits } from '@arc/core/amounts';
import { payoutKey } from '@arc/core/idempotency';
import { txUrl } from '@arc/core/arcscan';
import { planDueRun, runDueNow } from '../src/agent.ts';
import type { TxStatus } from '../src/agent.ts';
import type { PayoutSigner } from '@arc/core/circle';

const USDC = '0x0000000000000000000000000000000000005ddc';
// Two arbitrary, valid (lower-case) EVM addresses; the store checksums them.
const ADDR_A = '0x000000000000000000000000000000000000aaaa';
const ADDR_B = '0x000000000000000000000000000000000000bbbb';

const TXHASH = `0x${'ab'.repeat(32)}`;

/** Mock signer: deterministic txHash, counts how many times it broadcast. */
class MockSigner implements PayoutSigner {
  submitCalls = 0;
  lastArgs: { usdc: string; to: string; units: bigint; idempotencyKey: string } | null = null;
  readonly hash: string;
  constructor(hash = TXHASH) {
    this.hash = hash;
  }
  async address(): Promise<string> {
    return ADDR_A;
  }
  async submitUsdcTransfer(args: {
    usdc: string;
    to: string;
    units: bigint;
    idempotencyKey: string;
  }): Promise<{ txHash: string }> {
    this.submitCalls += 1;
    this.lastArgs = args;
    return { txHash: this.hash };
  }
}

/** Poll that walks a status sequence (last value sticks). */
function seqPoll(...statuses: TxStatus[]): (txHash: string) => Promise<TxStatus> {
  let i = 0;
  return async () => statuses[Math.min(i++, statuses.length - 1)] as TxStatus;
}

/** Simple boolean single-owner lock. */
function makeLock() {
  let held = false;
  return {
    acquire(): boolean {
      if (held) return false;
      held = true;
      return true;
    },
    release(): void {
      held = false;
    },
    get held(): boolean {
      return held;
    },
  };
}

const eventsOfType = (ledger: InMemoryLedger, type: string) =>
  ledger.all().filter((e) => e.type === type);

test('planDueRun: selects only due, active contractors (weekly + monthly)', () => {
  const store = new InMemoryContractorStore();
  const now = new Date('2026-06-28T00:00:00Z');
  // due: never paid, active, weekly
  const c1 = store.add({ id: 'c1', name: 'Weekly Due', payoutAddress: ADDR_A, amountUsdc: '100', cadence: 'weekly' });
  // not due: paid yesterday, weekly
  store.add({ id: 'c2', name: 'Weekly Recent', payoutAddress: ADDR_B, amountUsdc: '50', cadence: 'weekly', lastPaidAt: '2026-06-27T00:00:00Z' });
  // due: never paid, monthly
  store.add({ id: 'c3', name: 'Monthly Due', payoutAddress: ADDR_A, amountUsdc: '2.5', cadence: 'monthly' });
  // excluded: inactive though due
  store.add({ id: 'c4', name: 'Inactive', payoutAddress: ADDR_B, amountUsdc: '9', cadence: 'weekly', active: false });
  // not due: monthly, paid 10 days ago
  store.add({ id: 'c5', name: 'Monthly Recent', payoutAddress: ADDR_A, amountUsdc: '7', cadence: 'monthly', lastPaidAt: '2026-06-18T00:00:00Z' });

  const plan = planDueRun({ contractors: store.list(), now, runId: 'run-x' });
  const ids = plan.payouts.map((p) => p.contractorId).sort();
  assert.deepEqual(ids, ['c1', 'c3']);

  const p1 = plan.payouts.find((p) => p.contractorId === 'c1');
  assert.ok(p1);
  assert.equal(p1.idempotencyKey, payoutKey('run-x', 'c1'));
  assert.equal(p1.memo, 'payout:run-x:c1');
  assert.equal(p1.units, parseUnits('100'));
  assert.equal(p1.to, ethers.getAddress(c1.payoutAddress));
  // monthly amount carries fractional units correctly
  const p3 = plan.payouts.find((p) => p.contractorId === 'c3');
  assert.equal(p3?.units, parseUnits('2.5'));

  // PURE: identical inputs -> identical output
  const again = planDueRun({ contractors: store.list(), now, runId: 'run-x' });
  assert.deepEqual(again.payouts, plan.payouts);
});

test('runDueNow: happy path pays a due contractor once, confirmed receipt + ledger', async () => {
  const store = new InMemoryContractorStore();
  store.add({ id: 'c1', name: 'Ada', payoutAddress: ADDR_A, amountUsdc: '100', cadence: 'weekly' });
  const ledger = new InMemoryLedger();
  const signer = new MockSigner();
  const now = new Date('2026-06-28T00:00:00Z');

  const res = await runDueNow({
    store,
    ledger,
    signer,
    usdc: USDC,
    now,
    runId: 'run-1',
    lock: makeLock(),
    poll: seqPoll('confirmed'),
  });

  assert.equal(res.receipts.length, 1);
  const r = res.receipts[0]!;
  assert.equal(r.status, 'confirmed');
  assert.equal(r.txHash, TXHASH);
  assert.equal(r.arcscanUrl, txUrl(TXHASH));
  assert.equal(r.units, parseUnits('100').toString());
  assert.equal(r.contractorName, 'Ada');
  assert.equal(r.to, ethers.getAddress(ADDR_A));
  assert.ok(r.confirmedAt);

  assert.equal(signer.submitCalls, 1);
  assert.equal(signer.lastArgs?.usdc, USDC);
  assert.equal(signer.lastArgs?.idempotencyKey, payoutKey('run-1', 'c1'));

  const key = payoutKey('run-1', 'c1');
  assert.equal(ledger.hasTerminal(key), true);
  assert.equal(eventsOfType(ledger, 'payout_submitted').length, 1);
  assert.equal(eventsOfType(ledger, 'payout_confirmed').length, 1);
  assert.equal(eventsOfType(ledger, 'run_planned').length, 1);
  assert.equal(eventsOfType(ledger, 'run_succeeded').length, 1);

  // contractor's lastPaidAt is recorded
  assert.equal(store.get('c1')?.lastPaidAt, r.confirmedAt);
});

test('runDueNow: idempotent rerun after success does not re-pay (hasTerminal short-circuits)', async () => {
  const store = new InMemoryContractorStore();
  store.add({ id: 'c1', name: 'Ada', payoutAddress: ADDR_A, amountUsdc: '100', cadence: 'weekly' });
  const ledger = new InMemoryLedger();
  const signer = new MockSigner();

  const run1 = await runDueNow({
    store, ledger, signer, usdc: USDC,
    now: new Date('2026-06-28T00:00:00Z'),
    runId: 'run-fixed',
    lock: makeLock(),
    poll: seqPoll('confirmed'),
  });
  assert.equal(run1.receipts.length, 1);
  assert.equal(signer.submitCalls, 1);

  // Rerun the SAME run id later, when cadence would otherwise make it due again.
  // The terminal marker for the identical payout key short-circuits the payout.
  const run2 = await runDueNow({
    store, ledger, signer, usdc: USDC,
    now: new Date('2026-07-06T00:00:00Z'), // > 7 days after lastPaidAt -> planner re-selects
    runId: 'run-fixed',
    lock: makeLock(),
    poll: seqPoll('confirmed'),
  });

  assert.equal(run2.receipts.length, 0); // skipped via hasTerminal
  assert.equal(signer.submitCalls, 1); // no second broadcast
  assert.equal(eventsOfType(ledger, 'payout_submitted').length, 1);
  assert.equal(eventsOfType(ledger, 'payout_confirmed').length, 1);
});

test('runDueNow: rerun while pending reconciles, never broadcasts twice', async () => {
  const store = new InMemoryContractorStore();
  store.add({ id: 'c1', name: 'Ada', payoutAddress: ADDR_A, amountUsdc: '100', cadence: 'weekly' });
  const ledger = new InMemoryLedger();
  const signer = new MockSigner();
  const now = new Date('2026-06-28T00:00:00Z');

  // First run: tx broadcast but stays pending -> no terminal, lastPaidAt untouched.
  const run1 = await runDueNow({
    store, ledger, signer, usdc: USDC, now,
    runId: 'run-1', lock: makeLock(),
    poll: seqPoll('pending'),
  });
  assert.equal(run1.receipts.length, 1);
  assert.equal(run1.receipts[0]!.status, 'submitted');
  assert.equal(run1.receipts[0]!.txHash, TXHASH);
  assert.equal(signer.submitCalls, 1);
  assert.equal(ledger.hasTerminal(payoutKey('run-1', 'c1')), false);
  assert.equal(store.get('c1')?.lastPaidAt, null);

  // Second run before confirmation: must reconcile the existing submit marker,
  // NOT broadcast a second tx for the same payout key.
  const run2 = await runDueNow({
    store, ledger, signer, usdc: USDC, now,
    runId: 'run-1', lock: makeLock(),
    poll: seqPoll('pending'),
  });
  assert.equal(signer.submitCalls, 1); // exactly one submit total
  assert.equal(eventsOfType(ledger, 'payout_submitted').length, 1);
  assert.equal(eventsOfType(ledger, 'payout_broadcast').length, 1);
  assert.equal(run2.receipts.length, 1);
  assert.equal(run2.receipts[0]!.status, 'submitted');
  assert.equal(run2.receipts[0]!.txHash, TXHASH);

  // Once it finally confirms, the third run reconciles to terminal (still one submit).
  const run3 = await runDueNow({
    store, ledger, signer, usdc: USDC, now,
    runId: 'run-1', lock: makeLock(),
    poll: seqPoll('confirmed'),
  });
  assert.equal(signer.submitCalls, 1);
  assert.equal(run3.receipts[0]!.status, 'confirmed');
  assert.equal(ledger.hasTerminal(payoutKey('run-1', 'c1')), true);
});

test('runDueNow: returns early when the lock is held', async () => {
  const store = new InMemoryContractorStore();
  store.add({ id: 'c1', name: 'Ada', payoutAddress: ADDR_A, amountUsdc: '100', cadence: 'weekly' });
  const ledger = new InMemoryLedger();
  const signer = new MockSigner();
  const lock = makeLock();
  assert.equal(lock.acquire(), true); // pre-hold

  const res = await runDueNow({
    store, ledger, signer, usdc: USDC,
    now: new Date('2026-06-28T00:00:00Z'),
    lock,
    poll: seqPoll('confirmed'),
  });
  assert.equal(res.reason, 'locked');
  assert.equal(res.receipts.length, 0);
  assert.equal(signer.submitCalls, 0);
});

test('store.add: rejects invalid address', () => {
  const store = new InMemoryContractorStore();
  assert.throws(
    () => store.add({ name: 'Bad', payoutAddress: '0xnope', amountUsdc: '10', cadence: 'weekly' }),
    /invalid payout address/,
  );
});

test('store.add: rejects non-positive / empty name / bad cadence', () => {
  const store = new InMemoryContractorStore();
  assert.throws(
    () => store.add({ name: 'Zero', payoutAddress: ADDR_A, amountUsdc: '0', cadence: 'weekly' }),
    /amount must be > 0/,
  );
  assert.throws(
    () => store.add({ name: 'Neg', payoutAddress: ADDR_A, amountUsdc: '-5', cadence: 'weekly' }),
    /negative amount/,
  );
  assert.throws(
    () => store.add({ name: '   ', payoutAddress: ADDR_A, amountUsdc: '10', cadence: 'weekly' }),
    /name must be non-empty/,
  );
  assert.throws(
    // @ts-expect-error: exercising the runtime cadence guard
    () => store.add({ name: 'BadCad', payoutAddress: ADDR_A, amountUsdc: '10', cadence: 'daily' }),
    /invalid cadence/,
  );
});
// --- FIX 1: liveness — a transient signer throw must not permanently wedge ---

/** Signer that throws on its first broadcast attempt, then succeeds. */
class FlakyOnceSigner implements PayoutSigner {
  submitCalls = 0;
  async address(): Promise<string> {
    return ADDR_A;
  }
  async submitUsdcTransfer(_args: {
    usdc: string;
    to: string;
    units: bigint;
    idempotencyKey: string;
  }): Promise<{ txHash: string }> {
    this.submitCalls += 1;
    if (this.submitCalls === 1) {
      throw new Error('network down: pre-broadcast failure');
    }
    return { txHash: TXHASH };
  }
}

test('runDueNow: transient signer throw is retried (no wedge), pays exactly once', async () => {
  const store = new InMemoryContractorStore();
  store.add({ id: 'c1', name: 'Ada', payoutAddress: ADDR_A, amountUsdc: '100', cadence: 'weekly' });
  const ledger = new InMemoryLedger();
  const signer = new FlakyOnceSigner();
  const now = new Date('2026-06-28T00:00:00Z');
  const key = payoutKey('run-1', 'c1');

  // Run 1: the signer THROWS pre-broadcast. The run must not throw, must not mark
  // terminal, and must record a `payout_broadcast_failed` event. The attempt counts.
  const run1 = await runDueNow({
    store, ledger, signer, usdc: USDC, now,
    runId: 'run-1', lock: makeLock(),
    poll: seqPoll('confirmed'),
  });
  assert.equal(signer.submitCalls, 1); // the failed attempt is counted
  assert.equal(ledger.hasTerminal(key), false); // NOT terminal
  assert.equal(eventsOfType(ledger, 'payout_broadcast_failed').length, 1);
  assert.equal(eventsOfType(ledger, 'payout_broadcast').length, 0); // nothing broadcast
  assert.equal(eventsOfType(ledger, 'payout_confirmed').length, 0);
  assert.equal(eventsOfType(ledger, 'payout_submitted').length, 1); // single write-ahead marker
  assert.equal(eventsOfType(ledger, 'run_failed').length, 0); // run continued, did not fail
  assert.equal(eventsOfType(ledger, 'run_succeeded').length, 1);
  assert.equal(run1.receipts.filter((r) => r.status === 'confirmed').length, 0);

  // Run 2 (same period, same run id): the prior throw broadcast NOTHING, so this
  // payout key is eligible to re-broadcast. It confirms this time.
  const run2 = await runDueNow({
    store, ledger, signer, usdc: USDC, now,
    runId: 'run-1', lock: makeLock(),
    poll: seqPoll('confirmed'),
  });
  assert.equal(signer.submitCalls, 2); // one failed + one successful attempt
  assert.equal(ledger.hasTerminal(key), true);

  // Exactly ONE successful confirmed payout/receipt — no double-pay.
  const confirmed = run2.receipts.filter((r) => r.status === 'confirmed');
  assert.equal(confirmed.length, 1);
  assert.equal(confirmed[0]!.txHash, TXHASH);
  assert.equal(eventsOfType(ledger, 'payout_broadcast').length, 1); // exactly one broadcast total
  assert.equal(eventsOfType(ledger, 'payout_confirmed').length, 1);
  assert.equal(eventsOfType(ledger, 'payout_submitted').length, 1); // still a single submit marker
});

// --- FIX 2: cross-period double-pay guard independent of persisted lastPaidAt ---

/** Store that silently DROPS lastPaidAt updates — simulates a persistence gap. */
class DropLastPaidStore extends InMemoryContractorStore {
  update(id: string, patch: UpdateContractorPatch) {
    const next: UpdateContractorPatch = { ...patch };
    delete next.lastPaidAt;
    return super.update(id, next);
  }
}

test('runDueNow: confirmed ledger terminal blocks re-pay in-period even if lastPaidAt is not persisted', async () => {
  const store = new DropLastPaidStore();
  store.add({ id: 'c1', name: 'Ada', payoutAddress: ADDR_A, amountUsdc: '100', cadence: 'weekly' });
  const ledger = new InMemoryLedger();
  const signer = new MockSigner();

  // Run 1 (date-derived run id): confirm the payout. The store drops lastPaidAt.
  const run1 = await runDueNow({
    store, ledger, signer, usdc: USDC,
    now: new Date('2026-06-28T00:00:00Z'),
    lock: makeLock(),
    poll: seqPoll('confirmed'),
  });
  assert.equal(run1.receipts.length, 1);
  assert.equal(run1.receipts[0]!.status, 'confirmed');
  assert.equal(signer.submitCalls, 1);
  assert.equal(store.get('c1')?.lastPaidAt, null); // persistence gap: never advanced

  // Run 2: a DIFFERENT day in the SAME weekly period -> a new date-derived run id,
  // so the per-run terminal key would NOT match and isDue (lastPaidAt still null)
  // re-selects c1. The durable confirmed-terminal-this-period guard must skip it.
  const run2 = await runDueNow({
    store, ledger, signer, usdc: USDC,
    now: new Date('2026-06-30T00:00:00Z'),
    lock: makeLock(),
    poll: seqPoll('confirmed'),
  });
  assert.equal(run2.receipts.length, 0); // skipped: already confirmed this period
  assert.equal(signer.submitCalls, 1); // no second broadcast -> no double-pay
  assert.equal(eventsOfType(ledger, 'payout_broadcast').length, 1);
  assert.equal(eventsOfType(ledger, 'payout_confirmed').length, 1);

  // Sanity: a payout in the NEXT period (after the cadence interval) IS allowed.
  const run3 = await runDueNow({
    store, ledger, signer, usdc: USDC,
    now: new Date('2026-07-07T00:00:00Z'), // > 7 days after the 06-28 confirmation
    lock: makeLock(),
    poll: seqPoll('confirmed'),
  });
  assert.equal(run3.receipts.length, 1);
  assert.equal(run3.receipts[0]!.status, 'confirmed');
  assert.equal(signer.submitCalls, 2);
  assert.equal(eventsOfType(ledger, 'payout_confirmed').length, 2);
});

// --- FIX 3: a crash AT the terminal-marker write must not enable a double-pay ---

/**
 * Ledger whose FIRST markTerminal THROWS — simulating the process dying exactly
 * at the terminal-marker write of the confirmed branch (on a durable ledger the
 * confirmed event and the terminal marker are separate appendFileSync calls).
 * This pins down ordering: only writes that happened BEFORE markTerminal survive
 * the crash. With the correct order (payout_confirmed appended first) the durable
 * confirmed event survives; with the buggy order (markTerminal first) it would
 * not, and a different-run-id same-period rerun would double-pay.
 */
class ThrowOnFirstTerminalLedger extends InMemoryLedger {
  private threw = false;
  markTerminal(key: string): void {
    if (!this.threw) {
      this.threw = true;
      throw new Error('simulated crash at terminal-marker write');
    }
    super.markTerminal(key);
  }
}

test('runDueNow: crash at the terminal-marker write does not double-pay (different run id, same period)', async () => {
  // DropLastPaidStore drops lastPaidAt so isDue keeps re-selecting c1; the only
  // surviving cross-period guard is the durable payout_confirmed event.
  const store = new DropLastPaidStore();
  store.add({ id: 'c1', name: 'Ada', payoutAddress: ADDR_A, amountUsdc: '100', cadence: 'weekly' });
  const ledger = new ThrowOnFirstTerminalLedger();
  const signer = new MockSigner();

  // Run 1: confirm c1. The broadcast (submitCalls=1) and the durable
  // payout_confirmed append both complete BEFORE markTerminal; markTerminal then
  // throws, aborting the run mid-confirmed-branch (the crash). The correct write
  // order is what leaves payout_confirmed durable at this crash point.
  await assert.rejects(
    runDueNow({
      store,
      ledger,
      signer,
      usdc: USDC,
      now: new Date('2026-06-28T00:00:00Z'),
      runId: 'run-a',
      lock: makeLock(),
      poll: seqPoll('confirmed'),
    }),
    /simulated crash at terminal-marker write/,
  );

  // Crash state: the tx was broadcast and the confirmed event is durable, but the
  // terminal marker for its key is absent and lastPaidAt never advanced.
  const key1 = payoutKey('run-a', 'c1');
  assert.equal(signer.submitCalls, 1);
  assert.equal(eventsOfType(ledger, 'payout_broadcast').length, 1);
  assert.equal(eventsOfType(ledger, 'payout_confirmed').length, 1);
  assert.equal(ledger.hasTerminal(key1), false);
  assert.equal(store.get('c1')?.lastPaidAt, null);

  // Run 2: SAME weekly period, DIFFERENT run id -> a new payout key (no terminal
  // for it) and isDue re-selects c1 (lastPaidAt still null). Neither the terminal
  // guard nor lastPaidAt can stop a re-pay here; only hasConfirmedThisPeriod,
  // reading the durable payout_confirmed event, must skip it.
  const run2 = await runDueNow({
    store,
    ledger,
    signer,
    usdc: USDC,
    now: new Date('2026-06-30T00:00:00Z'),
    runId: 'run-b',
    lock: makeLock(),
    poll: seqPoll('confirmed'),
  });
  assert.equal(run2.receipts.length, 0); // skipped: already confirmed this period
  assert.equal(signer.submitCalls, 1); // no second broadcast -> no double-pay
  assert.equal(eventsOfType(ledger, 'payout_broadcast').length, 1);
  assert.equal(eventsOfType(ledger, 'payout_confirmed').length, 1);
});
