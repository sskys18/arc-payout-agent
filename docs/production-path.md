# Path to production

The MVP is deliberately single-chain, single-process, and mock-friendly. Here is the
concrete path from that demo to a production contractor payout system.

## 1. Real custody with Circle Programmable Wallets

Today `makeSigner` returns the `EoaFallbackSigner` (raw EOA, dev only) or the
`CircleWalletsSigner` stub. For production:

- Wire `CircleWalletsSigner.submitUsdcTransfer` to the Circle Wallets API, using the
  payout's `idempotencyKey` as the Circle idempotency key. The API dedupes natively,
  which complements the ledger guards.
- Provision a developer-controlled wallet set; keep `CIRCLE_API_KEY` and
  `CIRCLE_WALLET_ID` in a secrets manager, never in the repo.
- Replace the mock balance card with a real on-chain or Circle balance read.

## 2. Cross-chain payouts with CCTP and Bridge Kit

Pay contractors on whatever chain they want to receive funds:

- Use CCTP (Cross-Chain Transfer Protocol) to burn USDC on Arc and mint native USDC on
  the contractor's chain (Ethereum, Base, Arbitrum, Solana, and so on). No wrapped
  assets, 1:1.
- Use Circle Bridge Kit to handle the burn, attestation, and mint behind a single call,
  with status that maps onto the existing ledger events (`payout_submitted`,
  `payout_broadcast`, `payout_confirmed`).

## 3. Unified balances with Circle Gateway

- Hold one USDC balance with Circle Gateway and spend it from any supported chain on
  demand, instead of pre-funding a wallet per chain.
- The planner stays chain-agnostic; the runner asks Gateway for cross-chain
  availability at send time.

## 4. Local-currency rails: pay-in-AED and beyond

- Let contractors denominate in AED or other local currencies; convert at payout time
  so the agent quotes and settles the FX leg while USDC stays the settlement rail.
- Show the FX quote and rate in the receipt for auditability.

## 5. Durable, multi-instance operations

- Storage: replace `InMemoryContractorStore` and `InMemoryLedger` with a database
  (Postgres via `DATABASE_URL`) or `JsonFileLedger` for a single host. The ledger is
  already append-only and reconstructable.
- Locking: replace the in-process lock with a distributed lock (a Postgres advisory
  lock or Redis) so only one runner owns a run across instances. The core runner
  already takes an external `lock` dependency.
- Scheduling: trigger `runDueNow` from a cron or queue (such as Vercel Cron) instead of
  a manual button.
- Auth: gate all mutation routes behind `ADMIN_SECRET` or SSO.
- Confirmation: in live mode the runner already polls the Arc provider for receipt
  status; tune the timeout and interval and add alerting on `failed` and `pending`.

## 6. Observability

- Emit metrics per run (planned, paid, failed, skipped) and per-payout latency.
- Persist receipts and expose an audit export. The Arcscan link per payout is already
  the human-verifiable anchor.
