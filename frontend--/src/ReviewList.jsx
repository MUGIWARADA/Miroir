import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from './api';

function scoreOf(trade) {
  const value = trade?.review?.result?.decision_quality_score;
  return typeof value === 'number' ? Math.round(value) : null;
}

export default function ReviewsList() {
  const navigate = useNavigate();
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.getTrades()
      .then((data) => { if (active) setTrades(Array.isArray(data?.trades) ? data.trades : []); })
      .catch((err) => { if (active) setError(err?.message || 'Could not load trades and reviews.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  if (loading) return <div className="p-8 text-text-primary flex min-h-[40vh] items-center justify-center">Loading reviews…</div>;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto text-text-primary pb-24">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mb-1">Reviews</h1>
        <p className="text-sm text-text-secondary">Saved, deterministic reviews of your manually recorded trades.</p>
      </div>

      {error && <div role="alert" className="glass-card border border-adherence-indeterminate/30 p-4 mb-6 text-sm text-adherence-indeterminate">{error}</div>}

      {trades.length === 0 ? (
        <div className="glass-card p-12 text-center flex flex-col items-center justify-center min-h-[360px]">
          <span className="material-symbols-outlined text-5xl text-brand-primary mb-4">history_edu</span>
          <h2 className="text-xl font-semibold mb-2 text-white">No Trades to Review</h2>
          <p className="text-sm text-text-secondary max-w-md mx-auto mb-6">There are no trades saved for this identity yet. Roqqu ledger activity is never imported as canonical trades. Manual trade entry remains a separate workflow and is not present in this UI snapshot.</p>
          <button onClick={() => navigate('/plan')} className="px-6 py-2.5 rounded-lg bg-brand-primary text-white font-semibold shadow-lg hover:bg-blue-600 transition-all flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">psychology</span>View Strategy
          </button>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <div className="p-4 border-b border-border-subtle bg-[#0B0F19]/50 flex justify-between items-center">
            <h2 className="text-sm font-semibold text-white">Recent Audits</h2>
            <span className="text-xs text-text-tertiary">{trades.length} Trade{trades.length === 1 ? '' : 's'}</span>
          </div>
          <div className="divide-y divide-border-subtle">
            {trades.map((trade) => {
              const score = scoreOf(trade);
              const date = trade.closed_at || trade.opened_at || trade.created_at;
              const scoreStyle = score === null ? 'bg-surface-elevated text-text-secondary' : score >= 75 ? 'bg-adherence-followed/10 text-adherence-followed' : score >= 50 ? 'bg-adherence-indeterminate/10 text-adherence-indeterminate' : 'bg-adherence-broken/10 text-adherence-broken';
              return (
                <button type="button" key={trade.id} onClick={() => navigate(`/reviews/${trade.id}`)} className="w-full p-4 flex items-center justify-between text-left hover:bg-white/5 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm ${scoreStyle}`}>{score === null ? '—' : score}</div>
                    <div>
                      <p className="font-semibold text-white">{trade.symbol || 'Trade'} <span className="text-xs font-normal text-text-tertiary">{trade.direction ? `· ${trade.direction}` : ''}</span></p>
                      <p className="text-xs text-text-tertiary">{date ? new Date(date).toLocaleDateString() : 'Date unavailable'} · {trade.review ? 'Reviewed' : 'Review pending'}</p>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-text-tertiary">chevron_right</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
