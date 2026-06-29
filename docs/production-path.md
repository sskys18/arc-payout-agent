# Path to production

The MVP is intentionally a single-chain, single-process, mock-friendly demo. Here is
the concrete path from demo to a production-grade contractor payout system.

## 1. Real custody — Circle Programmable Wallets

Today `makeSigner` returns the `EoaFallbackSigner` (raw EOA, dev only) or the
`CircleWalletsSigner` stub. Production:

- Wire `CircleWalletsSigner.submitUsdcTransfer` to the Circle Wallets API, using the
  payout's `idempotencyKey` as the Circle **idempotency key** (the API dedupes
  natively, complementing our ledger guards).
- Provision a developer-controlled wallet set; store `CIRCLE_API_KEY` /
  `CIRCLE_WALLET_ID` in a secrets manager, never in the repo.
- Replace the mock balance card with a real on-chain / Circle balance read.

## 2. Cross-chain payouts — CCTP & Bridge Kit

Contractors get paid where they want to receive funds:

- Use **CCTP (Cross-Chain Transfer Protocol)** to burn USDC on Arc and mint native
  USDC on the contractor's preferred chain (Ethereum, Base, Arbitrum, Solana, …) —
  no wrapped assets, 1:1.
- Use **Circle Bridge Kit** to abstract the burn/attestation/mint orchestration
  behind a single call, with status tracking that maps cleanly onto our existing
  ledger event model (`payout_submitted` → `payout_broadcast` → `payout_confirmed`).

## 3. Unified balances — Circle Gateway

- Hold a single USDC balance with **Circle Gateway** and spend it from any supported
  chain on demand, instead of pre-funding a wallet per chain.
- The planner stays chain-agnostic; the runner asks Gateway for instant cross-chain
  availability at send time.

## 4. Local-currency rails — pay-in-AED (and beyond)

- Let contractors denominate in **AED** (or other local currencies); convert
  on-ramp/off-ramp at payout time so the agent quotes and settles the FX leg, USDC
  remains the settlement rail under the hood.
- Surface the FX quote + rate in the receipt for auditability.

## 5. Durable, multi-instance operations

- **Storage**: replace `InMemoryContractorStore` / `InMemoryLedger` with a database
  (Postgres via `DATABASE_URL`) or `JsonFileLedger` for a single host. The ledger is
  already append-only and reconstructable.
- **Locking**: replace the in-process lock with a distributed lock (Postgres advisory
  lock / Redis) so only one runner owns a run across instances — the core runner
  already takes an external `lock` dependency.
- **Scheduling**: trigger `runDueNow` from a cron / queue (e.g. Vercel Cron) instead
  of a manual button.
- **Auth**: gate all mutation routes behind `ADMIN_SECRET` / SSO.
- **Confirmation**: in live mode the runner already polls the Arc provider for real
  receipt status; tune timeout/interval and add alerting on `failed`/`pending`.

## 6. Observability

- Emit metrics per run (planned, paid, failed, skipped) and per-payout latency.
- Persist receipts and expose an audit export; the Arcscan link per payout is already
  the human-verifiable anchor.
