# @arc/core

Shared primitives for the Arc testnet agents. The payout agent and the FX agent
both depend on this package as a git submodule mounted at `packages/core`, so the
code here stays domain-free: no payout logic, no FX logic, just the pieces both
agents need.

Arc testnet: chain id `5042002`, RPC `https://rpc.testnet.arc.network`, explorer
`https://testnet.arcscan.app`.

## Modules

- `amounts`: parse and format 6-decimal USDC/EURC values, reject bad input.
- `cadence`: weekly/monthly due-date math (`nextDue`, `isDue`) with month-end clamping.
- `arcscan`: build explorer URLs for a tx hash or address.
- `idempotency`: deterministic keys (`payoutKey`, `runKey`) plus the shared `esc`
  segment escaper, so the ledger's terminal markers never collide.
- `ledger`: append-only event log with durable terminal markers
  (`InMemoryLedger`, `JsonFileLedger`).
- `txEngine`: ethers provider for Arc, tx status polling, and `ARC_CHAIN_ID`.
- `circle`: signer interface with a labeled local EOA fallback.

Each module is exported on its own subpath, e.g. `import { parseUnits } from '@arc/core/amounts'`.

## Use

```
npm install
npm test    # node --test over the primitive suites
npm run build   # tsc --noEmit type check
```

## Repo

Private: `https://github.com/sskys18/arc-core`. Pulled into the agent repos as a
commit-pinned submodule, so a given agent build always sees an exact core revision.
The umbrella repo is `sskys18/arc-agents`.
