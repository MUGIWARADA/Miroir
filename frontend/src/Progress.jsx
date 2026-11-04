import { useEffect, useState } from 'react';
import { api } from './api';

const TREND_STYLES = {
  improving: 'text-adherence-followed',
  declining: 'text-adherence-broken',
  flat: 'text-text-secondary',
};

export default function Progress() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchProgress = async () => {
      try {
        const response = await api.getProgress();
        setData(response.progress.versions[0] || null);
      } catch (err) {
        setError(err?.message || 'Could not load progress.');
      } finally {
        setLoading(false);
      }
    };
    fetchProgress();
  }, []);

  if (loading) return <div className="p-8 text-text-primary">Loading...</div>;
  if (error) return <div className="p-8 text-adherence-broken">{error}</div>;

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto text-text-primary pb-24">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mb-2">Your Progress</h1>
        <p className="text-sm text-text-secondary">DEMO WORKSPACE · summaries use saved deterministic reviews.</p>
      </div>

      {!data ? (
        <div className="glass-card p-6 text-sm text-text-secondary">
          No reviewed trades are available for this strategy version yet. Record a trade to begin.
        </div>
      ) : (
        <div className="space-y-6">
          <section className="glass-card p-4 md:p-6">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
              <div>
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-secondary mb-2">
                  Average Decision Quality
                </h2>
                <p className="text-4xl font-bold tracking-tight tabular-nums">
                  {data.average_decision_quality_score === null
                    ? '—'
                    : Math.round(data.average_decision_quality_score)}
                  <span className="text-lg text-text-tertiary font-normal"> / 100</span>
                </p>
                <p className="text-xs text-text-secondary mt-2">
                  {data.reviewed_trades} reviewed · {data.assessed_trades} assessed · {data.unassessed_trades} unassessed
                </p>
              </div>

              <div className="md:text-right">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-secondary mb-2">
                  Evidence Coverage
                </h2>
                <p className="text-2xl font-semibold tabular-nums">
                  {data.average_coverage_pct === null
                    ? '—'
                    : `${Math.round(data.average_coverage_pct)}%`}
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-xl bg-[#0B0F19]/50 border border-border-subtle p-4">
              <h3 className="text-sm font-semibold mb-1">Observed trend</h3>
              {data.trend.eligible ? (
                <p className={`text-sm ${TREND_STYLES[data.trend.direction] || 'text-text-secondary'}`}>
                  {data.trend.direction[0].toUpperCase() + data.trend.direction.slice(1)} · {data.trend.slope_per_trade.toFixed(3)} score points per trade · {data.trend.sample_size} assessed trades
                </p>
              ) : (
                <p className="text-sm text-text-secondary">
                  {data.trend.reason || 'A trend is not available for this sample yet.'}
                  {' '}Current assessed sample: {data.trend.sample_size ?? data.assessed_trades}.
                </p>
              )}
            </div>
          </section>

          <section className="glass-card p-4 md:p-6">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-secondary flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-[16px] text-brand-primary">target</span>
              Dimension Status
            </h2>
            <p className="text-[11px] text-text-tertiary mb-5">
              F = followed · B = broken · U = cannot assess (missing evidence is not scored as a breach)
            </p>

            <div className="space-y-3">
              {Object.entries(data.dimension_counts || {}).map(([dimension, counts]) => (
                <div key={dimension} className="flex flex-row justify-between items-center bg-[#0B0F19]/30 p-3 rounded-lg border border-border-subtle/50">
                  <span className="capitalize text-sm font-medium text-text-primary">{dimension.replaceAll('_', ' ')}</span>
                  <div className="flex gap-1.5">
                    {counts.followed > 0 && (
                      <span className="text-[10px] md:text-xs font-medium text-adherence-followed bg-adherence-followed/10 px-2 py-1 rounded border border-adherence-followed/20">
                        {counts.followed} F
                      </span>
                    )}
                    {counts.broken > 0 && (
                      <span className="text-[10px] md:text-xs font-medium text-adherence-broken bg-adherence-broken/10 px-2 py-1 rounded border border-adherence-broken/20">
                        {counts.broken} B
                      </span>
                    )}
                    {counts.cannot_assess > 0 && (
                      <span className="text-[10px] md:text-xs font-medium text-adherence-indeterminate bg-adherence-indeterminate/10 px-2 py-1 rounded border border-adherence-indeterminate/20">
                        {counts.cannot_assess} U
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
