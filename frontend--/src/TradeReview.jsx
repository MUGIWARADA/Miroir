import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from './api';

const DIMENSION_LABELS = {
  risk: 'Risk Management',
  sizing: 'Position Sizing',
  plan: 'Plan Adherence',
  timing: 'Execution Timing',
  emotion: 'Emotional Control',
};

export default function TradeReview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [reviewData, setReviewData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reEvaluating, setReEvaluating] = useState(false);
  const [error, setError] = useState(null);

  const fetchReview = useCallback((reEvaluate = false) => {
    if (!id) return;
    if (reEvaluate) setReEvaluating(true);
    setError(null);

    api.requestReview(id, { re_evaluate: reEvaluate })
      .then((data) => {
        setReviewData(data?.review || null);
      })
      .catch((err) => {
        setError(err?.message || 'Failed to generate review.');
      })
      .finally(() => {
        setLoading(false);
        setReEvaluating(false);
      });
  }, [id]);

  useEffect(() => {
    let active = true;
    if (!id) return undefined;
    api.requestReview(id, { re_evaluate: false })
      .then((data) => {
        if (active) setReviewData(data?.review || null);
      })
      .catch((err) => {
        if (active) setError(err?.message || 'Failed to generate review.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [id]);

  if (!id) return <div className="p-8 text-adherence-broken text-center">A trade ID is required.</div>;
  if (loading) return <div className="p-8 text-text-primary flex flex-col items-center justify-center h-screen">Loading audit...</div>;
  if (error) return <div className="p-8 text-adherence-broken text-center">{error}</div>;
  if (!reviewData) return <div className="p-8 text-text-secondary text-center">No review data found.</div>;

  const result = reviewData.result || reviewData;
  const ai = result.ai_explanation || null;

  const getStatusStyle = (status) => {
    switch(status) {
      case 'followed': return 'text-adherence-followed border-adherence-followed/30 bg-adherence-followed/5';
      case 'broken': return 'text-adherence-broken border-adherence-broken/30 bg-adherence-broken/5';
      case 'cannot_assess': return 'text-adherence-indeterminate border-adherence-indeterminate/30 bg-adherence-indeterminate/5';
      default: return 'text-text-secondary border-border-subtle bg-surface-elevated';
    }
  };

  const getStatusLabel = (status) => {
    if (status === 'cannot_assess') return 'Cannot Assess';
    if (status === 'followed') return 'Followed';
    if (status === 'broken') return 'Broken';
    return status;
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto text-text-primary pb-24">
      {/* Header */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/reviews')} className="w-10 h-10 rounded-full bg-surface-elevated border border-border-subtle flex items-center justify-center hover:text-brand-primary transition-colors">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mb-1">Trade Discipline Review</h1>
            <p className="text-xs text-text-secondary flex items-center gap-2">
              <span>Evaluated: {result.evaluated_at ? new Date(result.evaluated_at).toLocaleString() : 'Recent'}</span>
              {result.strategy_version_id && (
                <span className="px-1.5 py-0.5 rounded bg-surface-elevated border border-border-subtle text-[10px] text-brand-secondary">
                  Strategy Version: {result.strategy_version_id.slice(0, 8)}
                </span>
              )}
            </p>
          </div>
        </div>

        <button
          onClick={() => fetchReview(true)}
          disabled={reEvaluating}
          className="px-4 py-2 bg-surface-elevated hover:bg-surface-elevated/80 border border-border-subtle rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors self-start md:self-auto"
        >
          <span className={`material-symbols-outlined text-[16px] ${reEvaluating ? 'animate-spin' : ''}`}>refresh</span>
          {reEvaluating ? 'Re-evaluating...' : 'Re-evaluate'}
        </button>
      </div>

      {/* Decision Quality Score Banner */}
      <div className="glass-card p-6 relative overflow-hidden mb-6">
        <div className="absolute -right-12 -top-12 w-48 h-48 bg-brand-secondary/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-secondary">Decision Quality Score</span>
              <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
                [APPLICATION_CALCULATED]
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-6xl font-bold tracking-tighter tabular-nums text-white">
                {result.decision_quality_score === null ? '—' : Math.round(result.decision_quality_score)}
              </span>
              <span className="text-xl text-text-tertiary">/ 100</span>
            </div>
            <p className="text-xs text-text-secondary mt-2 max-w-sm">
              {result.decision_quality_score === null
                ? "Not enough evidence to calculate a decision quality score."
                : `Deterministic score reflecting rule adherence. ${Math.round(result.coverage_pct)}% of rules had sufficient evidence to assess.`}
            </p>
          </div>

          <div className="flex gap-4">
            <div className="bg-[#0B0F19]/50 border border-border-subtle rounded-lg p-3 min-w-[120px]">
              <div className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">Evidence Coverage</div>
              <div className="text-xl font-semibold text-brand-tertiary">{Math.round(result.coverage_pct)}%</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Authoritative Deterministic Rule Evidence */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-secondary flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">rule</span>
              Authoritative Rule Breakdown
            </h2>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-surface-elevated text-text-tertiary border border-border-subtle font-mono">
              [APPLICATION_CALCULATED]
            </span>
          </div>

          <div className="space-y-3">
            {(result.dimensions || []).map((dim) => (
              <div key={dim.dimension} className="glass-card p-4">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-semibold text-text-primary">{DIMENSION_LABELS[dim.dimension] || dim.dimension}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${getStatusStyle(dim.status)}`}>
                    {getStatusLabel(dim.status)}
                  </span>
                </div>
                <div className="space-y-2">
                  {(dim.rules || []).map((rule) => (
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

        {/* Right Column: AI Explanation & Coaching */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-secondary flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">psychology</span>
              AI Coaching & Discipline Insights
            </h2>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-surface-elevated text-text-tertiary border border-border-subtle font-mono">
              [AI_INFERRED]
            </span>
          </div>

          {/* AI Explanation Card */}
          <div className="glass-card p-5 relative overflow-hidden space-y-4">
            <div className="absolute top-0 right-0 w-32 h-32 bg-brand-primary/10 rounded-full blur-2xl pointer-events-none"></div>

            {/* Provider status badge */}
            <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
              <span className="text-xs font-semibold text-text-secondary">OpenRouter AI Companion</span>
              {ai?.status === 'available' ? (
                <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-adherence-followed/10 text-adherence-followed border border-adherence-followed/30">
                  {ai.model || 'OpenRouter Active'}
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-surface-elevated text-text-tertiary border border-border-subtle">
                  {ai?.status === 'not_configured' ? 'AI Offline (Rules Active)' : 'AI Unavailable'}
                </span>
              )}
            </div>

            {/* AI Summary */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-text-tertiary font-semibold mb-1">Execution Summary</p>
              <p className="text-xs text-text-primary leading-relaxed">
                {ai?.summary || result.coaching?.summary || 'Deterministic evaluation complete.'}
              </p>
            </div>

            {/* Most Important Mistake Callout */}
            {ai?.most_important_mistake && (
              <div className="p-3 bg-adherence-broken/10 border border-adherence-broken/30 rounded-lg">
                <div className="flex items-center gap-1.5 text-adherence-broken text-[11px] font-bold uppercase tracking-wide mb-1">
                  <span className="material-symbols-outlined text-[14px]">error</span>
                  Most Important Mistake
                </div>
                <p className="text-xs text-text-primary leading-relaxed">{ai.most_important_mistake}</p>
              </div>
            )}

            {/* Profitability vs Discipline Distinction */}
            {ai?.profitability_vs_discipline && (
              <div className="p-3 bg-brand-secondary/10 border border-brand-secondary/30 rounded-lg">
                <div className="flex items-center gap-1.5 text-brand-secondary text-[11px] font-bold uppercase tracking-wide mb-1">
                  <span className="material-symbols-outlined text-[14px]">balance</span>
                  Profitability vs Discipline
                </div>
                <p className="text-xs text-text-primary leading-relaxed">{ai.profitability_vs_discipline}</p>
              </div>
            )}

            {/* Coaching Recommendation */}
            {ai?.coaching_recommendation && (
              <div className="p-3 bg-surface-elevated border border-border-subtle rounded-lg">
                <div className="flex items-center gap-1.5 text-brand-tertiary text-[11px] font-bold uppercase tracking-wide mb-1">
                  <span className="material-symbols-outlined text-[14px]">lightbulb</span>
                  Coaching Recommendation
                </div>
                <p className="text-xs text-text-primary leading-relaxed">{ai.coaching_recommendation}</p>
              </div>
            )}

            {/* Actionable Next Steps */}
            {((ai?.actions && ai.actions.length > 0) || (result.coaching?.actions && result.coaching.actions.length > 0)) && (
              <div className="pt-2 border-t border-border-subtle">
                <p className="text-[10px] uppercase tracking-wider text-brand-secondary mb-2 font-semibold">Concrete Next Steps</p>
                <ul className="space-y-2">
                  {(ai?.actions || result.coaching?.actions || []).map((action, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-xs text-text-secondary">
                      <span className="material-symbols-outlined text-brand-primary text-[14px] mt-0.5">check_circle</span>
                      <span className="leading-relaxed">{action}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
