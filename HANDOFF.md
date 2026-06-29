# Handoff: Arc Payout Agent (Stablecoins Commerce Stack, Ignyte Track 1)

Status: local build complete and verified. 43 tests pass (33 `@arc/core` + 10
`@arc/payout`), `next build` succeeds, and the dashboard runs locally against a
labeled mock signer. The repo is pushed to a private GitHub repo under `sskys18`.
The steps below still need you, because they need credentials, accounts, or a genuine
submission decision. They were intentionally left for a human.

## What's built

- `@arc/core` (`packages/core`, shared primitives vendored in): cadence/due
  planner inputs, USDC amount normalization, append-only ledger with durable terminal
  markers, idempotency keys, arcscan URL builder, ethers Arc tx engine, and the Circle
  Wallets interface with a labeled EOA fallback. 33 tests.
- `@arc/payout` (`packages/payout`): contractor store, the pure `planDueRun`, and the
  single-owner idempotent `runDueNow` (write-ahead submit marker, pending-tx
  reconciliation, retry on throw, confirmed-before-terminal ordering, cross-period
  guard). The result is no double-pay. 10 tests.
- `app`: Next.js dashboard with wallet status, contractor CRUD, upcoming run, Run due
  now, and payout history with Arcscan links. Runs with no secrets via a badged mock
  signer.
- Docs: `README.md`, `.env.example` (placeholders), `docs/demo-script.md`,
  `docs/production-path.md`.

## Steps that need you

| # | Step | Why it needs a human | Maps to |
|---|------|----------------------|---------|
| 1 | Decide repo visibility for submission. The tree is already pushed private to `sskys18/arc-payout-agent`; flip it to public if the Ignyte submission link must be public. | your account/decision | AC6 |
| 2 | Get Circle Wallets API access, create an Arc-testnet wallet, set `CIRCLE_API_KEY` / `CIRCLE_WALLET_ID` (this switches `makeSigner` off the mock). | credentialed | AC1, AC3 |
| 3 | Fund the wallet with testnet USDC via https://faucet.circle.com | manual | AC1 |
| 4 | (stretch) Deploy `PayoutMemoRouter` for an on-chain memo, or keep the direct-transfer MVP. | decision | AC4 |
| 5 | Gate mutation routes behind `ADMIN_SECRET` / SSO before any non-mock deploy. | security decision | pre-prod |
| 6 | Deploy to Vercel (root `app`) plus a Postgres for the durable store. | your account | AC6 |
| 7 | Record the 3-minute demo video. | human | AC7 |
| 8 | Register on Ignyte and submit before about Jul 13. | your decision | submission |

## Acceptance criteria status

- AC1 wallet funded via Circle Wallets: code ready, needs steps 2 and 3.
- AC2 add/edit contractors: done (UI plus validation).
- AC3 run-due autonomous payouts, no per-payment signing: done against the mock; a real
  signer needs step 2.
- AC4 on-chain receipt, ledger, arcscan: done (off-chain memo MVP; on-chain memo is the
  step 4 stretch).
- AC5 payout history persists and is auditable: done (append-only ledger).
- AC6 deployed and repo link: needs steps 1 and 6.
- AC7 3-minute video names the Circle tools: needs step 7.

## Demo beats (docs/demo-script.md)

problem, solution, live add contractors, Run due now, autonomous USDC payouts, receipts
plus arcscan, why Arc-native (USDC settlement, predictable fees, deterministic finality,
Circle Wallets), then the path to production (CCTP, Gateway, pay-in-AED).

## Run locally now

```
git clone https://github.com/sskys18/arc-payout-agent.git
cd arc-payout-agent
npm install && npm run dev
# open the printed localhost URL; click "Run due now"
npm test   # 43 tests (33 core + 10 payout)
```
