import { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, RadialBarChart, RadialBar, PolarAngleAxis } from 'recharts';
import { api } from './api';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsData, progressData] = await Promise.all([api.getStats('USD'), api.getProgress()]);
        setStats(statsData.stats);
        setProgress(progressData.progress.versions.length > 0 ? progressData.progress.versions[0] : { average_decision_quality_score: null, average_coverage_pct: null });
      } catch (err) {
        setError(err?.message || 'Could not load dashboard data.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) return <div className="p-8 text-text-primary flex h-screen items-center justify-center">Loading...</div>;
  if (error || !stats || !progress) return <div className="p-8 text-adherence-broken">{error || 'Dashboard data is unavailable.'}</div>;

  const pnlData = stats.cumulative_realized_pnl_curve.map(point => ({
    date: new Date(point.closed_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    pnl: point.cumulative_realized_pnl
  }));
  if (pnlData.length === 0) pnlData.push({ date: 'Today', pnl: 0 });

  const dqScore = progress.average_decision_quality_score === null
    ? null
    : Math.round(progress.average_decision_quality_score);
  const scoreData = [{ name: 'Score', value: dqScore ?? 0, fill: 'url(#gradient)' }];

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto text-text-primary pb-24">
      
      <header className="mb-8">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mb-1">Dashboard</h1>
        <p className="text-sm text-text-secondary">DEMO WORKSPACE · seeded sample trades and your manual entries</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="glass-card p-6 relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-brand-primary/20 rounded-full blur-3xl pointer-events-none"></div>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-secondary mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] text-brand-primary">psychology</span>
            Decision Quality
          </h2>
          <div className="flex items-center gap-6 relative z-10">
            <div className="w-28 h-28 relative">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart cx="50%" cy="50%" innerRadius="75%" outerRadius="100%" barSize={12} data={scoreData} startAngle={90} endAngle={-270}>
                  <defs>
                    <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#3B82F6" />
                      <stop offset="100%" stopColor="#8B5CF6" />
                    </linearGradient>
                  </defs>
                  <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                  <RadialBar background={{ fill: 'rgba(255,255,255,0.05)' }} dataKey="value" cornerRadius={10} />
                </RadialBarChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold tracking-tight tabular-nums">{dqScore === null ? '—' : dqScore}</span>
              </div>
            </div>
            <div>
              <div className={`font-semibold text-sm mb-1 flex items-center gap-1 ${dqScore === null ? 'text-text-secondary' : dqScore >= 75 ? 'text-adherence-followed' : dqScore >= 50 ? 'text-adherence-indeterminate' : 'text-adherence-broken'}`}>
                {dqScore === null ? 'Not assessed' : dqScore >= 75 ? 'Disciplined' : dqScore >= 50 ? 'Improving' : 'Needs Work'}
              </div>
              <p className="text-xs text-text-secondary leading-relaxed">{dqScore === null ? 'No reviews available yet.' : 'Keep logging evidence.'}</p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 glass-card p-6">
          <div className="flex justify-between items-center mb-5">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-secondary">Performance</h2>
            <span className="text-[10px] text-text-tertiary">Sample Size: {stats.sample_size}</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p className="text-xs text-text-secondary mb-1">Net P&L</p>
              <p className={`text-xl font-bold tabular-nums ${stats.net_realized_pnl >= 0 ? 'text-text-primary' : 'text-adherence-broken'}`}>${stats.net_realized_pnl.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-text-secondary mb-1">Win Rate</p>
              <p className="text-xl font-bold tabular-nums">{stats.win_rate === null ? '—' : `${stats.win_rate.toFixed(1)}%`}</p>
            </div>
            <div>
              <p className="text-xs text-text-secondary mb-1">Profit Factor</p>
              <p className="text-xl font-bold tabular-nums">{stats.profit_factor === null ? '—' : stats.profit_factor.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-text-secondary mb-1">Expectancy</p>
              <p className="text-xl font-bold tabular-nums">{stats.expectancy === null ? '—' : `$${stats.expectancy.toFixed(2)}`}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 glass-card p-6">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-secondary mb-6 flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] text-brand-secondary">trending_up</span>
            Cumulative Realized P&L
          </h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={pnlData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorPnl" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" stroke="rgba(255,255,255,0.1)" tick={{fill: '#94A3B8', fontSize: 10}} axisLine={false} tickLine={false} />
                <YAxis stroke="rgba(255,255,255,0.1)" tick={{fill: '#94A3B8', fontSize: 10}} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#1E293B', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} />
                <Area type="monotone" dataKey="pnl" stroke="#8B5CF6" strokeWidth={2} fillOpacity={1} fill="url(#colorPnl)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-5 glass-card p-6 flex flex-col justify-between">
          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-secondary mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px] text-brand-tertiary">monitoring</span>
              Progress Snapshot
            </h2>
            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <span className="text-sm text-text-secondary">Avg Quality Score</span>
                <span className="text-2xl font-bold tabular-nums">{progress.average_decision_quality_score === null ? '—' : Math.round(progress.average_decision_quality_score)}</span>
              </div>
              <div className="flex justify-between items-end">
                <span className="text-sm text-text-secondary">Coverage</span>
                <span className="text-sm font-semibold">{progress.average_coverage_pct === null ? '—' : `${Math.round(progress.average_coverage_pct)}%`}</span>
              </div>
              <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                <div className="h-full bg-brand-tertiary" style={{ width: `${progress.average_coverage_pct || 0}%` }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}