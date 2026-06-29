# arc-payout-agent

Recurring **USDC contractor payouts on Arc testnet** — a deterministic-planner +
single-owner-runner + append-only-ledger agent, wrapped in a Next.js operator
dashboard. The reusable `@arc/core` package provides amounts, cadence, idempotency,
ledger, tx engine, and signer abstractions; the `app` workspace is the UI.

The dashboard runs **locally with zero secrets**: with no Circle/RPC credentials it
selects a deterministic **mock signer** (fake-but-valid tx hashes, instantly
"confirmed") so the full add → run → receipt → Arcscan-link flow works without a
live Arc RPC or Circle API key.

---

## What it does

- **Wallet status** — payout address (from the signer), chain (Arc Testnet,
  chainId 5042002), USDC balance (mock value in demo mode), faucet link.
- **Contractors** — add / edit / deactivate / reactivate. Strict validation
  (real EVM address, positive USDC amount, `weekly`|`monthly` cadence); bad input
  returns HTTP 400.
- **Upcoming run** — the deterministically planned set of due contractors and the
  total USDC about to be sent.
- **Run due now** — single-owner runner: plans the due payouts, submits-and-confirms
  each exactly once (terminal markers + write-ahead submit markers make double-pay
  impossible), writes the append-only ledger.
- **Payout history** — every payout reconstructed from the ledger: name, amount,
  memo, status, tx hash, and an **Arcscan explorer link**
  (`https://testnet.arcscan.app/tx/<hash>`).

## Local setup

Requirements: Node 22, npm 10.

```bash
npm install          # installs all workspaces (core + dashboard)
npm run dev          # starts the Next.js dashboard (delegates to the `app` workspace)
```

Open the printed URL (default **http://localhost:3000**). To use a different port:

```bash
npm run dev -w app -- -p 4311      # http://localhost:4311
```

Production build / serve:

```bash
npm run build        # next build
npm run start        # next start  (serves the production build)
```

Core unit tests (unchanged by the dashboard):

```bash
npm test             # 43 @arc/core tests via node --test
```

## Environment variables

Copy `.env.example` to `.env` only if you want to run against the real testnet.
**With no variables set, the app uses the mock signer and makes no network calls.**

| Variable           | Purpose                                                              |
| ------------------ | ------------------------------------------------------------------- |
| `CIRCLE_API_KEY`   | If set, use the Circle Programmable Wallets signer (production path).|
| `CIRCLE_WALLET_ID` | Circle wallet holding the payout funds.                             |
| `ARC_RPC_URL`      | Arc testnet JSON-RPC (default `https://rpc.testnet.arc.network`).   |
| `USDC_ADDRESS`     | USDC token contract on Arc testnet.                                 |
| `EOA_PRIVATE_KEY`  | Dev-only EOA fallback signer key (never real funds).                |
| `DATABASE_URL`     | Durable storage if you replace the in-memory store/ledger.          |
| `ADMIN_SECRET`     | Shared secret to gate mutation routes in a real deployment.         |

Signer selection: `CIRCLE_API_KEY` → Circle; else `EOA_PRIVATE_KEY` → EOA fallback;
else → **mock**.

## Funding via faucet

For a real run, fund the payout wallet with **testnet USDC** from the
[Circle faucet](https://faucet.circle.com), then set `CIRCLE_API_KEY` (or
`EOA_PRIVATE_KEY`) and `USDC_ADDRESS`. In mock mode the balance is a fixed demo
number and no funding is needed.

## Deploy to Vercel

1. Push this repo to GitHub.
2. In Vercel, **New Project** → import the repo.
3. Set the **Root Directory** to `app` (the Next.js project).
4. Build command `next build`, output handled automatically.
5. Add env vars from `.env.example` as needed (omit them to keep mock mode).
6. Deploy.

> The demo uses an in-memory store/ledger, so state resets on each cold start /
> serverless instance — fine for a demo, see *Path to production* below for durable
> storage.

## 3-minute demo flow

1. **Wallet status** card shows the payout address, Arc Testnet (5042002), a USDC
   balance, and a faucet link — `MOCK SIGNER` badge confirms zero-secret mode.
2. **Contractors** are pre-seeded (Ava Stone — 500 weekly; Liang Wei — 1200 monthly),
   both due now. Add another contractor live to show validation.
3. **Upcoming run** shows 2 due, total 1700 USDC.
4. Click **Run due now** → two confirmed receipts appear.
5. **Payout history** now lists each payout with status `confirmed`, tx hash, and an
   **Arcscan ↗** link that opens `https://testnet.arcscan.app/tx/<hash>`.
6. Click **Run due now** again → nothing re-pays (idempotent: terminal markers).

See [`docs/demo-script.md`](docs/demo-script.md) for the narrated beat sheet.

## Circle / Arc tools used

- **Arc testnet** — chainId `5042002`, RPC `https://rpc.testnet.arc.network`,
  explorer `https://testnet.arcscan.app`.
- **Circle Programmable Wallets** — intended production custody (`makeSigner` →
  `CircleWalletsSigner`), stubbed until API credentials are wired.
- **EOA fallback signer** — local dev signer (`ethers` raw EOA) for real-chain dev.
- **USDC** — 6-decimal ERC-20 transfers via `@arc/core` amount/tx primitives.
- **Circle faucet** — testnet USDC funding.

## Accepted MVP limits

- In-memory store + ledger (resets on restart); swap for `JsonFileLedger` /
  `DATABASE_URL` for durability.
- In-process lock (single Node process); a real multi-instance deployment needs a
  distributed lock.
- Mock signer produces deterministic fake tx hashes — Arcscan links are well-formed
  but resolve to nothing on mock data; use the real signer for on-chain txs.
- Circle Wallets signer is a stub pending API credentials.
- No auth on mutation routes (demo); gate with `ADMIN_SECRET` before real use.

## Layout

```
arc-payout-agent/
  packages/core/      @arc/core — payout engine (43 tests)
  app/                Next.js (App Router, TS) dashboard
  docs/               demo script + production path
  .env.example        env template (placeholders only)
```
