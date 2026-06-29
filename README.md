# arc-payout-agent

Recurring USDC contractor payouts on Arc testnet. The agent has three parts: a
deterministic planner that decides who is due, a single-owner runner that pays each
contractor exactly once, and an append-only ledger that records what happened. A
Next.js dashboard sits on top for operators.

Shared primitives (amounts, cadence, idempotency, ledger, tx engine, arcscan URLs,
signer abstraction) live in `@arc/core`, which this repo pulls in as a git submodule
at `packages/core`. The payout domain itself (contractor store, planner, runner) is
in the local `@arc/payout` package. The `app` workspace is the UI.

The dashboard runs locally with no secrets. With no Circle or RPC credentials set it
picks a mock signer that returns valid-looking, instantly-confirmed tx hashes, so the
whole add -> run -> receipt -> Arcscan-link flow works without a live Arc RPC or a
Circle API key.

## What it does

- Wallet status: payout address (from the signer), chain (Arc testnet, chainId
  5042002), USDC balance (a mock value in demo mode), and a faucet link.
- Contractors: add, edit, deactivate, reactivate. Input is validated (a real EVM
  address, a positive USDC amount, a `weekly` or `monthly` cadence); bad input returns
  HTTP 400.
- Upcoming run: the planned set of due contractors and the total USDC about to go out.
- Run due now: the single-owner runner plans the due payouts and submits-and-confirms
  each one exactly once. Write-ahead submit markers plus terminal markers make a
  double-pay impossible, and every step is written to the ledger.
- Payout history: each payout rebuilt from the ledger with name, amount, memo, status,
  tx hash, and an Arcscan link (`https://testnet.arcscan.app/tx/<hash>`).

## Local setup

Requirements: Node 22, npm 10.

Clone with submodules so `packages/core` is populated:

```bash
git clone --recursive https://github.com/sskys18/arc-payout-agent.git
# already cloned without --recursive?
git submodule update --init --recursive
```

Then:

```bash
npm install          # installs all workspaces (core submodule + payout + dashboard)
npm run dev          # starts the Next.js dashboard (the `app` workspace)
```

Open the printed URL (default http://localhost:3000). For a different port:

```bash
npm run dev -w app -- -p 4311      # http://localhost:4311
```

Production build and serve:

```bash
npm run build        # next build
npm run start        # next start
```

Unit tests:

```bash
npm test             # 43 tests: 33 @arc/core + 10 @arc/payout, via node --test
```

## Environment variables

Copy `.env.example` to `.env` only if you want to run against the real testnet. With
no variables set the app uses the mock signer and makes no network calls.

| Variable           | Purpose                                                              |
| ------------------ | ------------------------------------------------------------------- |
| `CIRCLE_API_KEY`   | If set, use the Circle Programmable Wallets signer (production path).|
| `CIRCLE_WALLET_ID` | Circle wallet holding the payout funds.                             |
| `ARC_RPC_URL`      | Arc testnet JSON-RPC (default `https://rpc.testnet.arc.network`).   |
| `USDC_ADDRESS`     | USDC token contract on Arc testnet.                                 |
| `EOA_PRIVATE_KEY`  | Dev-only EOA fallback signer key (never real funds).                |
| `DATABASE_URL`     | Durable storage if you replace the in-memory store/ledger.          |
| `ADMIN_SECRET`     | Shared secret to gate mutation routes in a real deployment.         |

Signer selection: `CIRCLE_API_KEY` picks Circle; otherwise `EOA_PRIVATE_KEY` picks the
EOA fallback; otherwise the mock signer.

## Funding via faucet

For a real run, fund the payout wallet with testnet USDC from the
[Circle faucet](https://faucet.circle.com), then set `CIRCLE_API_KEY` (or
`EOA_PRIVATE_KEY`) and `USDC_ADDRESS`. In mock mode the balance is a fixed demo number
and no funding is needed.

## Deploy to Vercel

1. Make sure the repo (and its `arc-core` submodule) is reachable by the deploy.
2. In Vercel, New Project, import the repo.
3. Set the Root Directory to `app`.
4. Build command `next build`; output is handled automatically.
5. Add env vars from `.env.example` as needed (omit them to keep mock mode).
6. Deploy.

The demo uses an in-memory store and ledger, so state resets on each cold start. That
is fine for a demo; see the production path below for durable storage.

## 3-minute demo flow

1. The Wallet status card shows the payout address, Arc testnet (5042002), a USDC
   balance, and a faucet link. A `MOCK SIGNER` badge confirms zero-secret mode.
2. Contractors are pre-seeded (Ava Stone, 500 weekly; Liang Wei, 1200 monthly), both
   due now. Add another contractor live to show validation.
3. Upcoming run shows 2 due, total 1700 USDC.
4. Click Run due now. Two confirmed receipts appear.
5. Payout history lists each payout with status `confirmed`, a tx hash, and an Arcscan
   link to `https://testnet.arcscan.app/tx/<hash>`.
6. Click Run due now again. Nothing re-pays, because the terminal markers short-circuit.

See [`docs/demo-script.md`](docs/demo-script.md) for the narrated version.

## Circle and Arc tools used

- Arc testnet: chainId `5042002`, RPC `https://rpc.testnet.arc.network`, explorer
  `https://testnet.arcscan.app`.
- Circle Programmable Wallets: the intended production custody (`makeSigner` returns
  `CircleWalletsSigner`), stubbed until API credentials are wired.
- EOA fallback signer: a local dev signer (raw `ethers` EOA) for real-chain dev work.
- USDC: 6-decimal ERC-20 transfers via the `@arc/core` amount and tx primitives.
- Circle faucet: testnet USDC funding.

## Accepted MVP limits

- In-memory store and ledger (reset on restart); swap for `JsonFileLedger` or
  `DATABASE_URL` for durability.
- In-process lock (single Node process); a multi-instance deployment needs a
  distributed lock.
- The mock signer produces deterministic fake tx hashes, so Arcscan links are
  well-formed but resolve to nothing on mock data. Use a real signer for on-chain txs.
- The Circle Wallets signer is a stub pending API credentials.
- No auth on mutation routes in the demo; gate with `ADMIN_SECRET` before real use.

## Layout

```
arc-payout-agent/
  packages/core/      @arc/core, a git submodule of sskys18/arc-core (33 primitive tests)
  packages/payout/    @arc/payout, the payout domain: store, planner, runner (10 tests)
  app/                Next.js (App Router, TS) dashboard
  docs/               demo script and production path
  .env.example        env template (placeholders only)
```
