import { getState } from '@/lib/agent';
import { Dashboard } from '@/components/Dashboard';

// Always render against the live in-memory singleton, never a cached snapshot.
export const dynamic = 'force-dynamic';

export default async function Page() {
  const initial = await getState();
  return (
    <main className="wrap">
      <header className="app-header">
        <h1>Arc Payout Agent</h1>
        <p>Recurring USDC contractor payouts on Arc testnet — deterministic planner, single-owner runner, append-only ledger.</p>
      </header>
      <Dashboard initial={initial} />
    </main>
  );
}
