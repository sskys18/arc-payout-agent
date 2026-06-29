'use client';

import { useCallback, useState } from 'react';
import type {
  Cadence,
  ContractorDTO,
  DashboardState,
  PlanInfo,
  ReceiptDTO,
  RunResultDTO,
  WalletInfo,
} from '@/lib/types';

function shortAddr(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error ?? `request failed (${res.status})`;
  } catch {
    return `request failed (${res.status})`;
  }
}

export function Dashboard({ initial }: { initial: DashboardState }) {
  const [state, setState] = useState<DashboardState>(initial);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ kind: 'ok' | 'info' | 'err'; text: string } | null>(null);
  const [lastRun, setLastRun] = useState<RunResultDTO | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/state', { cache: 'no-store' });
    if (res.ok) setState((await res.json()) as DashboardState);
  }, []);

  const runDue = useCallback(async () => {
    setBusy(true);
    setBanner(null);
    try {
      const res = await fetch('/api/run-due', { method: 'POST' });
      if (!res.ok) {
        setBanner({ kind: 'err', text: await readError(res) });
        return;
      }
      const result = (await res.json()) as RunResultDTO;
      setLastRun(result);
      await refresh();
      if (result.reason === 'locked') {
        setBanner({ kind: 'info', text: 'A run is already in progress (lock held).' });
      } else if (result.receipts.length === 0) {
        setBanner({ kind: 'info', text: `Run ${result.runId}: no contractors are due right now.` });
      } else {
        const confirmed = result.receipts.filter((r) => r.status === 'confirmed').length;
        setBanner({
          kind: 'ok',
          text: `Run ${result.runId}: ${confirmed}/${result.receipts.length} payout(s) confirmed. See payout history below.`,
        });
      }
    } catch (err) {
      setBanner({ kind: 'err', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const addContractor = useCallback(
    async (input: { name: string; payoutAddress: string; amountUsdc: string; cadence: Cadence }) => {
      setBusy(true);
      setBanner(null);
      try {
        const res = await fetch('/api/contractors', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(input),
        });
        if (!res.ok) {
          setBanner({ kind: 'err', text: await readError(res) });
          return false;
        }
        await refresh();
        setBanner({ kind: 'ok', text: `Added contractor "${input.name}".` });
        return true;
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const patchContractor = useCallback(
    async (id: string, patch: Partial<Pick<ContractorDTO, 'name' | 'amountUsdc' | 'cadence' | 'active'>>) => {
      setBusy(true);
      setBanner(null);
      try {
        const res = await fetch(`/api/contractors/${id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(patch),
        });
        if (!res.ok) {
          setBanner({ kind: 'err', text: await readError(res) });
          return false;
        }
        await refresh();
        return true;
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  return (
    <div className="grid">
      <WalletCard wallet={state.wallet} />
      <UpcomingRun plan={state.plan} busy={busy} onRun={runDue} banner={banner} lastRun={lastRun} />
      <ContractorSection
        contractors={state.contractors}
        busy={busy}
        onAdd={addContractor}
        onPatch={patchContractor}
      />
      <HistoryTable history={state.history} />
    </div>
  );
}

function WalletCard({ wallet }: { wallet: WalletInfo }) {
  return (
    <section className="card">
      <h2>
        Wallet status <span className={`pill ${wallet.mode}`}>{wallet.mode === 'mock' ? 'MOCK SIGNER' : 'LIVE SIGNER'}</span>
      </h2>
      <div className="wallet-grid">
        <div className="wallet-field">
          <div className="label">Payout address</div>
          <div className="value mono">
            <a href={wallet.explorerUrl} target="_blank" rel="noreferrer">
              {shortAddr(wallet.address)}
            </a>
          </div>
        </div>
        <div className="wallet-field">
          <div className="label">Network</div>
          <div className="value">{wallet.chainLabel}</div>
        </div>
        <div className="wallet-field">
          <div className="label">USDC balance</div>
          <div className="value">{wallet.balanceUsdc} USDC</div>
        </div>
      </div>
      <p className="note">
        {wallet.faucetNote}{' '}
        <a href={wallet.faucetUrl} target="_blank" rel="noreferrer">
          Open faucet ↗
        </a>
      </p>
    </section>
  );
}

function UpcomingRun({
  plan,
  busy,
  onRun,
  banner,
  lastRun,
}: {
  plan: PlanInfo;
  busy: boolean;
  onRun: () => void;
  banner: { kind: 'ok' | 'info' | 'err'; text: string } | null;
  lastRun: RunResultDTO | null;
}) {
  return (
    <section className="card">
      <h2>Upcoming run</h2>
      <div className="run-bar">
        <button className="primary" onClick={onRun} disabled={busy}>
          {busy ? 'Running…' : 'Run due now'}
        </button>
        <span className="run-summary">
          {plan.count === 0
            ? 'No contractors are due right now.'
            : `${plan.count} contractor(s) due · total ${plan.totalUsdc} USDC · run id ${plan.runId}`}
        </span>
      </div>

      {plan.count > 0 && (
        <table style={{ marginTop: 14 }}>
          <thead>
            <tr>
              <th>Contractor</th>
              <th>To</th>
              <th>Amount (USDC)</th>
            </tr>
          </thead>
          <tbody>
            {plan.payouts.map((p) => (
              <tr key={p.contractorId}>
                <td>{p.contractorName}</td>
                <td className="mono">{shortAddr(p.to)}</td>
                <td>{p.amountUsdc}</td>
              </tr>
            ))}
            <tr className="total-row">
              <td colSpan={2}>Total</td>
              <td>{plan.totalUsdc}</td>
            </tr>
          </tbody>
        </table>
      )}

      {banner && <div className={`banner ${banner.kind}`}>{banner.text}</div>}

      {lastRun && lastRun.receipts.length > 0 && (
        <div className="banner info" style={{ marginTop: 10 }}>
          Last run {lastRun.runId}:{' '}
          {lastRun.receipts.map((r, i) => (
            <span key={r.payoutId}>
              {i > 0 ? ', ' : ''}
              {r.contractorName} → {r.amountUsdc} USDC{' '}
              {r.arcscanUrl ? (
                <a href={r.arcscanUrl} target="_blank" rel="noreferrer">
                  (tx ↗)
                </a>
              ) : null}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function ContractorSection({
  contractors,
  busy,
  onAdd,
  onPatch,
}: {
  contractors: ContractorDTO[];
  busy: boolean;
  onAdd: (input: { name: string; payoutAddress: string; amountUsdc: string; cadence: Cadence }) => Promise<boolean>;
  onPatch: (
    id: string,
    patch: Partial<Pick<ContractorDTO, 'name' | 'amountUsdc' | 'cadence' | 'active'>>,
  ) => Promise<boolean>;
}) {
  const [name, setName] = useState('');
  const [payoutAddress, setPayoutAddress] = useState('');
  const [amountUsdc, setAmountUsdc] = useState('');
  const [cadence, setCadence] = useState<Cadence>('weekly');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await onAdd({ name, payoutAddress, amountUsdc, cadence });
    if (ok) {
      setName('');
      setPayoutAddress('');
      setAmountUsdc('');
      setCadence('weekly');
    }
  };

  return (
    <section className="card">
      <h2>Contractors</h2>
      <form className="row-form" onSubmit={submit}>
        <div className="field">
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Dev" required />
        </div>
        <div className="field">
          <label>Payout address</label>
          <input
            value={payoutAddress}
            onChange={(e) => setPayoutAddress(e.target.value)}
            placeholder="0x…"
            className="mono"
            required
          />
        </div>
        <div className="field">
          <label>Amount (USDC)</label>
          <input
            value={amountUsdc}
            onChange={(e) => setAmountUsdc(e.target.value)}
            placeholder="500"
            inputMode="decimal"
            required
          />
        </div>
        <div className="field">
          <label>Cadence</label>
          <select value={cadence} onChange={(e) => setCadence(e.target.value as Cadence)}>
            <option value="weekly">weekly</option>
            <option value="monthly">monthly</option>
          </select>
        </div>
        <button className="primary" type="submit" disabled={busy}>
          Add
        </button>
      </form>

      {contractors.length === 0 ? (
        <div className="empty">No contractors yet — add one above.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Address</th>
              <th>Amount</th>
              <th>Cadence</th>
              <th>Last paid</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {contractors.map((c) => (
              <ContractorRow key={c.id} contractor={c} busy={busy} onPatch={onPatch} />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function ContractorRow({
  contractor,
  busy,
  onPatch,
}: {
  contractor: ContractorDTO;
  busy: boolean;
  onPatch: (
    id: string,
    patch: Partial<Pick<ContractorDTO, 'name' | 'amountUsdc' | 'cadence' | 'active'>>,
  ) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(contractor.name);
  const [amountUsdc, setAmountUsdc] = useState(contractor.amountUsdc);
  const [cadence, setCadence] = useState<Cadence>(contractor.cadence);

  const save = async () => {
    const ok = await onPatch(contractor.id, { name, amountUsdc, cadence });
    if (ok) setEditing(false);
  };

  if (editing) {
    return (
      <tr>
        <td>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </td>
        <td className="mono">{shortAddr(contractor.payoutAddress)}</td>
        <td>
          <input value={amountUsdc} onChange={(e) => setAmountUsdc(e.target.value)} inputMode="decimal" />
        </td>
        <td>
          <select value={cadence} onChange={(e) => setCadence(e.target.value as Cadence)}>
            <option value="weekly">weekly</option>
            <option value="monthly">monthly</option>
          </select>
        </td>
        <td>{contractor.lastPaidAt ? contractor.lastPaidAt.slice(0, 10) : '—'}</td>
        <td>{contractor.active ? 'active' : 'inactive'}</td>
        <td style={{ whiteSpace: 'nowrap' }}>
          <button className="small primary" onClick={save} disabled={busy}>
            Save
          </button>{' '}
          <button className="small" onClick={() => setEditing(false)} disabled={busy}>
            Cancel
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr className={contractor.active ? undefined : 'inactive-row'}>
      <td>{contractor.name}</td>
      <td className="mono">{shortAddr(contractor.payoutAddress)}</td>
      <td>{contractor.amountUsdc} USDC</td>
      <td>{contractor.cadence}</td>
      <td>{contractor.lastPaidAt ? contractor.lastPaidAt.slice(0, 10) : '—'}</td>
      <td>{contractor.active ? 'active' : 'inactive'}</td>
      <td style={{ whiteSpace: 'nowrap' }}>
        <button className="small" onClick={() => setEditing(true)} disabled={busy}>
          Edit
        </button>{' '}
        {contractor.active ? (
          <button className="small danger" onClick={() => onPatch(contractor.id, { active: false })} disabled={busy}>
            Deactivate
          </button>
        ) : (
          <button className="small" onClick={() => onPatch(contractor.id, { active: true })} disabled={busy}>
            Reactivate
          </button>
        )}
      </td>
    </tr>
  );
}

function HistoryTable({ history }: { history: ReceiptDTO[] }) {
  return (
    <section className="card">
      <h2>Payout history</h2>
      {history.length === 0 ? (
        <div className="empty">No payouts yet. Click “Run due now” to pay the due contractors.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Contractor</th>
              <th>Amount</th>
              <th>Memo</th>
              <th>Status</th>
              <th>Tx hash</th>
              <th>Explorer</th>
            </tr>
          </thead>
          <tbody>
            {history.map((r) => (
              <tr key={r.payoutId}>
                <td>{r.contractorName}</td>
                <td>{r.amountUsdc} USDC</td>
                <td className="mono">{r.memo}</td>
                <td>
                  <span className={`pill ${r.status}`}>{r.status}</span>
                </td>
                <td className="mono">{r.txHash ? shortAddr(r.txHash) : '—'}</td>
                <td>
                  {r.arcscanUrl ? (
                    <a href={r.arcscanUrl} target="_blank" rel="noreferrer">
                      Arcscan ↗
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
