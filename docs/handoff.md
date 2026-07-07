# Session Handoff

> Generated: 2026-07-06

## Task

Recurring USDC contractor payouts on Arc testnet: a deterministic planner decides who is due, a single-owner runner pays each contractor exactly once, and an append-only ledger records history, with a Next.js operator dashboard on top.

## Status

local build verified, 43 tests pass, pushed private to sskys18/arc-payout-agent

The dashboard also runs locally against a labeled mock signer and next build succeeds. The steps below were intentionally left for a human because they need credentials, accounts, or a real submission decision.

## Resume Here

1. Decide repo visibility for submission. The tree is pushed private to sskys18/arc-payout-agent; flip it to public if the Ignyte submission link must be public. (AC6)
2. Get Circle Wallets API access, create an Arc-testnet wallet, and set CIRCLE_API_KEY / CIRCLE_WALLET_ID; this switches makeSigner off the mock. (AC1, AC3)
3. Fund the wallet with testnet USDC via the Circle faucet at https://faucet.circle.com (AC1)
4. Optional stretch: deploy PayoutMemoRouter for an on-chain memo, or keep the direct-transfer MVP. (AC4)
5. Gate mutation routes behind ADMIN_SECRET / SSO before any non-mock deploy. (pre-prod)
6. Deploy to Vercel (root app) plus a Postgres for the durable store. (AC6)
7. Record the 3-minute demo video. (AC7)
8. Register on Ignyte and submit before about Jul 13. (submission)

## Decisions

- Single-owner idempotent runDueNow with a write-ahead submit marker and terminal markers, so double-pay is impossible even across restarts.
- Off-chain memo MVP now; the on-chain PayoutMemoRouter memo is a stretch (step 4).
- Mock signer is the default: with no Circle or EOA credentials set, makeSigner returns valid-looking, instantly-confirmed tx hashes so the whole add-run-receipt flow runs with no secrets.

## Gotchas

- Gate mutation routes behind ADMIN_SECRET (or SSO) before any non-mock deploy; the demo has no auth on mutation routes.

## Context

Branch main, clean tree. 43 tests pass (33 @arc/core + 10 @arc/payout via node --test) and next build succeeds; the repo is pushed private to sskys18/arc-payout-agent. Architecture, what is built, run-locally, env vars, and the demo beats already live in README.md. For the narrated walkthrough see docs/demo-script.md; for the production path (Circle Wallets, CCTP and Bridge Kit, Gateway, pay-in-AED, durable multi-instance ops) see docs/production-path.md. The full original handoff, including the acceptance-criteria status, is archived verbatim at docs/archive/root-HANDOFF-2026-07-06.md.
