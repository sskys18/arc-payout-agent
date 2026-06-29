# HANDOFF — Arc Payout Agent (Stablecoins Commerce Stack, Ignyte Track 1)

Status: **local build complete & verified** (43 core tests pass, `next build` succeeds, dashboard runs locally against a labeled mock signer). The items below need **you** (credentials/accounts/genuine submission) — they were intentionally NOT done by the AI build.

## What's built (done)
- `packages/core` — deterministic cadence/due planner, USDC amount normalization, append-only ledger (durable terminal markers), idempotency, arcscan URL builder, ethers Arc tx-engine, Circle Wallets interface + labeled EOA fallback. 43 unit tests.
- Payout engine (`packages/core/src/payout`) — contractor store, pure `planDueRun`, single-owner idempotent `runDueNow` (write-ahead submit marker, pending-tx reconciliation, throw-retry, confirmed-before-terminal ordering, cross-period guard) → **no double-pay**.
- `app` — Next.js dashboard: wallet status, contractor CRUD, upcoming run, Run-due-now, payout history with Arcscan links. Runs with zero secrets via a badged mock signer.
- Docs: `README.md`, `.env.example` (placeholders), `docs/demo-script.md`, `docs/production-path.md`.

## Human-blocked steps (YOU do these)
| # | Step | Why human | Maps to |
|---|------|-----------|---------|
| 1 | Create a **public GitHub repo** and push this tree | your account | submission repo link (AC6) |
| 2 | Get **Circle Wallets API access** + create an Arc-testnet wallet; set `CIRCLE_API_KEY`/`CIRCLE_WALLET_ID` (`makeSigner` switches off the mock) | credentialed | AC1, AC3 |
| 3 | **Fund** the wallet with testnet USDC via https://faucet.circle.com | manual | AC1 |
| 4 | (stretch) Deploy `PayoutMemoRouter` for on-chain memo, or keep direct-transfer MVP | decision | AC4 (on-chain memo) |
| 5 | Gate mutation routes behind `ADMIN_SECRET`/SSO before any non-mock deploy | security decision | pre-prod |
| 6 | **Deploy** to Vercel (root = `app`) + a Postgres for durable store | your account | AC6 |
| 7 | Record the **3-min demo video** | human | AC7 |
| 8 | **Register on Ignyte** + **submit** before ~Jul 13 | your decision | submission |

## Acceptance criteria status
- AC1 wallet funded via Circle Wallets — **code ready**, needs steps 2-3
- AC2 add/edit contractors — **DONE** (UI + validation)
- AC3 Run-due autonomous payouts, no per-payment signing — **DONE vs mock**, real signer needs step 2
- AC4 on-chain receipt + ledger + arcscan — **DONE** (off-chain memo MVP; on-chain memo = step 4 stretch)
- AC5 payout history persists/auditable — **DONE** (append-only ledger)
- AC6 deployed + public repo — needs steps 1, 6
- AC7 3-min video names Circle tools — needs step 7

## Demo beats (docs/demo-script.md)
problem → solution → LIVE add contractors → Run due now → autonomous USDC payouts → receipts + arcscan → why Arc-native (USDC settlement, predictable fees, deterministic finality, Circle Wallets) → path to production (CCTP, Gateway, pay-in-AED).

## Run locally now
```
npm install && npm run dev
# open the printed localhost URL; click "Run due now"
npm test   # 43 core tests
```
