// Payout receipt shapes returned by the runner. A receipt is the user-facing record
// of one contractor payout within a run: what was sent, where, the on-chain tx and
// its explorer link, and the lifecycle status.

export type PayoutStatus = 'planned' | 'submitted' | 'confirmed' | 'failed';

export type Receipt = {
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
