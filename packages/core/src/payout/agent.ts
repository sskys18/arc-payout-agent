// Payout agent: a PURE deterministic planner and a SINGLE-OWNER runner.
//
// planDueRun  -> given contractors + a clock, deterministically select who is due and
//                build the exact, replayable set of payouts (stable ids/keys/memos).
// runDueNow   -> hold a lock, then for each planned payout submit-and-confirm exactly
//                once. Two durable guards make double-pay impossible:
//                  1. terminal markers  -> a confirmed payout is never re-sent.
//                  2. write-ahead submit markers -> a payout whose tx was broadcast but
//                     not yet confirmed is RECONCILED (re-polled), never re-broadcast.
import { parseUnits } from '../amounts.ts';
import { isDue } from '../cadence.ts';
import { payoutKey, runKey } from '../idempotency.ts';
import { txUrl } from '../arcscan.ts';
import { arcProvider, pollTxStatus } from '../txEngine.ts';
import type { LedgerStore } from '../ledger.ts';
import type { PayoutSigner } from '../circle.ts';
import type { Contractor, ContractorStore } from './store.ts';
import type { PayoutStatus, Receipt } from './receipts.ts';

export type TxStatus = 'confirmed' | 'failed' | 'pending';

export type PlannedPayout = {
  payoutId: string;
  contractorId: string;
  to: string;
  amountUsdc: string;
  units: bigint;
  idempotencyKey: string;
  memo: string;
};

export type PlannedRun = { runId: string; payouts: PlannedPayout[] };

/** Deterministic default run id derived from the run date (UTC). */
function defaultRunId(now: Date): string {
  return `run-${now.toISOString().slice(0, 10)}`;
}

/**
 * PURE: select active+due contractors and build their payouts. Given identical
 * inputs (contractors, now, runId) the output is byte-for-byte identical — ids,
 * idempotency keys, units and memos are all derived, never random or time-stamped.
 */
export function planDueRun(opts: {
  contractors: Contractor[];
  now: Date;
  runId?: string;
  /**
   * Optional cross-period double-pay guard, independent of `lastPaidAt`. Returns
   * true when the durable ledger already records a CONFIRMED payout for the
   * contractor within the current cadence period; such a contractor is skipped
   * even if `isDue` (e.g. a store that failed to persist `lastPaidAt`).
   */
  hasConfirmedThisPeriod?: (contractorId: string, now: Date) => boolean;
}): PlannedRun {
  const runId = opts.runId ?? defaultRunId(opts.now);
  const payouts: PlannedPayout[] = [];
  for (const c of opts.contractors) {
    if (!c.active) continue;
    const due = isDue({
      cadence: c.cadence,
      lastPaidAt: c.lastPaidAt ? new Date(c.lastPaidAt) : null,
      now: opts.now,
    });
    if (!due) continue;
    if (opts.hasConfirmedThisPeriod?.(c.id, opts.now)) continue;
    payouts.push({
      payoutId: `${runId}:${c.id}`,
      contractorId: c.id,
      to: c.payoutAddress,
      amountUsdc: c.amountUsdc,
      units: parseUnits(c.amountUsdc),
      idempotencyKey: payoutKey(runId, c.id),
      memo: `payout:${runId}:${c.id}`,
    });
  }
  return { runId, payouts };
}

export type RunDueDeps = {
  store: ContractorStore;
  ledger: LedgerStore;
  signer: PayoutSigner;
  usdc: string;
  now?: Date;
  /** Pin the run id (defaults to the date-derived id). */
  runId?: string;
  /** External mutual-exclusion lock; the terminal markers alone are not a lock. */
  lock: { acquire(): boolean; release(): void };
  /** Confirmation poller; defaults to the live Arc provider poll. Injected in tests. */
  poll?: (txHash: string) => Promise<TxStatus>;
};

export type RunResult = { runId: string; receipts: Receipt[]; reason?: string };

/** First ledger event of `type` whose `key` matches, or undefined. */
function findEvent(ledger: LedgerStore, type: string, key: string) {
  return ledger.all().find((e) => e.type === type && e.key === key);
}

