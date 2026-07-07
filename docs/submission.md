# Hackathon submission pack — arc-payout-agent

> Prepared 2026-07-07. Everything below is copy-paste-ready; human-gated steps are marked.

## Targets

| Hackathon | Track | Deadline | Fit |
|---|---|---|---|
| **Encode — Programmable Money on Arc** (primary) | Payments & Treasury | build Jul 13 → Aug 23, demo day Aug 20 | "Global treasury dashboards / stablecoin payment APIs" — direct match. Existing projects explicitly encouraged. |
| **Ignyte — Stablecoins Commerce Stack** (stretch) | Track 1: Best Cross-Border Payments & Remittances (1st 5000 / 2nd 3000 USDC) | **2026-07-13** | "Global payroll / contractor payouts with stablecoin settlement and receipts" is a listed example — strongest possible track fit, but deployed URL + video due Jul 13. |

## Submission copy

**Title:** Arc Payout Agent — recurring USDC contractor payouts with double-pay-proof settlement

**Short description:** Recurring contractor payroll on Arc testnet: a deterministic
planner decides who is due (weekly/monthly with correct month-end clamping), a
single-owner runner pays each contractor exactly once, and an append-only ledger
records every step. Write-ahead submit markers plus terminal markers make a
double-pay impossible even across crashes — the property payroll rails actually
need. Next.js operator dashboard; every payout links to Arcscan.

**Circle products used on Arc:** USDC, Arc testnet (chainId 5042002), Circle
faucet; Circle Wallets (production custody path via `makeSigner` →
`CircleWalletsSigner`).

**Repo:** https://github.com/sskys18/arc-payout-agent (private — flip public at submission)

**Tests:** 43 passing (33 @arc/core + 10 @arc/payout), incl. crash-at-terminal-marker
and pending-reconciliation double-pay proofs.

## Architecture diagram

```
            ┌──────────────────────────────────────────────────┐
            │           Next.js dashboard (app/)               │
            │  wallet status · contractors CRUD (validated)    │
            │  upcoming run · "Run due now" · payout history   │
            └───────────────┬──────────────────────────────────┘
                            │ API routes (400 on bad input)
            ┌───────────────▼──────────────────────────────────┐
            │          @arc/payout — payout domain             │
            │  contractor store (weekly/monthly cadence)       │
            │  planDueRun: deterministic due-set + total       │
            │  runDueNow: single-owner runner                  │
            │   · write-ahead submit marker                    │
            │   · pending reconciliation (never 2 broadcasts)  │
            │   · terminal marker per (contractor, period)     │
            │   · crash-safe: no double-pay across run ids     │
            └───────────────┬──────────────────────────────────┘
                            │
            ┌───────────────▼──────────────────────────────────┐
            │          @arc/core — shared primitives           │
            │  6-dec USDC amounts · cadence/nextDue clamping   │
            │  payoutKey/runKey · append-only ledger           │
            │  tx engine · arcscan URLs · signer ladder:       │
            │   CircleWalletsSigner → EOA dev → mock (labeled) │
            └───────────────┬──────────────────────────────────┘
                            │ ethers / JSON-RPC
            ┌───────────────▼──────────────────────────────────┐
            │  Arc testnet (5042002) — USDC is gas             │
            │  rpc.testnet.arc.network · testnet.arcscan.app   │
            └──────────────────────────────────────────────────┘
```

## Circle Product Feedback (required section for Ignyte)

**Why these products:** payroll wants dollar-denominated, predictable fees and
receipts. USDC-as-gas on Arc removes the "keep a volatile gas token funded"
operational hazard entirely; Circle Wallets is the right custody for an
org-controlled payout wallet.

**What worked well:** standard EVM tooling (ethers) worked unchanged; 6-decimal
USDC amount math is simple; Arcscan links give contractors a human-readable
receipt; sub-second settlement makes "Run due now" feel synchronous.

**What could be improved:** Circle Wallets access still requires manual API-key
provisioning — sandbox keys at signup would let hackathon demos run real custody
instead of a labeled mock signer. A native "batch transfer" primitive (or
Multicall guidance in the Arc docs) would cut N contractor payouts to one tx.

**Recommendation:** issue sandbox Wallets credentials automatically for testnet,
and document a canonical batch-payout pattern.

## Remaining steps (human-gated)

1. Register on Encode (encodeclub.com, jcs25822@gmail.com); Ignyte account + Circle Developer Account if going for the Jul 13 track.
2. Circle Wallets API key (or dev EOA) + fund testnet USDC via faucet.circle.com (manual faucet policy).
3. Deploy to Vercel (root `app`); mock mode needs no env.
4. Flip repo public.
5. Record the 3-minute video: add → run → receipt → rerun shows idempotency (nothing re-pays).
