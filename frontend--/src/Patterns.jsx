import { useState, useEffect, useCallback } from 'react';
import { api } from './api';

const TIER_COLORS = {
  INSUFFICIENT_DATA: 'bg-surface-elevated text-text-tertiary border-border-subtle',
  EARLY_PATTERN: 'bg-adherence-indeterminate/10 text-adherence-indeterminate border-adherence-indeterminate/30',
  REPEATED_PATTERN: 'bg-brand-secondary/10 text-brand-secondary border-brand-secondary/30',
  STRONGER_EVIDENCE: 'bg-brand-primary/10 text-brand-primary border-brand-primary/30',
};

const TIER_LABELS = {
  INSUFFICIENT_DATA: 'Insufficient Data (< 3)',
  EARLY_PATTERN: 'Early Pattern (3-5)',
  REPEATED_PATTERN: 'Repeated Pattern (6-14)',
  STRONGER_EVIDENCE: 'Stronger Evidence (15+)',
};

export default function Patterns() {
  const [report, setReport] = useState(null);
  const [aiExplanation, setAiExplanation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [analyzingAi, setAnalyzingAi] = useState(false);
  const [error, setError] = useState(null);
  const [strategies, setStrategies] = useState([]);
  const [selectedStrategyId, setSelectedStrategyId] = useState('');

  const fetchPatterns = useCallback(async (strategyId = '', withAi = false) => {
    if (withAi) setAnalyzingAi(true);
    setError(null);

    try {
      const data = await api.getPatterns({
        strategyId: strategyId || undefined,
        explain: withAi
      });
      setReport(data?.patterns || null);
      if (data?.ai_explanation) {
        setAiExplanation(data.ai_explanation);
      }
    } catch (err) {
      setError(err?.message || 'Failed to detect personal trading patterns.');
    } finally {
      setLoading(false);
      setAnalyzingAi(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    api.getStrategies()
      .then((res) => { if (active) setStrategies(res?.strategies || []); })
      .catch(() => {});

    api.getPatterns()
      .then((data) => {
        if (active) {
          setReport(data?.patterns || null);
          if (data?.ai_explanation) setAiExplanation(data.ai_explanation);
        }
      })
      .catch((err) => {
        if (active) setError(err?.message || 'Failed to detect personal trading patterns.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, []);

  const handleStrategyChange = (e) => {
    const val = e.target.value;
    setSelectedStrategyId(val);
    fetchPatterns(val, false);
  };

  const handleRequestAi = () => {
    fetchPatterns(selectedStrategyId, true);
  };

  if (loading) return <div className="p-8 text-text-primary flex h-screen items-center justify-center">Analyzing trading patterns...</div>;
  if (error) return <div className="p-8 text-adherence-broken text-center">{error}</div>;
  if (!report) return <div className="p-8 text-text-secondary text-center">No trading data available for pattern detection.</div>;

  const meta = report.analysis_meta;

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto text-text-primary pb-28">
      {/* Header */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mb-1 flex items-center gap-2">
            <span className="material-symbols-outlined text-brand-secondary text-3xl">insights</span>
            Personal Trading Intelligence
          </h1>
          <p className="text-xs text-text-secondary">
            Deterministic discovery of recurring execution habits, mistakes, and discipline trends grounded in your actual records.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {strategies.length > 0 && (
            <select
              value={selectedStrategyId}
              onChange={handleStrategyChange}
              className="bg-surface-elevated border border-border-subtle rounded-lg px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-brand-primary"
            >
              <option value="">All Strategies</option>
              {strategies.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.status})</option>
              ))}
            </select>
          )}

          <button
            onClick={handleRequestAi}
            disabled={analyzingAi}
            className="px-4 py-2 bg-brand-primary text-black hover:bg-brand-primary/90 font-semibold rounded-lg text-xs flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            <span className={`material-symbols-outlined text-[16px] ${analyzingAi ? 'animate-spin' : ''}`}>
              {analyzingAi ? 'sync' : 'psychology'}
            </span>
            {analyzingAi ? 'Interpreting...' : 'AI Pattern Interpretation'}
          </button>
        </div>
      </div>

      {/* Dataset & Sample Size Header Card */}
      <div className="glass-card p-5 mb-6 relative overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 text-xs">
          <div>
            <span className="text-text-tertiary uppercase tracking-wider text-[10px] block mb-0.5">Sample Overview</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white tabular-nums">{meta.total_trades_analyzed}</span>
              <span className="text-text-secondary">trades ({meta.reviewed_trades_analyzed} reviewed)</span>
            </div>
          </div>
          <div>
            <span className="text-text-tertiary uppercase tracking-wider text-[10px] block mb-0.5">Date Horizon</span>
            <span className="text-text-primary font-mono">
              {meta.date_range.start ? new Date(meta.date_range.start).toLocaleDateString() : '—'} to {meta.date_range.end ? new Date(meta.date_range.end).toLocaleDateString() : '—'}
            </span>
          </div>
          <div>
            <span className="text-text-tertiary uppercase tracking-wider text-[10px] block mb-0.5">Sample Protection</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold border bg-surface-elevated text-brand-secondary border-border-subtle">
              Confidence Tiers Enforced
            </span>
          </div>
        </div>
      </div>

      {/* AI Interpretation Panel (if generated) */}
      {aiExplanation && (
        <div className="glass-card p-6 mb-6 border-brand-primary/30 relative overflow-hidden space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-brand-primary">psychology</span>
              <span className="text-sm font-semibold text-white">AI Pattern Interpretation</span>
            </div>
            <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-surface-elevated text-text-tertiary border border-border-subtle">
              [AI_INFERRED from Deterministic Evidence]
            </span>
          </div>

          <p className="text-sm text-text-primary leading-relaxed">{aiExplanation.summary}</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            {aiExplanation.top_pattern && (
              <div className="p-3 bg-adherence-broken/10 border border-adherence-broken/30 rounded-lg">
                <span className="text-[10px] uppercase tracking-wider text-adherence-broken font-bold block mb-1">
                  Primary Habitual Pattern
                </span>
                <p className="text-xs text-text-primary">{aiExplanation.top_pattern}</p>
              </div>
            )}
            {aiExplanation.confidence_evaluation && (
              <div className="p-3 bg-surface-elevated border border-border-subtle rounded-lg">
                <span className="text-[10px] uppercase tracking-wider text-text-tertiary font-bold block mb-1">
                  Evidence & Sample Evaluation
                </span>
                <p className="text-xs text-text-secondary">{aiExplanation.confidence_evaluation}</p>
              </div>
            )}
          </div>

          {aiExplanation.coaching_recommendation && (
            <div className="p-3 bg-brand-secondary/10 border border-brand-secondary/30 rounded-lg">
              <span className="text-[10px] uppercase tracking-wider text-brand-secondary font-bold block mb-1">
                Evidence-Based Coaching Recommendation
              </span>
              <p className="text-xs text-text-primary">{aiExplanation.coaching_recommendation}</p>
            </div>
          )}
        </div>
      )}

      {/* Grid of Deterministic Pattern Analyses */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Frequently Broken Rules & Recurring Risk Problems */}
        <div className="lg:col-span-6 space-y-6">
          {/* Frequently Broken Rules */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-secondary flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] text-adherence-broken">warning</span>
                Frequently Broken Rules
              </h2>
              <span className="text-[9px] font-mono text-text-tertiary">[APPLICATION_CALCULATED]</span>
            </div>

            {report.frequently_broken_rules.length === 0 ? (
              <p className="text-xs text-text-secondary italic">No rule breaches recorded in the assessed trades.</p>
            ) : (
              <div className="space-y-3">
                {report.frequently_broken_rules.map((rule, idx) => (
                  <div key={idx} className="bg-[#0B0F19]/50 p-3 rounded-lg border border-border-subtle/50 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-semibold text-text-primary">{rule.label}</span>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${TIER_COLORS[rule.confidence_tier]}`}>
                        {TIER_LABELS[rule.confidence_tier]}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-text-secondary">
                      <span>Breaches: <strong className="text-adherence-broken">{rule.broken_count}</strong></span>
                      <span>Assessed: <strong>{rule.sample_size}</strong></span>
                      <span>Violation Rate: <strong>{rule.violation_rate_pct}%</strong></span>
                    </div>
                    {rule.limitations && (
                      <p className="text-[10px] text-text-tertiary italic">{rule.limitations}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Risk Management Discipline */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-secondary flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] text-brand-tertiary">security</span>
                Risk Management Profile
              </h2>
              <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${TIER_COLORS[report.risk_management.confidence_tier]}`}>
                {TIER_LABELS[report.risk_management.confidence_tier]}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3 my-3">
              <div className="bg-[#0B0F19]/40 p-2.5 rounded-lg border border-border-subtle/50">
                <span className="text-[10px] text-text-tertiary block">Assessed Trades</span>
                <span className="text-lg font-bold text-white tabular-nums">{report.risk_management.assessed_trades}</span>
              </div>
              <div className="bg-[#0B0F19]/40 p-2.5 rounded-lg border border-border-subtle/50">
                <span className="text-[10px] text-text-tertiary block">Risk Violations</span>
                <span className="text-lg font-bold text-adherence-broken tabular-nums">{report.risk_management.violations}</span>
              </div>
              <div className="bg-[#0B0F19]/40 p-2.5 rounded-lg border border-border-subtle/50">
                <span className="text-[10px] text-text-tertiary block">Adherence Rate</span>
                <span className="text-lg font-bold text-brand-primary tabular-nums">
                  {report.risk_management.adherence_pct !== null ? `${report.risk_management.adherence_pct}%` : '—'}
                </span>
              </div>
            </div>
            {report.risk_management.limitations && (
              <p className="text-[10px] text-text-tertiary italic">{report.risk_management.limitations}</p>
            )}
          </div>
        </div>

        {/* Right Column: Discipline Trend & Emotional State Associations */}
        <div className="lg:col-span-6 space-y-6">
          {/* Discipline Trajectory Over Time */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-secondary flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] text-brand-secondary">trending_up</span>
                Discipline Trajectory Over Time
              </h2>
              <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${TIER_COLORS[report.discipline_trend.confidence_tier]}`}>
                {TIER_LABELS[report.discipline_trend.confidence_tier]}
              </span>
            </div>
            <div className="bg-[#0B0F19]/40 p-3 rounded-lg border border-border-subtle/50 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-text-tertiary uppercase tracking-wider block">Trajectory</span>
                <span className="text-sm font-bold text-white uppercase tracking-wide">
                  {report.discipline_trend.trend_direction}
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <div>
                  <span className="text-[10px] text-text-tertiary block">Earlier Avg Score</span>
                  <span className="font-semibold text-text-secondary">{report.discipline_trend.earlier_avg_score ?? '—'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-text-tertiary block">Recent Avg Score</span>
                  <span className="font-semibold text-brand-primary">{report.discipline_trend.recent_avg_score ?? '—'}</span>
                </div>
              </div>
            </div>
            {report.discipline_trend.limitations && (
              <p className="text-[10px] text-text-tertiary italic mt-2">{report.discipline_trend.limitations}</p>
            )}
          </div>

          {/* Emotional State Associations (Strict Non-Causal Grounding) */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-secondary flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] text-brand-primary">psychology_alt</span>
                Emotional States & Mindset Associations
              </h2>
              <span className="text-[9px] font-mono text-text-tertiary">[TRADER_REPORTED]</span>
            </div>
            <p className="text-[11px] text-text-secondary mb-3">
              Observations of self-reported emotional states alongside execution metrics. Co-occurrence does not establish causation.
            </p>

            {report.emotional_state_patterns.length === 0 ? (
              <p className="text-xs text-text-secondary italic">No emotional states recorded in trade evidence.</p>
            ) : (
              <div className="space-y-2">
                {report.emotional_state_patterns.map((item, idx) => (
                  <div key={idx} className="bg-[#0B0F19]/50 p-2.5 rounded-lg border border-border-subtle/50 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-white capitalize">{item.emotion}</span>
                      <span className="text-[10px] text-text-tertiary block">
                        {item.observations} observations · {item.broken_rules_observed} rule breaches
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-white block">Avg DQ: {item.average_decision_quality ?? '—'}</span>
                      <span className={`text-[10px] font-bold ${item.total_realized_pnl >= 0 ? 'text-adherence-followed' : 'text-adherence-broken'}`}>
                        ${item.total_realized_pnl}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Performance & Adherence by Instrument */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-secondary flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] text-brand-secondary">currency_exchange</span>
                Execution by Instrument
              </h2>
              <span className="text-[9px] font-mono text-text-tertiary">[APPLICATION_CALCULATED]</span>
            </div>
            <div className="space-y-2">
              {report.by_instrument.map((inst, idx) => (
                <div key={idx} className="bg-[#0B0F19]/40 p-2.5 rounded-lg border border-border-subtle/50 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-semibold text-white">{inst.instrument}</span>
                    <span className="text-[10px] text-text-tertiary block">{inst.sample_size} trades · Win rate {inst.win_rate_pct ?? '—'}%</span>
                  </div>
                  <div className="text-right">
                    <span className="text-text-primary block font-mono">P&L: ${inst.total_pnl}</span>
                    <span className="text-[10px] text-brand-tertiary">Avg DQ: {inst.average_decision_quality ?? '—'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
