import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from './api';

const DIMENSION_LABELS = {
  risk: 'Risk Management', sizing: 'Position Sizing', plan: 'Plan Adherence', timing: 'Execution Timing', emotion: 'Emotional Control',
};

const getRuleDescription = (rule) => {
  switch (rule.check.type) {
    case 'max_risk_amount': return `Maximum risk of $${rule.check.amount} per trade.`;
    case 'max_notional': return `Maximum position size of $${rule.check.amount}.`;
    case 'required_evidence': return `Must record a "${rule.check.field.replace('_', ' ')}".`;
    case 'evidence_equals': return `Recorded state must be "${rule.check.value}".`;
    default: return 'Custom rule.';
  }
};

export default function Strategy() {
  const navigate = useNavigate();
  const [strategy, setStrategy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.getStrategies()
      .then((response) => { if (active) setStrategy(response?.strategies?.[0] || null); })
      .catch((err) => { if (active) setError(err?.message || 'Could not load the strategy.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  if (loading) return <div className="p-8 text-text-primary">Loading strategy…</div>;
  if (error) return <div role="alert" className="p-8 text-adherence-indeterminate">{error}</div>;
  if (!strategy) return <div className="p-8 text-text-secondary">No strategy is available for this identity.</div>;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto text-text-primary pb-24">
      
      {/* Header with Back Button */}
      <div className="flex flex-row items-center mb-8 gap-4">
        <button onClick={() => navigate('/profile')} className="w-10 h-10 rounded-full bg-surface-elevated border border-border-subtle flex items-center justify-center hover:text-brand-primary transition-colors">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mb-1">{strategy.name}</h1>
        </div>
      </div>

      <div className="space-y-6">
        <div className="glass-card p-6">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-secondary mb-5 flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px]">gavel</span>
            Execution Rules
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {strategy.draft_rules.map((rule) => (
              <div key={rule.id} className="p-4 rounded-xl bg-[#0B0F19]/40 border border-border-subtle">
                <span className="text-[10px] text-brand-primary font-bold uppercase tracking-wider">
                  {DIMENSION_LABELS[rule.dimension] || rule.dimension}
                </span>
                <p className="text-sm text-text-primary mt-1 font-medium">{rule.label}</p>
                <p className="text-xs text-text-secondary mt-2">{getRuleDescription(rule)}</p>
              </div>
            ))}
          </div>
        </div>

        {strategy.draft_trading_schedule && (
          <div className="glass-card p-6">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-primary mb-5 flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">schedule</span>
              Trading Schedule
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <p className="text-xs text-text-secondary mb-1">Allowed Days</p>
                <p className="text-sm text-text-primary capitalize">
                  {strategy.draft_trading_schedule.days.map(d => d.slice(0, 3)).join(', ')}
                </p>
              </div>
              <div>
                <p className="text-xs text-text-secondary mb-1">Trading Window</p>
                <p className="text-sm text-text-primary">{strategy.draft_trading_schedule.start_time} - {strategy.draft_trading_schedule.end_time}</p>
              </div>
              <div>
                <p className="text-xs text-text-secondary mb-1">Timezone</p>
                <p className="text-sm text-text-primary font-mono">{strategy.draft_trading_schedule.timezone}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}