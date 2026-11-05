import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from './api';

export default function ReviewsList() {
  const navigate = useNavigate();
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulating fetching the list of trades that have been reviewed
    const fetchTrades = async () => {
      try {
        // In production: const response = await api.getTrades();
        // For now, we mock a list of trades from the backend
        setTimeout(() => {
          setTrades([
            { id: '1', symbol: 'BTC/USDT', date: '2026-11-05', score: 100, status: 'Reviewed' },
            { id: '2', symbol: 'ETH/USDT', date: '2026-11-04', score: 65, status: 'Reviewed' },
            { id: '3', symbol: 'SOL/USDT', date: '2026-11-03', score: 45, status: 'Reviewed' },
          ]);
          setLoading(false);
        }, 500);
      } catch (err) {
        setLoading(false);
      }
    };
    fetchTrades();
  }, []);

  if (loading) return <div className="p-8 text-text-primary">Loading reviews...</div>;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto text-text-primary pb-24">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mb-1">Trade Reviews</h1>
        <p className="text-sm text-text-secondary">Audit history for your connected accounts.</p>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="p-4 border-b border-border-subtle bg-[#0B0F19]/50 flex justify-between items-center">
          <h2 className="text-sm font-semibold text-white">Recent Audits</h2>
          <span className="text-xs text-text-tertiary">{trades.length} Total</span>
        </div>
        <div className="divide-y divide-border-subtle">
          {trades.map((trade) => (
            <div key={trade.id} className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors">
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm ${
                  trade.score >= 75 ? 'bg-adherence-followed/10 text-adherence-followed' : 
                  trade.score >= 50 ? 'bg-adherence-indeterminate/10 text-adherence-indeterminate' : 
                  'bg-adherence-broken/10 text-adherence-broken'
                }`}>
                  {trade.score}
                </div>
                <div>
                  <p className="font-semibold text-white">{trade.symbol}</p>
                  <p className="text-xs text-text-tertiary">{trade.date}</p>
                </div>
              </div>
              <button 
                onClick={() => navigate(`/reviews/${trade.id}`)}
                className="px-4 py-2 rounded-lg bg-surface-elevated border border-border-subtle text-xs font-medium hover:text-brand-primary hover:border-brand-primary transition-all flex items-center gap-2"
              >
                View Audit
                <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}