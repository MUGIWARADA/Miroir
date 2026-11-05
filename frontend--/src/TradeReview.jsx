import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from './api';

const DIMENSION_LABELS = {
  risk: 'Risk Management', sizing: 'Position Sizing', plan: 'Plan Adherence', timing: 'Execution Timing', emotion: 'Emotional Control',
};

export default function TradeReview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [review, setReview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    if (!id) return undefined;
    api.requestReview(id)
      .then((data) => { if (active) setReview(data?.review?.result || null); })
      .catch((err) => { if (active) setError(err?.message || 'Failed to generate review.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  if (!id) return <div className="p-8 text-adherence-broken text-center">A trade ID is required.</div>;
  if (loading) return <div className="p-8 text-text-primary flex flex-col items-center justify-center h-screen">Loading audit...</div>;
  if (error) return <div className="p-8 text-adherence-broken text-center">{error}</div>;
  if (!review) return <div className="p-8 text-text-secondary text-center">No review data found.</div>;

  const getStatusStyle = (status) => {
    switch(status) {
      case 'followed': return 'text-adherence-followed border-adherence-followed/30 bg-adherence-followed/5';
      case 'broken': return 'text-adherence-broken border-adherence-broken/30 bg-adherence-broken/5';
      case 'cannot_assess': return 'text-adherence-indeterminate border-adherence-indeterminate/30 bg-adherence-indeterminate/5';
      default: return 'text-text-secondary border-border-subtle bg-surface-elevated';
    }
  };

  const getStatusLabel = (status) => {
    if (status === 'cannot_assess') return 'Needs Evidence';
    if (status === 'followed') return 'Pass';
    if (status === 'broken') return 'Fail';
    return status;
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto text-text-primary pb-24">
      <div className="mb-6 flex items-center gap-4">
        <button onClick={() => navigate('/reviews')} className="w-10 h-10 rounded-full bg-surface-elevated border border-border-subtle flex items-center justify-center hover:text-brand-primary transition-colors">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mb-1">Trade Review</h1>
          <p className="text-sm text-text-secondary">Deterministic rule evaluation.</p>
        </div>
      </div>

      <div className="glass-card p-6 relative overflow-hidden mb-6">
        <div className="absolute -right-12 -top-12 w-48 h-48 bg-brand-secondary/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 relative z-10">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-secondary mb-2">Decision Quality</p>
            <div className="flex items-baseline gap-2">
              <span className="text-6xl font-bold tracking-tighter tabular-nums text-white">
                {review.decision_quality_score === null ? '—' : Math.round(review.decision_quality_score)}
              </span>
              <span className="text-xl text-text-tertiary">/ 100</span>
            </div>
            <p className="text-xs text-text-secondary mt-2 max-w-sm">
              {review.decision_quality_score === null ? "Not enough evidence to score this trade." : `Score across assessed rules. ${Math.round(review.coverage_pct)}% of the full framework had enough evidence to check.`}
            </p>
          </div>
          <div className="flex gap-4">
            <div className="bg-[#0B0F19]/50 border border-border-subtle rounded-lg p-3 min-w-[120px]">
              <div className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">Evidence Coverage</div>
              <div className="text-xl font-semibold text-brand-tertiary">{Math.round(review.coverage_pct)}%</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-4">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-secondary mb-2 flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px]">rule</span>
            Rule Evidence
          </h2>
          <div className="space-y-3">
            {review.dimensions.map((dim) => (
              <div key={dim.dimension} className="glass-card p-4">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-semibold text-text-primary">{DIMENSION_LABELS[dim.dimension]}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${getStatusStyle(dim.status)}`}>
                    {getStatusLabel(dim.status)}
                  </span>
                </div>
                <div className="space-y-2">
                  {dim.rules.map((rule) => (
                    <div key={rule.rule_id} className="bg-[#0B0F19]/40 rounded-lg p-3 border border-border-subtle/50">
                      <div className="flex justify-between items-start gap-4 mb-1">
                        <span className="text-xs font-medium text-text-primary">{rule.label}</span>
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${rule.status === 'followed' ? 'text-adherence-followed' : rule.status === 'broken' ? 'text-adherence-broken' : 'text-adherence-indeterminate'}`}>
                          {getStatusLabel(rule.status)}
                        </span>
                      </div>
                      <p className="text-[11px] text-text-secondary">{rule.reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="lg:col-span-4 space-y-4">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-secondary mb-2 flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px]">psychology</span>
            Coaching
          </h2>
          <div className="glass-card p-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-brand-primary/10 rounded-full blur-2xl pointer-events-none"></div>
            <div className="flex items-center gap-2 mb-3">
              <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-surface-elevated text-text-secondary border border-border-subtle">
                Rule-Based
              </span>
            </div>
            <p className="text-sm font-medium text-text-primary mb-4 leading-relaxed">{review.coaching.summary}</p>
            <div className="border-t border-border-subtle pt-4">
              <p className="text-[10px] uppercase tracking-wider text-brand-secondary mb-3 font-semibold">Next Steps</p>
              <ul className="space-y-3">
                {review.coaching.actions.map((action, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-xs text-text-secondary">
                    <span className="material-symbols-outlined text-brand-primary text-[14px] mt-0.5">arrow_right</span>
                    <span className="leading-relaxed">{action}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}