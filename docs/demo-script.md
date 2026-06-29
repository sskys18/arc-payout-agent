# 3-minute demo script — Arc Payout Agent

A tight, narrated walkthrough. Run `npm run dev` and open the dashboard first.

---

## 0:00 — Problem (20s)

> "Paying contractors in stablecoins is recurring, error-prone work: who's due,
> how much, did it actually send, and did we accidentally pay twice? Teams stitch
> this together with spreadsheets and manual transfers."

## 0:20 — Solution (25s)

> "arc-payout-agent is a recurring USDC payout agent on Arc. A **deterministic
> planner** decides exactly who's due, a **single-owner runner** sends each payout
> **exactly once** with double-pay protection, and an **append-only ledger** is the
> source of truth for history. Everything settles in USDC on Arc and is verifiable
> on Arcscan."

Point at the **Wallet status** card: payout address, **Arc Testnet (chainId 5042002)**,
USDC balance, faucet link, and the `MOCK SIGNER` badge — "this is running with zero
secrets against a mock chain path so you can see the whole flow instantly."

## 0:45 — Live: add a contractor (35s)

- Show the two seeded contractors: **Ava Stone — 500 USDC weekly**, **Liang Wei —
  1200 USDC monthly**, both due now.
- In the **Contractors** form, add one live, e.g. `Jane Dev / 0x90F7…b906 / 250 /
  weekly` → row appears.
- Briefly type a bad address to show **validation** rejects it (400) — "we never
  store junk; addresses are checksum-validated, amounts must be clean positive USDC."

## 1:20 — Live: run the payouts (35s)

- **Upcoming run** shows the due set and the **total** about to be sent.
- Click **Run due now**.
- Confirmed receipts flash in the banner; each contractor is paid once.

## 1:55 — Receipts + Arcscan (35s)

- Scroll to **Payout history**: each row shows name, amount, memo, status
  `confirmed`, the tx hash, and an **Arcscan ↗** link
  (`https://testnet.arcscan.app/tx/<hash>`).
- "On the real signer this is a live USDC transfer you can open on Arcscan; here the
  hash is deterministic mock data so the link is well-formed but empty."
- Click **Run due now** again → **nothing re-pays**. "Terminal markers + a
  write-ahead submit log make double-pay impossible, even across restarts."

## 2:30 — Why Arc-native (15s)

> "Arc is purpose-built for stablecoin payments — fast, cheap USDC settlement with a
> clean explorer. Pairing it with Circle Programmable Wallets gives compliant
> custody without holding raw keys."

## 2:45 — Path to production (15s)

> "Swap the mock signer for **Circle Programmable Wallets**, the in-memory ledger for
> a database, and add cross-chain payouts via **CCTP / Bridge Kit** and **Circle
> Gateway**, plus local-currency rails like **pay-in-AED**."

See [`production-path.md`](production-path.md).
