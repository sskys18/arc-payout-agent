// Plain, serializable DTOs shared between server (route handlers / server
// components) and client components. These intentionally do NOT import from
// `@arc/core` so they can be bundled into the browser without pulling in node-only
// modules (node:fs, node:crypto, ethers). The server maps core types onto these.

export type Cadence = 'weekly' | 'monthly';

export type PayoutStatus = 'planned' | 'submitted' | 'confirmed' | 'failed';

export type ContractorDTO = {
  id: string;
  name: string;
  payoutAddress: string;
  amountUsdc: string;
  cadence: Cadence;
  lastPaidAt: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ReceiptDTO = {
  payoutId: string;
  runId: string;
  contractorId: string;
  contractorName: string;
  to: string;
  amountUsdc: string;
  units: string;
  memo: string;
  txHash: string | null;
  status: PayoutStatus;
  arcscanUrl: string | null;
  submittedAt: string | null;
  confirmedAt: string | null;
};

export type WalletInfo = {
  address: string;
  chainId: number;
  chainLabel: string;
  balanceUsdc: string;
  mode: 'mock' | 'live';
  faucetUrl: string;
  faucetNote: string;
  explorerUrl: string;
};

export type PlanPayoutDTO = {
  contractorId: string;
  contractorName: string;
  amountUsdc: string;
  to: string;
};

export type PlanInfo = {
  runId: string;
  count: number;
  totalUsdc: string;
  payouts: PlanPayoutDTO[];
};

export type RunResultDTO = {
  runId: string;
  receipts: ReceiptDTO[];
  reason?: string;
};

export type DashboardState = {
  wallet: WalletInfo;
  contractors: ContractorDTO[];
  plan: PlanInfo;
  history: ReceiptDTO[];
};
