// Server-side singleton wiring for the payout dashboard.
//
// Selects a signer at boot:
//   - MOCK PayoutSigner (deterministic fake txHash, always "confirmed") when no
//     real credentials are present — this is the zero-secrets local/demo path.
//   - the real `makeSigner` (Circle or EOA fallback) when CIRCLE_API_KEY or
//     EOA_PRIVATE_KEY is supplied.
//
// The store, ledger, signer and in-process lock are cached on `globalThis` so they
// survive Next.js dev hot-reloads and are shared across all route handlers and the
// server-rendered page within a single Node process.
import { InMemoryContractorStore } from '@arc/core/payout/store';
import { InMemoryLedger } from '@arc/core/ledger';
import { runDueNow, planDueRun } from '@arc/core/payout/agent';
import { makeSigner, type PayoutSigner } from '@arc/core/circle';
import { txUrl, addressUrl } from '@arc/core/arcscan';
import { formatUnits } from '@arc/core/amounts';
import { ARC_CHAIN_ID } from '@arc/core/txEngine';

import type {
  ContractorDTO,
  DashboardState,
  PayoutStatus,
  PlanInfo,
  ReceiptDTO,
  RunResultDTO,
  WalletInfo,
} from './types.ts';

// Deterministic demo wallet address used by the mock signer (display only — never
// validated as a checksum because no real tx is ever signed in mock mode).
const MOCK_WALLET_ADDRESS = '0xA11ce5C0FFEE0000000000000000000000000001';
// Placeholder USDC token address. Ignored by the mock signer; overridable via env
// for the real signer path.
const DEFAULT_USDC = '0x5fd84259d66Cd46123540766Be93DFE6D43130D7';
const MOCK_BALANCE_USDC = '10000.00';

/**
 * MOCK signer for the zero-secrets local path. Produces a deterministic, valid
 * 0x-hex "txHash" derived from the payout's idempotency key (which encodes the run
 * id + contractor id), so the same payout always maps to the same fake hash and the
 * Arcscan link is stable.
 */
class MockPayoutSigner implements PayoutSigner {
  constructor(private readonly addr: string) {}

  async address(): Promise<string> {
    return this.addr;
  }

  async submitUsdcTransfer(args: {
    usdc: string;
    to: string;
    units: bigint;
    idempotencyKey: string;
  }): Promise<{ txHash: string }> {
    const hex = Buffer.from(args.idempotencyKey, 'utf8').toString('hex');
    const txHash = `0x${(hex + '0'.repeat(64)).slice(0, 64)}`;
    return { txHash };
  }
}

type Lock = { acquire(): boolean; release(): void };

type Singleton = {
  store: InMemoryContractorStore;
  ledger: InMemoryLedger;
  signer: PayoutSigner;
  lock: Lock;
  mode: 'mock' | 'live';
  usdc: string;
};

const globalRef = globalThis as unknown as { __arcPayoutSingleton?: Singleton };

function buildSingleton(): Singleton {
  const store = new InMemoryContractorStore();
  const ledger = new InMemoryLedger();

  // Simple in-process mutual-exclusion lock (single Node process). The core
  // runner requires an external lock; the ledger's terminal markers are not one.
  let held = false;
  const lock: Lock = {
    acquire() {
      if (held) return false;
      held = true;
      return true;
    },
    release() {
      held = false;
    },
  };

  const usdc = process.env.USDC_ADDRESS || DEFAULT_USDC;

  let signer: PayoutSigner;
  let mode: 'mock' | 'live';
  if (process.env.CIRCLE_API_KEY || process.env.EOA_PRIVATE_KEY) {
    signer = makeSigner({
      CIRCLE_API_KEY: process.env.CIRCLE_API_KEY,
      CIRCLE_WALLET_ID: process.env.CIRCLE_WALLET_ID,
      EOA_PRIVATE_KEY: process.env.EOA_PRIVATE_KEY,
      RPC_URL: process.env.ARC_RPC_URL,
    });
    mode = 'live';
  } else {
    signer = new MockPayoutSigner(MOCK_WALLET_ADDRESS);
    mode = 'mock';
  }

  // Seed demo contractors (both due immediately: lastPaidAt = null) so the UI is
  // non-empty on first load and "Run due now" has work to do.
  store.add({
    name: 'Ava Stone',
    payoutAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    amountUsdc: '500',
    cadence: 'weekly',
  });
  store.add({
    name: 'Liang Wei',
    payoutAddress: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    amountUsdc: '1200',
    cadence: 'monthly',
  });

  return { store, ledger, signer, lock, mode, usdc };
}

export function agent(): Singleton {
  if (!globalRef.__arcPayoutSingleton) {
    globalRef.__arcPayoutSingleton = buildSingleton();
  }
  return globalRef.__arcPayoutSingleton;
}

function toContractorDTO(c: {
  id: string;
  name: string;
  payoutAddress: string;
  amountUsdc: string;
  cadence: 'weekly' | 'monthly';
  lastPaidAt: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}): ContractorDTO {
  return { ...c };
}

export function getContractors(): ContractorDTO[] {
  return agent().store.list().map(toContractorDTO);
}

