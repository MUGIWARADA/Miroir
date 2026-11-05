import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function ReviewsList() {
  const navigate = useNavigate();
  const [isConnected, setIsConnected] = useState(false);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const linked = localStorage.getItem('account_linked') === 'true';
    setIsConnected(linked);

    if (linked) {
      setTimeout(() => {
        setReviews([
          { id: 'c8cbdf44-f849-4a3d-8b5a-1a2f7e5083d4', symbol: 'BTC/USDT', date: '2026-11-05', score: 100 },
          { id: '2', symbol: 'ETH/USDT', date: '2026-11-04', score: 65 },
        ]);
        setLoading(false);
      }, 500);
    } else {
      setLoading(false);
    }
  }, []);

  if (loading) return <div className="p-8 text-text-primary">Loading reviews...</div>;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto text-text-primary pb-24">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mb-1">Reviews</h1>
        <p className="text-sm text-text-secondary">Saved reviews of your executed trades.</p>
      </div>

      {!isConnected ? (
        <div className="glass-card p-12 text-center flex flex-col items-center justify-center min-h-[400px]">
          <span className="material-symbols-outlined text-5xl text-brand-primary mb-4">history_edu</span>
          <h2 className="text-xl font-semibold mb-2 text-white">No Reviews Yet</h2>
          <p className="text-sm text-text-secondary max-w-sm mx-auto mb-6">
            You need to connect an account and log a trade to see your first review.
          </p>
          <button onClick={() => navigate('/accounts')} className="px-6 py-2.5 rounded-lg bg-brand-primary text-white font-semibold shadow-lg hover:bg-blue-600 transition-all flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">add_link</span>
            Add first trade
          </button>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <div className="p-4 border-b border-border-subtle bg-[#0B0F19]/50 flex justify-between items-center">
            <h2 className="text-sm font-semibold text-white">Recent Audits</h2>
            <span className="text-xs text-text-tertiary">{reviews.length} Total</span>
          </div>
          <div className="divide-y divide-border-subtle">
            {reviews.map((review) => (
              <div key={review.id} className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors cursor-pointer" onClick={() => navigate(`/reviews/${review.id}`)}>
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm ${
                    review.score >= 75 ? 'bg-adherence-followed/10 text-adherence-followed' : 
                    review.score >= 50 ? 'bg-adherence-indeterminate/10 text-adherence-indeterminate' : 
                    'bg-adherence-broken/10 text-adherence-broken'
                  }`}>
                    {review.score}
                  </div>
                  <div>
                    <p className="font-semibold text-white">{review.symbol}</p>
                    <p className="text-xs text-text-tertiary">{review.date}</p>
                  </div>
                </div>
                <span className="material-symbols-outlined text-text-tertiary">chevron_right</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}