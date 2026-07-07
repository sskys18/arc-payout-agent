# Pitch script — arc-payout-agent (3 minutes, works as text pitch or narration)

> Usable as-is for a written submission pitch; timing marks are for an optional
> future recording. Demo target: https://arc-payout-agent.vercel.app

## 0:00–0:20 — Problem

Paying global contractors is a monthly ritual of spreadsheets, wire fees, and
"did we already pay this one?" Payroll's real requirement isn't speed - it's
EXACTLY-ONCE. A missed payout is bad; a double payout is worse and usually
unrecoverable.

## 0:20–0:45 — Why Arc

USDC on Arc gives dollar-denominated payouts with deterministic fees and
sub-second finality, and because USDC is the gas token there is no "ops wallet
ran out of ETH" failure mode. The contractor gets a human-readable receipt: an
Arcscan link.

## 0:45–1:50 — Live demo (arc-payout-agent.vercel.app)

1. Wallet status: payout address, Arc Testnet 5042002, USDC balance, honest
   MOCK SIGNER badge - zero secrets in demo mode.
2. Contractors: Ava Stone, 500 USDC weekly; Liang Wei, 1200 monthly. Add one
   live - a bad address or negative amount is rejected with a 400. Cadence math
   handles month-end clamping (Jan 31 → Feb 28/29) correctly.
3. Upcoming run: 2 due, 1700 USDC total. This is the deterministic planner -
   same inputs, same plan, every time.
4. Run due now. Two confirmed receipts appear with tx hashes and Arcscan links.
5. The money shot: click Run due now AGAIN. Zero receipts. Terminal markers per
   (contractor, period) short-circuit the rerun. We tested the ugly cases: a
   crash BETWEEN the transfer and the marker write still cannot double-pay,
   because the write-ahead submit marker is reconciled first. 43 tests.

## 1:50–2:25 — Architecture (35 seconds)

`@arc/core` holds the shared machinery: 6-decimal USDC amount math, cadence,
idempotency keys, an append-only ledger, the tx engine, and a signer ladder -
Circle Programmable Wallets for production custody, a dev EOA for testnet, a
labeled mock for demos. `@arc/payout` is the domain: contractor store,
deterministic planner, single-owner runner. The dashboard is Next.js and talks
to the domain through validated API routes.

## 2:25–2:45 — Path to production

Swap the in-memory ledger for the JSON-file or DB ledger, set CIRCLE_API_KEY
to move custody to Circle Wallets, gate mutations with ADMIN_SECRET. The
exactly-once machinery - the hard part - is already done and tested.

## 2:45–3:00 — Close

Recurring USDC payroll with provably-once settlement and receipts your
contractors can actually read. arc-payout-agent - repo, tests, and live demo
linked in the submission.

---

### One-paragraph text pitch (for forms with a description box)

arc-payout-agent is recurring contractor payroll on Arc testnet built around
one guarantee: each contractor is paid exactly once per period, even across
crashes. A deterministic planner computes who is due (weekly/monthly with
correct month-end clamping), a single-owner runner executes with write-ahead
submit markers + pending reconciliation + per-period terminal markers, and an
append-only ledger rebuilds the full payout history with Arcscan receipt links.
43 tests cover the failure modes that matter, including crash-at-terminal-marker
and rerun-while-pending. Custody is a ladder: Circle Programmable Wallets in
production, dev EOA on testnet, labeled mock for the zero-secret demo. Arc's
USDC-as-gas removes the classic "payout wallet has funds but no gas" outage.
Live demo: https://arc-payout-agent.vercel.app · Repo:
https://github.com/sskys18/arc-payout-agent