/** Most recent CONFIRMED payout timestamp for a contractor in the ledger, or null. */
function latestConfirmedAt(ledger: LedgerStore, contractorId: string): Date | null {
  let latest: number | null = null;
  for (const e of ledger.all()) {
    if (e.type !== 'payout_confirmed' || e.contractorId !== contractorId) continue;
    const t = new Date(String(e.ts)).getTime();
    if (Number.isFinite(t) && (latest === null || t > latest)) latest = t;
  }
  return latest === null ? null : new Date(latest);
}

/**
 * True when the ledger already records a CONFIRMED payout for `contractor` within
 * its current cadence period — i.e. `now` has NOT yet reached the next due date
 * after that confirmed payment. This is the durable cross-period double-pay guard,
 * independent of the mutable `contractor.lastPaidAt` (which a store may fail to
 * persist after a terminal payout).
 */
function hasConfirmedThisPeriod(
  ledger: LedgerStore,
  contractor: Contractor | undefined,
  now: Date,
): boolean {
  if (!contractor) return false;
  const last = latestConfirmedAt(ledger, contractor.id);
  if (last === null) return false;
  return !isDue({ cadence: contractor.cadence, lastPaidAt: last, now });
}

async function processPayout(
  deps: RunDueDeps,
  runId: string,
  p: PlannedPayout,
  now: Date,
  poll: (txHash: string) => Promise<TxStatus>,
): Promise<Receipt | null> {
  const contractorName = deps.store.get(p.contractorId)?.name ?? p.contractorId;

  // Guard 1: already confirmed in a prior run -> never re-pay.
  if (deps.ledger.hasTerminal(p.idempotencyKey)) {
    return null;
  }

  let txHash: string;
  let submittedAt: string;
  const existingSubmit = findEvent(deps.ledger, 'payout_submitted', p.idempotencyKey);

  const broadcast = findEvent(deps.ledger, 'payout_broadcast', p.idempotencyKey);
  const recordedHash = typeof broadcast?.txHash === 'string' ? broadcast.txHash : undefined;

  if (recordedHash !== undefined) {
    // Guard 2: a tx WAS broadcast for this key but never confirmed. RECONCILE by
    // re-polling the recorded hash — never broadcast a second tx (double-pay risk).
    submittedAt = existingSubmit ? String(existingSubmit.ts) : now.toISOString();
    txHash = recordedHash;
  } else {
    // No successful broadcast hash recorded yet.
    const failedBroadcast = findEvent(deps.ledger, 'payout_broadcast_failed', p.idempotencyKey);
    if (existingSubmit && !failedBroadcast) {
      // Submit marker exists but neither a broadcast hash nor a recorded throw: the
      // process died AFTER the write-ahead and we cannot prove nothing was sent.
      // Re-broadcasting risks a double-pay, so stay pending; a later run with a
      // recorded hash (or recorded failure) resolves it.
      submittedAt = String(existingSubmit.ts);
      return {
        payoutId: p.payoutId,
        runId,
        contractorId: p.contractorId,
        contractorName,
        to: p.to,
        amountUsdc: p.amountUsdc,
        units: p.units.toString(),
        memo: p.memo,
        txHash: null,
        status: 'submitted',
        arcscanUrl: null,
        submittedAt,
        confirmedAt: null,
      };
    }

    // Either a fresh payout (no submit marker) OR a prior PRE-BROADCAST THROW
    // (`payout_broadcast_failed` proves nothing was broadcast) -> (re)broadcast now.
    submittedAt = existingSubmit ? String(existingSubmit.ts) : now.toISOString();
    if (!existingSubmit) {
      // WRITE-AHEAD the submit marker BEFORE broadcasting, so a crash between here
      // and the broadcast still leaves a durable breadcrumb for reconciliation.
      deps.ledger.append({
        ts: submittedAt,
        type: 'payout_submitted',
        key: p.idempotencyKey,
        runId,
        contractorId: p.contractorId,
        to: p.to,
        units: p.units.toString(),
        memo: p.memo,
      });
    }
    let res: { txHash: string };
    try {
      res = await deps.signer.submitUsdcTransfer({
        usdc: deps.usdc,
        to: p.to,
        units: p.units,
        idempotencyKey: p.idempotencyKey,
      });
    } catch (err) {
      // A thrown submit guarantees NOTHING was broadcast (pre-broadcast / network
      // failure). Record the failure WITHOUT a terminal so the next run is eligible
      // to re-broadcast — a transient throw must not permanently wedge the payout,
      // and because nothing was broadcast a retry cannot double-pay.
      deps.ledger.append({
        ts: now.toISOString(),
        type: 'payout_broadcast_failed',
        key: p.idempotencyKey,
        runId,
        contractorId: p.contractorId,
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        payoutId: p.payoutId,
        runId,
        contractorId: p.contractorId,
        contractorName,
        to: p.to,
        amountUsdc: p.amountUsdc,
        units: p.units.toString(),
        memo: p.memo,
        txHash: null,
        status: 'failed',
        arcscanUrl: null,
        submittedAt,
        confirmedAt: null,
      };
    }
    txHash = res.txHash;
    deps.ledger.append({
      ts: now.toISOString(),
      type: 'payout_broadcast',
      key: p.idempotencyKey,
      runId,
      txHash,
    });
  }

  const status = await poll(txHash);
  let receiptStatus: PayoutStatus;
  let confirmedAt: string | null = null;
  if (status === 'confirmed') {
    confirmedAt = now.toISOString();
    // Persist the durable cross-period signal BEFORE the terminal marker. On a
    // durable ledger these are separate appends; a crash between them must never
    // erase the double-pay guard. Order: (1) the payout_confirmed event (read by
    // hasConfirmedThisPeriod across runs), (2) the mutable lastPaidAt, (3) the
    // terminal marker LAST. If a crash strikes before markTerminal: a same-run-id
    // rerun hits the reconcile branch (broadcast event present -> re-poll, never
    // re-broadcast), and a different-run-id same-period rerun is skipped by
    // hasConfirmedThisPeriod since the confirmed event is already durable.
    deps.ledger.append({
      ts: confirmedAt,
      type: 'payout_confirmed',
      key: p.idempotencyKey,
      runId,
      contractorId: p.contractorId,
      txHash,
    });
    deps.store.update(p.contractorId, { lastPaidAt: confirmedAt });
    deps.ledger.markTerminal(p.idempotencyKey);
    receiptStatus = 'confirmed';
  } else if (status === 'failed') {
    deps.ledger.append({
      ts: now.toISOString(),
      type: 'payout_failed',
      key: p.idempotencyKey,
      runId,
      txHash,
    });
    receiptStatus = 'failed';
  } else {
    receiptStatus = 'submitted';
  }

  return {
    payoutId: p.payoutId,
    runId,
    contractorId: p.contractorId,
    contractorName,
    to: p.to,
    amountUsdc: p.amountUsdc,
    units: p.units.toString(),
    memo: p.memo,
    txHash,
    status: receiptStatus,
    arcscanUrl: txUrl(txHash),
    submittedAt,
    confirmedAt,
  };
}

/**
 * SINGLE-OWNER: acquire the lock, plan the due run, and submit-and-confirm each
 * payout exactly once. Returns early with `reason: 'locked'` if the lock is held.
 */
export async function runDueNow(deps: RunDueDeps): Promise<RunResult> {
  const now = deps.now ?? new Date();
  const poll = deps.poll ?? ((hash: string) => pollTxStatus(arcProvider(), hash));

  if (!deps.lock.acquire()) {
    return { runId: deps.runId ?? defaultRunId(now), receipts: [], reason: 'locked' };
  }

  try {
    const plan = planDueRun({
      contractors: deps.store.list(),
      now,
      runId: deps.runId,
      hasConfirmedThisPeriod: (contractorId, at) =>
        hasConfirmedThisPeriod(deps.ledger, deps.store.get(contractorId), at),
    });
    const { runId } = plan;
    deps.ledger.append({
      ts: now.toISOString(),
      type: 'run_planned',
      key: runKey(runId),
      runId,
      count: plan.payouts.length,
    });

    const receipts: Receipt[] = [];
    try {
      for (const p of plan.payouts) {
        const receipt = await processPayout(deps, runId, p, now, poll);
        if (receipt) receipts.push(receipt);
      }
      deps.ledger.append({
        ts: now.toISOString(),
        type: 'run_succeeded',
        key: runKey(runId),
        runId,
        paid: receipts.length,
      });
      return { runId, receipts };
    } catch (err) {
      deps.ledger.append({
        ts: now.toISOString(),
        type: 'run_failed',
        key: runKey(runId),
        runId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  } finally {
    deps.lock.release();
  }
}