export async function getWallet(): Promise<WalletInfo> {
  const s = agent();
  const address = await s.signer.address();
  return {
    address,
    chainId: ARC_CHAIN_ID,
    chainLabel: `Arc Testnet (chainId ${ARC_CHAIN_ID})`,
    balanceUsdc: s.mode === 'mock' ? MOCK_BALANCE_USDC : '—',
    mode: s.mode,
    faucetUrl: 'https://faucet.circle.com',
    faucetNote:
      s.mode === 'mock'
        ? 'Mock balance for the local demo (no on-chain calls). To run for real, fund this wallet with testnet USDC via the Circle faucet, then set CIRCLE_API_KEY or EOA_PRIVATE_KEY.'
        : 'Fund this wallet with testnet USDC via the Circle faucet before running payouts.',
    explorerUrl: addressUrl(address),
  };
}

export function getPlan(now: Date = new Date()): PlanInfo {
  const s = agent();
  const plan = planDueRun({ contractors: s.store.list(), now });
  const totalUnits = plan.payouts.reduce((acc, p) => acc + p.units, 0n);
  return {
    runId: plan.runId,
    count: plan.payouts.length,
    totalUsdc: formatUnits(totalUnits),
    payouts: plan.payouts.map((p) => ({
      contractorId: p.contractorId,
      contractorName: s.store.get(p.contractorId)?.name ?? p.contractorId,
      amountUsdc: p.amountUsdc,
      to: p.to,
    })),
  };
}

const asStr = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));

/** Reconstruct user-facing payout receipts from the append-only ledger. */
export function getHistory(): ReceiptDTO[] {
  const s = agent();
  type Acc = {
    runId: string;
    contractorId: string;
    to: string;
    units: string;
    memo: string;
    txHash: string | null;
    status: PayoutStatus;
    submittedAt: string | null;
    confirmedAt: string | null;
  };
  const byKey = new Map<string, Acc>();

  for (const e of s.ledger.all()) {
    const key = asStr(e.key);
    if (!key.startsWith('payout:')) continue;
    const acc: Acc =
      byKey.get(key) ??
      {
        runId: '',
        contractorId: '',
        to: '',
        units: '0',
        memo: '',
        txHash: null,
        status: 'submitted',
        submittedAt: null,
        confirmedAt: null,
      };

    switch (e.type) {
      case 'payout_submitted':
        acc.runId = asStr(e.runId);
        acc.contractorId = asStr(e.contractorId);
        acc.to = asStr(e.to);
        acc.units = asStr(e.units) || '0';
        acc.memo = asStr(e.memo);
        acc.submittedAt = asStr(e.ts);
        break;
      case 'payout_broadcast':
        acc.txHash = asStr(e.txHash) || null;
        break;
      case 'payout_confirmed':
        acc.status = 'confirmed';
        acc.txHash = asStr(e.txHash) || acc.txHash;
        acc.confirmedAt = asStr(e.ts);
        break;
      case 'payout_failed':
        acc.status = 'failed';
        acc.txHash = asStr(e.txHash) || acc.txHash;
        break;
      default:
        break;
    }
    byKey.set(key, acc);
  }

  const out: ReceiptDTO[] = [];
  for (const acc of byKey.values()) {
    const name = s.store.get(acc.contractorId)?.name ?? acc.contractorId;
    out.push({
      payoutId: `${acc.runId}:${acc.contractorId}`,
      runId: acc.runId,
      contractorId: acc.contractorId,
      contractorName: name,
      to: acc.to,
      amountUsdc: formatUnits(BigInt(acc.units || '0')),
      units: acc.units,
      memo: acc.memo,
      txHash: acc.txHash,
      status: acc.status,
      arcscanUrl: acc.txHash ? txUrl(acc.txHash) : null,
      submittedAt: acc.submittedAt,
      confirmedAt: acc.confirmedAt,
    });
  }
  // Newest first.
  out.sort((a, b) => (b.submittedAt ?? '').localeCompare(a.submittedAt ?? ''));
  return out;
}

export async function runDue(): Promise<RunResultDTO> {
  const s = agent();
  const res = await runDueNow({
    store: s.store,
    ledger: s.ledger,
    signer: s.signer,
    usdc: s.usdc,
    lock: s.lock,
    // In mock mode there is no chain to poll — treat every broadcast as confirmed.
    // In live mode, fall back to the core's real Arc provider poll.
    poll: s.mode === 'mock' ? async () => 'confirmed' as const : undefined,
  });
  return {
    runId: res.runId,
    reason: res.reason,
    receipts: res.receipts.map(
      (r): ReceiptDTO => ({
        payoutId: r.payoutId,
        runId: r.runId,
        contractorId: r.contractorId,
        contractorName: r.contractorName,
        to: r.to,
        amountUsdc: r.amountUsdc,
        units: r.units,
        memo: r.memo,
        txHash: r.txHash,
        status: r.status,
        arcscanUrl: r.arcscanUrl,
        submittedAt: r.submittedAt,
        confirmedAt: r.confirmedAt,
      }),
    ),
  };
}

export async function getState(): Promise<DashboardState> {
  return {
    wallet: await getWallet(),
    contractors: getContractors(),
    plan: getPlan(),
    history: getHistory(),
  };
}
