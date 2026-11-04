import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api';

export default function ReviewHistory() {
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadTrades = async () => {
      try {
        const response = await api.getTrades({ limit: 100, offset: 0 });
        setTrades(response.items || []);
      } catch (err) {
        setError(err?.message || 'Could not load trades.');
      } finally {
        setLoading(false);
      }
    };
    loadTrades();
  }, []);

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto text-text-primary pb-24">
      <header className="mb-8">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mb-2">Trade Reviews</h1>
        <p className="text-sm text-text-secondary">DEMO WORKSPACE · seeded examples and your manually logged trades.</p>
      </header>

      {loading ? (
        <div className="text-sm text-text-secondary">Loading trades…</div>
      ) : error ? (
        <div className="glass-card p-4 text-sm text-adherence-broken">{error}</div>
      ) : trades.length === 0 ? (
        <div className="glass-card p-6 text-sm text-text-secondary">
          No trades yet. Log a trade to create its deterministic review.
        </div>
      ) : (
        <div className="space-y-3">
          {trades.map((trade) => (
            <article key={trade.id} className="glass-card p-4 md:p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold">{trade.symbol}</h2>
                  <span className={`text-[10px] uppercase font-bold tracking-wider ${trade.direction === 'long' ? 'text-adherence-followed' : 'text-adherence-broken'}`}>
                    {trade.direction}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-text-tertiary">
                    {trade.closed_at ? 'closed' : 'open'}
                  </span>
                </div>
                <p className="text-xs text-text-secondary mt-1">
                  Opened {new Date(trade.opened_at).toLocaleString()} · Qty {trade.quantity}
                </p>
              </div>
              <div className="flex items-center justify-between md:justify-end gap-5">
                <div className="md:text-right">
                  <p className="text-[10px] uppercase tracking-wider text-text-tertiary">Realized P&amp;L</p>
                  <p className="text-sm font-semibold tabular-nums">
                    {trade.realized_pnl === null
                      ? '—'
                      : `${trade.currency} ${Number(trade.realized_pnl).toFixed(2)}`}
                  </p>
                </div>
                <Link
                  to={`/review/${trade.id}`}
                  className="px-4 py-2 rounded-lg bg-brand-primary/15 border border-brand-primary/30 text-sm font-medium hover:bg-brand-primary/25 transition-colors"
                >
                  Review
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
