import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from './api';

export default function Profile() {
  const navigate = useNavigate();
  const [hasIdentity, setHasIdentity] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const identityExists = localStorage.getItem('miroir_identity_created') === 'true';
    setHasIdentity(identityExists);

    if (identityExists) {
      const fetchProgress = async () => {
        try {
          const response = await api.getProgress();
          if (response.progress.versions.length > 0) {
            setData(response.progress.versions[0]);
          } else {
            setData({ assessed_trades: 0, trend: { eligible: false } });
          }
        } catch (err) {
          console.error(err);
        } finally {
          setLoading(false);
        }
      };
      fetchProgress();
    } else {
      setLoading(false);
    }
  }, []);

  if (!hasIdentity) {
    return (
      <div className="p-4 md:p-8 max-w-5xl mx-auto text-text-primary pb-24 flex items-center justify-center min-h-[70vh]">
        <div className="glass-card p-12 text-center flex flex-col items-center max-w-md w-full relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-brand-primary/10 rounded-full blur-3xl pointer-events-none"></div>
          <div className="w-24 h-24 rounded-full bg-surface-elevated border border-border-subtle flex items-center justify-center mb-6 relative z-10">
            <span className="material-symbols-outlined text-5xl text-text-tertiary">person_add</span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2 relative z-10">Guest Profile</h1>
          <p className="text-sm text-text-secondary mb-8 relative z-10">You haven't created your Miroir Identity yet. Connect a trading account to generate your unique profile and start auditing your trades.</p>
          <button onClick={() => navigate('/accounts')} className="w-full px-6 py-3.5 rounded-xl bg-gradient-to-r from-brand-primary to-brand-secondary text-white font-semibold shadow-lg shadow-brand-primary/25 hover:opacity-90 transition-all flex items-center justify-center gap-2 relative z-10">
            <span className="material-symbols-outlined text-[20px]">add_link</span>
            Connect Account
          </button>
        </div>
      </div>
    );
  }

  if (loading) return <div className="p-8 text-text-primary flex h-screen items-center justify-center">Loading...</div>;

  const mockUser = { display_name: "Demo Trader", id: "c7549069-4957-4436-b281-19837edd6a3e" };
  const shortId = mockUser.id ? `${mockUser.id.slice(0, 8)}...${mockUser.id.slice(-4)}` : '...';

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto text-text-primary pb-24">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mb-1">Profile</h1>
        <p className="text-sm text-text-secondary">Your Miroir Identity and long-term progress.</p>
      </div>

      <div className="glass-card p-6 mb-6 flex flex-col md:flex-row items-start md:items-center gap-6 relative overflow-hidden">
        <div className="absolute -right-10 -top-10 w-40 h-40 bg-brand-primary/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-primary to-brand-secondary flex items-center justify-center shrink-0 shadow-lg shadow-brand-primary/30">
          <span className="material-symbols-outlined text-white text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>person</span>
        </div>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-white mb-1">{mockUser.display_name}</h2>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-md bg-surface-elevated border border-border-subtle text-[10px] font-mono text-text-secondary uppercase tracking-wider">
              Miroir ID: {shortId}
            </span>
            <span className="px-2.5 py-1 rounded-md bg-adherence-followed/10 border border-adherence-followed/20 text-[10px] font-bold text-adherence-followed uppercase tracking-wider">
              Verified
            </span>
          </div>
        </div>
      </div>

      {data && (
        <div className="glass-card p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-secondary flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px] text-brand-primary">monitoring</span>
              Decision Quality Trajectory
            </h2>
            <span className="px-2.5 py-1 rounded-sm text-[10px] uppercase font-bold tracking-widest bg-surface-elevated border border-border-subtle text-text-secondary">
              {data.assessed_trades} Assessed
            </span>
          </div>
          
          {data.trend.eligible ? (
            <div className="h-64 w-full">
               <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={[{ week: 'W1', score: 60 }, { week: 'W2', score: 65 }, { week: 'W3', score: 72 }, { week: 'W4', score: 78 }]} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="week" stroke="rgba(255,255,255,0.1)" tick={{fill: '#94A3B8', fontSize: 12}} axisLine={false} tickLine={false} />
                  <YAxis stroke="rgba(255,255,255,0.1)" tick={{fill: '#94A3B8', fontSize: 12}} axisLine={false} tickLine={false} domain={[0, 100]} />
                  <Tooltip contentStyle={{ backgroundColor: '#1E293B', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} />
                  <Area type="monotone" dataKey="score" stroke="#8B5CF6" strokeWidth={3} fillOpacity={1} fill="url(#colorScore)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-56 flex flex-col items-center justify-center bg-[#0B0F19]/50 border border-dashed border-border-subtle rounded-xl">
              <span className="material-symbols-outlined text-4xl text-text-tertiary mb-3">query_stats</span>
              <h3 className="text-sm font-semibold text-white mb-1">Not Enough Data</h3>
              <p className="text-xs text-text-secondary text-center max-w-sm px-4">
                The backend requires at least 5 assessed trades to unlock trend insights. You currently have {data.assessed_trades}.
              </p>
              <div className="mt-4 w-48 h-1.5 bg-surface-elevated rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-brand-primary to-brand-secondary" style={{ width: `${Math.min(100, (data.assessed_trades / 5) * 100)}%` }}></div>
              </div>
            </div>
          )}

          {data.dimension_counts && (
            <div className="mt-8 pt-6 border-t border-border-subtle">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-secondary mb-4">Dimension Status</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {Object.entries(data.dimension_counts).map(([dim, counts]) => (
                  <div key={dim} className="bg-[#0B0F19]/50 p-3 rounded-lg border border-border-subtle flex flex-col items-center text-center">
                    <span className="text-[10px] text-text-secondary uppercase tracking-wider mb-2">{dim}</span>
                    <div className="flex gap-2">
                       {counts.followed > 0 && <span className="text-xs font-bold text-adherence-followed">{counts.followed}F</span>}
                       {counts.broken > 0 && <span className="text-xs font-bold text-adherence-broken">{counts.broken}B</span>}
                       {counts.cannot_assess > 0 && <span className="text-xs font-bold text-adherence-indeterminate">{counts.cannot_assess}U</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}