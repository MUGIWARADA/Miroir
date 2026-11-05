import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, RadialBarChart, RadialBar, PolarAngleAxis } from 'recharts';
import { api } from './api';

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [identity, setIdentity] = useState(null);
  const [accountStatus, setAccountStatus] = useState(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let active = true;
    const fetchData = async () => {
      try {
        const [identityData, statsData, progressData, statusData] = await Promise.all([
          api.getIdentity(), api.getStats('USD'), api.getProgress(), api.getRoqquStatus()
        ]);
        if (!active) return;
        setIdentity(identityData.identity);
        setStats(statsData.stats);
        setProgress(progressData?.progress?.versions?.[0] || null);
        setAccountStatus(statusData);
      } catch (err) {
        if (active) setLoadError(err?.message || 'Could not load dashboard data.');
      } finally { if (active) setLoading(false); }
    };
    fetchData();
    return () => { active = false; };
  }, []);

  if (loading) return <div className="p-8 text-text-primary flex h-screen items-center justify-center">Loading...</div>;

  const netPnl = stats?.net_realized_pnl || 0;
  const winRate = stats?.win_rate || 0;
  const profitFactor = stats?.profit_factor || 0;
  const expectancy = stats?.expectancy || 0;
  const sampleSize = stats?.sample_size || 0;
  
  const dqScore = progress?.average_decision_quality_score;
  const hasDqScore = dqScore !== null && dqScore !== undefined && sampleSize > 0;
  const displayDqScore = hasDqScore ? Math.round(dqScore) : 0;

  const pnlData = stats?.cumulative_realized_pnl_curve?.map(point => ({
    date: new Date(point.closed_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    pnl: point.cumulative_realized_pnl
  })) || [];
  if (pnlData.length === 0) pnlData.push({ date: 'Today', pnl: 0 });

  const scoreData = [{ name: 'Score', value: hasDqScore ? displayDqScore : 0, fill: 'url(#gradient)' }];

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto text-text-primary pb-24 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-brand-primary/5 rounded-full blur-[100px] pointer-events-none -z-10"></div>
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-brand-secondary/5 rounded-full blur-[100px] pointer-events-none -z-10"></div>

      <header className="flex flex-row justify-between items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-1 text-white">Dashboard</h1>
        </div>
        
        {identity?.mode === 'demo' ? (
          <span className="flex items-center gap-2 bg-surface-elevated border border-border-subtle px-4 py-2 rounded-full">
            <span className="w-2 h-2 rounded-full bg-adherence-indeterminate"></span>
            <span className="text-xs text-text-secondary">Sample Data</span>
          </span>
        ) : accountStatus?.connected ? (
          <button onClick={() => navigate('/accounts')} className="flex items-center gap-2 bg-surface-elevated border border-border-subtle px-4 py-2 rounded-full hover:border-brand-primary transition-all">
            <span className="w-2 h-2 rounded-full bg-adherence-followed"></span>
            <span className="text-xs text-text-secondary">Roqqu · Read-only</span>
          </button>
        ) : (
          <button onClick={() => navigate('/accounts')} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-primary to-brand-secondary text-white font-semibold text-sm shadow-lg shadow-brand-primary/25 hover:opacity-90 transition-all flex items-center gap-2 shrink-0">
            <span className="material-symbols-outlined text-[18px]">add_link</span>Accounts
          </button>
        )}
      </header>

      {loadError && <div role="alert" className="glass-card border border-adherence-indeterminate/30 p-4 mb-6 text-sm text-adherence-indeterminate">{loadError}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="glass-card p-6 relative overflow-hidden group hover:border-brand-primary/30 transition-colors">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-secondary mb-6 flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] text-brand-primary">psychology</span>
            Decision Quality
          </h2>
          <div className="flex items-center gap-6 relative z-10">
            <div className="w-28 h-28 relative">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart cx="50%" cy="50%" innerRadius="75%" outerRadius="100%" barSize={10} data={scoreData} startAngle={90} endAngle={-270}>
                  <defs>
                    <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#3B82F6" />
                      <stop offset="100%" stopColor="#8B5CF6" />
                    </linearGradient>
                  </defs>
                  <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                  <RadialBar background={{ fill: 'rgba(255,255,255,0.03)' }} dataKey="value" cornerRadius={10} />
                </RadialBarChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                {hasDqScore ? (
                  <>
                    <span className="text-3xl font-bold tracking-tight tabular-nums text-white">{displayDqScore}</span>
                    <span className="text-[10px] text-text-tertiary">/100</span>
                  </>
                ) : (
                  <span className="text-[10px] font-semibold text-text-secondary text-center px-2">No data</span>
                )}
              </div>
            </div>
            <div>
              <p className="text-xs text-text-secondary leading-relaxed max-w-[120px]">Keep logging evidence to build your score.</p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 glass-card p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-secondary flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px] text-brand-tertiary">analytics</span>
              Performance Metrics
            </h2>
            <span className="text-[10px] text-text-tertiary bg-[#0B0F19]/50 px-2 py-1 rounded border border-border-subtle">Trades: {sampleSize}</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-[#0B0F19]/40 rounded-xl p-4 border border-border-subtle/50">
              <p className="text-[10px] text-text-secondary mb-1 uppercase tracking-wider">Net P&L</p>
              <p className="text-xl font-bold tabular-nums text-white">${netPnl.toFixed(2)}</p>
            </div>
            <div className="bg-[#0B0F19]/40 rounded-xl p-4 border border-border-subtle/50">
              <p className="text-[10px] text-text-secondary mb-1 uppercase tracking-wider">Win Rate</p>
              <p className="text-xl font-bold tabular-nums text-white">{winRate.toFixed(1)}%</p>
            </div>
            <div className="bg-[#0B0F19]/40 rounded-xl p-4 border border-border-subtle/50">
              <p className="text-[10px] text-text-secondary mb-1 uppercase tracking-wider">Profit Factor</p>
              <p className="text-xl font-bold tabular-nums text-white">{profitFactor.toFixed(2)}</p>
            </div>
            <div className="bg-[#0B0F19]/40 rounded-xl p-4 border border-border-subtle/50">
              <p className="text-[10px] text-text-secondary mb-1 uppercase tracking-wider">Expectancy</p>
              <p className="text-xl font-bold tabular-nums text-white">${expectancy.toFixed(2)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 glass-card p-6 relative overflow-hidden">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-secondary mb-6 flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] text-brand-secondary">trending_up</span>
            Cumulative Realized P&L
          </h2>
          <div className="h-64 relative z-10">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={pnlData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorPnl" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" stroke="rgba(255,255,255,0.1)" tick={{fill: '#94A3B8', fontSize: 12}} axisLine={false} tickLine={false} />
                <YAxis stroke="rgba(255,255,255,0.1)" tick={{fill: '#94A3B8', fontSize: 12}} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#1E293B', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} />
                <Area type="monotone" dataKey="pnl" stroke="#8B5CF6" strokeWidth={3} fillOpacity={1} fill="url(#colorPnl)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-4 glass-card p-6 flex flex-col justify-between relative overflow-hidden">
          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-secondary mb-6 flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px] text-brand-tertiary">monitoring</span>
              Snapshot
            </h2>
            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <span className="text-xs text-text-secondary">Coverage</span>
                <span className="text-sm font-semibold text-white">{Math.round(progress?.average_coverage_pct || 0)}%</span>
              </div>
              <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                <div className="h-full bg-brand-tertiary" style={{ width: `${progress?.average_coverage_pct || 0}%` }}></div>
              </div>
            </div>
          </div>
          <div className="mt-8 pt-4 border-t border-border-subtle">
            <button onClick={() => navigate('/reviews')} className="w-full py-2.5 rounded-lg bg-surface-elevated border border-border-subtle text-xs font-semibold hover:border-brand-primary hover:text-brand-primary transition-all flex items-center justify-center gap-2">
              View All Reviews <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}