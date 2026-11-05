import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from './api';

export default function Profile() {
  const navigate = useNavigate();
  const [identity, setIdentity] = useState(null);
  const [roqquStatus, setRoqquStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([api.getIdentity(), api.getRoqquStatus()])
      .then(([identityData, statusData]) => {
        if (!active) return;
        setIdentity(identityData.identity);
        setRoqquStatus(statusData);
      })
      .catch((err) => { if (active) setError(err?.message || 'Could not load your profile.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const handleLogout = async () => {
    setBusy(true);
    try { await api.logout(); } catch { api.clearSession(); }
    navigate('/', { replace: true });
  };

  const shortId = identity?.id ? `${identity.id.slice(0, 8)}…${identity.id.slice(-4)}` : '';
  const accountLabel = identity?.mode === 'demo' ? 'Demo sample data' : roqquStatus?.connected ? 'Roqqu connected · read-only' : 'No Roqqu account connected';

  if (loading) return <div className="p-8 text-text-primary flex min-h-[40vh] items-center justify-center">Loading profile…</div>;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto text-text-primary pb-24">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mb-1">Profile</h1>
        <p className="text-sm text-text-secondary">Your Miroir identity and connected tools.</p>
      </div>

      {error && <div role="alert" className="glass-card border border-adherence-indeterminate/30 p-4 mb-6 text-sm text-adherence-indeterminate">{error}</div>}

      {identity && <>
        <div className="glass-card p-6 mb-6 flex flex-col md:flex-row items-start md:items-center gap-6 relative overflow-hidden">
          <div className="absolute -right-10 -top-10 w-40 h-40 bg-brand-primary/10 rounded-full blur-3xl pointer-events-none" />
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-primary to-brand-secondary flex items-center justify-center shrink-0 shadow-lg shadow-brand-primary/30">
            <span className="material-symbols-outlined text-white text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>person</span>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-bold text-white mb-1">{identity.display_name || 'Miroir Trader'}</h2>
            {identity.email && <p className="text-sm text-text-secondary mb-2">{identity.email}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 rounded-md bg-surface-elevated border border-border-subtle text-[10px] font-mono text-text-secondary uppercase tracking-wider">Miroir ID: {shortId}</span>
              <span className="px-2.5 py-1 rounded-md bg-surface-elevated border border-border-subtle text-[10px] text-text-secondary uppercase tracking-wider">{identity.mode === 'demo' ? 'Demo' : 'Account'}</span>
              {identity.mode === 'user' && <span className={`px-2.5 py-1 rounded-md border text-[10px] uppercase tracking-wider ${identity.email_verified_at ? 'bg-adherence-followed/10 border-adherence-followed/20 text-adherence-followed' : 'bg-adherence-indeterminate/10 border-adherence-indeterminate/20 text-adherence-indeterminate'}`}>{identity.email_verified_at ? 'Email verified' : 'Email not verified'}</span>}
            </div>
          </div>
          <button onClick={handleLogout} disabled={busy} className="absolute top-4 right-4 md:static w-9 h-9 rounded-full bg-surface-elevated border border-border-subtle flex items-center justify-center text-text-secondary hover:text-white hover:border-brand-primary transition-all shrink-0 disabled:opacity-50" title="Sign out" aria-label="Sign out">
            <span className="material-symbols-outlined text-[18px]">logout</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button onClick={() => navigate('/plan')} className="glass-card p-6 text-left hover:border-brand-primary transition-all group">
            <div className="flex items-center gap-3 mb-2"><span className="material-symbols-outlined text-brand-primary">psychology</span><h3 className="text-lg font-semibold text-white group-hover:text-brand-primary transition-colors">Plan</h3></div>
            <p className="text-sm text-text-secondary">View your confirmed strategy and rules.</p>
          </button>
          <button onClick={() => navigate('/accounts')} className="glass-card p-6 text-left hover:border-brand-primary transition-all group">
            <div className="flex items-center gap-3 mb-2"><span className="material-symbols-outlined text-brand-primary">account_balance_wallet</span><h3 className="text-lg font-semibold text-white group-hover:text-brand-primary transition-colors">Accounts</h3></div>
            <p className="text-sm text-text-secondary">{accountLabel}</p>
          </button>
        </div>
      </>}

      {!identity && !error && <div className="glass-card p-12 text-center"><h2 className="text-xl font-semibold mb-2 text-white">Profile unavailable</h2><button onClick={() => navigate('/')} className="mt-4 px-6 py-2.5 rounded-lg bg-brand-primary text-white font-semibold">Return to sign in</button></div>}
    </div>
  );
}
