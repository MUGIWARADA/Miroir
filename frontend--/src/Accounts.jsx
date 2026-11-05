import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from './api';

const dateLabel = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
};

export default function Accounts() {
  const navigate = useNavigate();
  const [identity, setIdentity] = useState(null);
  const [status, setStatus] = useState(null);
  const [balances, setBalances] = useState(null);
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadStatus = useCallback(async () => {
    const [identityData, statusData] = await Promise.all([api.getIdentity(), api.getRoqquStatus()]);
    setIdentity(identityData.identity);
    setStatus(statusData);
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([api.getIdentity(), api.getRoqquStatus()])
      .then(([identityData, statusData]) => {
        if (!active) return;
        setIdentity(identityData.identity);
        setStatus(statusData);
      })
      .catch((err) => { if (active) setError(err?.message || 'Could not load account status.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const isSample = Boolean(status?.sample_data);
  const isLiveConnected = Boolean(status?.connected && status?.enabled && !isSample);
  const canConnect = Boolean(status?.connectable);
  const hasAccountAccess = isSample || isLiveConnected;

  const handleConnect = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      await api.connectRoqqu();
      await loadStatus();
      setShowModal(false);
      setNotice('Roqqu is linked to this verified Miroir identity. Reads are on-demand and read-only.');
    } catch (err) { setError(err?.message || 'Could not link this Roqqu identity.'); }
    finally { setBusy(false); }
  };

  const handleRefresh = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const [balanceData, historyData] = await Promise.all([api.getRoqquBalances(), api.getRoqquHistory()]);
      setBalances(balanceData);
      setHistory(historyData);
      setNotice(balanceData?.sample_data || historyData?.sample_data ? 'Sample data only — no live Roqqu account was queried.' : 'Read-only account data refreshed. Ledger history is not imported as trades.');
    } catch (err) { setError(err?.message || 'Could not refresh read-only account data.'); }
    finally { setBusy(false); }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Disconnect Roqqu from this Miroir identity? This does not change anything in Roqqu.')) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await api.disconnectRoqqu();
      setBalances(null); setHistory(null);
      await loadStatus();
      setNotice('Roqqu has been disconnected from this Miroir identity.');
    } catch (err) { setError(err?.message || 'Could not disconnect Roqqu.'); }
    finally { setBusy(false); }
  };

  const balanceObject = balances?.balance && typeof balances.balance === 'object' ? balances.balance : null;
  const balanceRows = balanceObject ? Object.entries(balanceObject).filter(([key, value]) => key !== 'updated_at' && (typeof value === 'string' || typeof value === 'number')) : [];
  const historyRows = Array.isArray(history?.history) ? history.history : Array.isArray(history?.data) ? history.data : [];

  if (loading) return <div className="p-8 text-text-primary flex min-h-[40vh] items-center justify-center">Loading accounts…</div>;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto text-text-primary pb-24 relative">
      <div className="flex flex-row items-center mb-8 gap-4">
        <button onClick={() => navigate('/profile')} className="w-10 h-10 rounded-full bg-surface-elevated border border-border-subtle flex items-center justify-center hover:text-brand-primary transition-colors" aria-label="Back to profile"><span className="material-symbols-outlined">arrow_back</span></button>
        <div><h1 className="text-2xl md:text-3xl font-semibold tracking-tight mb-1 text-white">Accounts</h1><p className="text-sm text-text-secondary hidden md:block">Roqqu account reads are read-only and refreshed on demand.</p></div>
      </div>

      {error && <div role="alert" className="glass-card border border-adherence-broken/30 p-4 mb-4 text-sm text-adherence-broken">{error}</div>}
      {notice && <div role="status" className="glass-card border border-brand-primary/30 p-4 mb-4 text-sm text-text-primary">{notice}</div>}

      {hasAccountAccess ? (
        <div className="glass-card p-6">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-surface-elevated border border-border-subtle flex items-center justify-center"><span className="material-symbols-outlined text-brand-primary text-2xl">bolt</span></div>
              <div>
                <h2 className="text-lg font-semibold text-white">Roqqu RAS</h2>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <span className={`w-2 h-2 rounded-full ${isSample ? 'bg-adherence-indeterminate' : 'bg-adherence-followed'}`} />
                  <span className={`text-xs font-medium ${isSample ? 'text-adherence-indeterminate' : 'text-adherence-followed'}`}>{isSample ? 'Sample data' : 'Connected · read-only'}</span>
                  {status?.mode && <span className="text-[10px] uppercase tracking-wider text-text-tertiary">{status.mode}</span>}
                </div>
                {identity?.email && <p className="text-xs text-text-tertiary mt-1">Verified identity: {identity.email}</p>}
              </div>
            </div>
            <div className="flex gap-2">
              {!isSample && isLiveConnected && <button onClick={handleDisconnect} disabled={busy} className="px-3 py-2 rounded-lg border border-border-subtle text-xs text-text-secondary hover:text-adherence-broken hover:border-adherence-broken/40 disabled:opacity-50">Disconnect</button>}
              <button onClick={handleRefresh} disabled={busy} className="px-4 py-2 rounded-lg bg-brand-primary text-white text-xs font-semibold hover:bg-blue-600 disabled:opacity-50 flex items-center gap-2"><span className={`material-symbols-outlined text-[16px] ${busy ? 'animate-spin' : ''}`}>{busy ? 'progress_activity' : 'refresh'}</span>{busy ? 'Working…' : 'Refresh data'}</button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-border-subtle">
            {balanceRows.length ? balanceRows.map(([asset, amount]) => <div key={asset} className="bg-surface-elevated rounded-xl p-4 border border-border-subtle"><p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">{asset}</p><p className="text-lg font-semibold text-white tabular-nums">{Number(amount).toLocaleString(undefined, { maximumFractionDigits: 8 })}</p></div>) : <div className="md:col-span-3 text-sm text-text-secondary">Balance data has not been requested yet. Choose <b>Refresh data</b> to make an on-demand read.</div>}
          </div>
          {balances && <p className="text-[10px] text-text-tertiary mt-3">Last updated: {dateLabel(balanceObject?.updated_at || balances.updated_at || balances.timestamp)}</p>}

          {history && <div className="mt-6 pt-5 border-t border-border-subtle">
            <div className="flex items-center justify-between mb-3"><h3 className="text-sm font-semibold text-white">Roqqu ledger activity</h3><span className="text-[10px] text-text-tertiary">Read-only · not trades</span></div>
            {historyRows.length === 0 ? <p className="text-sm text-text-secondary">No ledger entries returned.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-text-tertiary"><tr><th className="py-2 pr-4 font-medium">Asset</th><th className="py-2 pr-4 font-medium">Direction</th><th className="py-2 pr-4 font-medium">Amount</th><th className="py-2 font-medium">Date</th></tr></thead><tbody className="divide-y divide-border-subtle">{historyRows.map((row, index) => <tr key={row.id || `${row.token || 'row'}-${index}`} className="text-text-secondary"><td className="py-3 pr-4 uppercase">{row.token || row.asset || '—'}</td><td className="py-3 pr-4 capitalize">{row.direction || '—'}</td><td className="py-3 pr-4 tabular-nums">{row.amount ?? '—'}</td><td className="py-3">{dateLabel(row.created_at || row.timestamp)}</td></tr>)}</tbody></table></div>}
          </div>}
        </div>
      ) : (
        <div className="glass-card p-12 text-center flex flex-col items-center justify-center min-h-[360px]">
          <div className="w-20 h-20 rounded-full bg-surface-elevated border border-border-subtle flex items-center justify-center mb-6"><span className="material-symbols-outlined text-4xl text-text-tertiary">link_off</span></div>
          <h2 className="text-xl font-semibold mb-2 text-white">No Roqqu identity linked</h2>
          <p className="text-sm text-text-secondary max-w-md mx-auto mb-6">{status?.auth_required ? 'Sign in with a verified Miroir account before linking a live Roqqu identity. Demo access remains separate.' : status?.configured === false ? 'Roqqu staging is not configured on the backend. No live read will be attempted.' : 'Link a verified Roqqu identity for on-demand, read-only balance and ledger reads.'}</p>
          {canConnect ? <button onClick={() => setShowModal(true)} className="px-8 py-3 rounded-xl bg-brand-primary text-white font-semibold hover:bg-blue-600 transition-all flex items-center gap-2"><span className="material-symbols-outlined text-[20px]">add_link</span>Connect Roqqu</button> : status?.auth_required ? <button onClick={() => navigate('/')} className="px-6 py-2.5 rounded-lg bg-brand-primary text-white font-semibold">Return to sign in</button> : null}
        </div>
      )}

      {showModal && <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
        <div className="w-full max-w-md glass-card p-6 shadow-2xl relative">
          <button onClick={() => setShowModal(false)} className="absolute top-4 right-4 text-text-tertiary hover:text-white" aria-label="Close"><span className="material-symbols-outlined">close</span></button>
          <div className="text-center mb-6 mt-2"><h2 className="text-xl font-semibold text-white mb-2">Connect Roqqu</h2><p className="text-sm text-text-secondary">This links only the verified email identity on your Miroir account. Miroir cannot trade or mutate wallet data.</p></div>
          <button onClick={handleConnect} disabled={busy || !canConnect} className="w-full p-4 rounded-xl bg-surface-elevated border border-brand-primary/50 hover:bg-surface-card transition-all flex items-center gap-4 disabled:opacity-50"><span className="w-12 h-12 rounded-full bg-surface-elevated flex items-center justify-center"><span className="material-symbols-outlined text-brand-primary">bolt</span></span><span className="text-left"><span className="block text-sm font-semibold text-white">Roqqu RAS</span><span className="block text-xs text-text-secondary">Read-only · verified email · on demand</span></span>{busy && <span className="material-symbols-outlined animate-spin ml-auto">progress_activity</span>}</button>
          <div className="grid grid-cols-3 gap-3 mt-3">{[['MetaTrader', 'account_balance'], ['Binance', 'currency_bitcoin'], ['WalletConnect', 'wallet']].map(([name, icon]) => <div key={name} aria-disabled="true" className="p-3 rounded-xl bg-surface-elevated border border-border-subtle opacity-50 flex flex-col items-center gap-2"><span className="material-symbols-outlined text-text-tertiary">{icon}</span><span className="text-[10px] text-text-secondary text-center">{name}<br />Coming soon</span></div>)}</div>
        </div>
      </div>}
    </div>
  );
}