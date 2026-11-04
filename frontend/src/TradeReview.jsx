import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';
import { api } from './api';

const DIMENSION_LABELS = {
  risk: 'Risk', sizing: 'Sizing', plan: 'Plan', timing: 'Timing', emotion: 'Emotion',
};

export default function TradeReview() {
  const { id } = useParams();
  
  const [review, setReview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchReview = async () => {
      try {
        const data = await api.requestReview(id);
        setReview(data.review.result);
      } catch (err) {
        setError(err?.message || "Failed to generate review.");
      } finally {
        setLoading(false);
      }
    };
    if (id) fetchReview();
  }, [id]);

  if (loading) return <div className="p-8 text-text-primary flex flex-col items-center justify-center h-screen">Loading...</div>;
  if (error) return <div className="p-8 text-adherence-broken text-center">{error}</div>;

  const radarData = review.dimensions.map(d => ({
    subject: DIMENSION_LABELS[d.dimension] || d.dimension,
    score: d.score_pct, 
    fullMark: 100,
  }));

  const getStatusStyle = (status) => {
    switch(status) {
      case 'followed': return 'bg-adherence-followed/10 text-adherence-followed border-adherence-followed/30';
      case 'broken': return 'bg-adherence-broken/10 text-adherence-broken border-adherence-broken/30';
      case 'cannot_assess': return 'bg-adherence-indeterminate/10 text-adherence-indeterminate border-adherence-indeterminate/30';
      default: return 'bg-surface-elevated text-text-secondary border-border-subtle';
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto text-text-primary pb-24">
      
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mb-2">Trade Audit</h1>
        <p className="text-sm text-text-secondary">Execution Post-Mortem</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Hero Score Card */}
          <div className="glass-card p-6 relative overflow-hidden">
            <div className="absolute -right-12 -top-12 w-48 h-48 bg-brand-secondary/20 rounded-full blur-3xl pointer-events-none"></div>
            
            <div className="flex justify-between items-start mb-6">
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-6xl font-bold tracking-tighter tabular-nums bg-clip-text text-transparent bg-gradient-to-r from-brand-primary to-brand-secondary">
                    {review.decision_quality_score === null ? '—' : Math.round(review.decision_quality_score)}
                  </span>
                  <span className="text-xl text-text-tertiary">/ 100</span>
                </div>
                <p className="text-xs text-text-secondary mt-1 uppercase tracking-wider">Decision Quality Score</p>
              </div>
              
              <div className="text-right">
                <div className="text-sm font-semibold text-brand-tertiary">{Math.round(review.coverage_pct)}%</div>
                <div className="text-[10px] text-text-tertiary uppercase tracking-wider">Coverage</div>
              </div>
            </div>

            <div className="bg-[#0B0F19]/50 border border-border-subtle rounded-lg p-4 flex gap-3 items-start">
              <span className="material-symbols-outlined text-brand-secondary mt-0.5">psychology</span>
              <div>
                <p className="text-sm font-semibold text-text-primary mb-1">Coach Summary</p>
                <p className="text-xs text-text-secondary leading-relaxed">{review.coaching.summary}</p>
              </div>
            </div>
          </div>

          {/* Radar Chart */}
          <div className="glass-card p-6 flex flex-col items-center">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-secondary w-full mb-2">Cognitive Vectors</h3>
            <p className="text-[10px] text-text-tertiary w-full mb-4">Unassessable dimensions are not treated as zero or as rule breaches.</p>
            <div className="w-full h-64">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                  <PolarGrid stroke="rgba(255,255,255,0.1)" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: '#94A3B8', fontSize: 12 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar name="Score" dataKey="score" stroke="#3B82F6" fill="url(#colorUv)" fillOpacity={0.4} />
                  <defs>
                    <linearGradient id="colorUv" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0.2}/>
                    </linearGradient>
                  </defs>
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="lg:col-span-7 space-y-6">
          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-secondary mb-3 px-1 flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">rule</span>
              Execution Safeguard Rules
            </h2>
            
            <div className="space-y-3">
              {review.dimensions.map((dim) => (
                <div key={dim.dimension} className="glass-card p-4">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-sm font-semibold text-text-primary">{DIMENSION_LABELS[dim.dimension]}</span>
                    {/* Main Status Badge */}
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${getStatusStyle(dim.status)}`}>
                      {dim.status.replace('_', ' ')}
                    </span>
                  </div>
                  
                  <div className="space-y-2">
                    {dim.rules.map((rule) => (
                      <div key={rule.rule_id} className="bg-[#0B0F19]/40 rounded p-3 border border-border-subtle/30 flex justify-between items-start gap-4">
                        <div>
                          <span className="text-xs text-text-primary font-medium">{rule.label}</span>
                          <p className="text-[10px] text-text-tertiary mt-1">{rule.reason}</p>
                        </div>
                        {/* Small colored dot instead of a huge button */}
                        <div className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${rule.status === 'followed' ? 'bg-adherence-followed' : rule.status === 'broken' ? 'bg-adherence-broken' : 'bg-adherence-indeterminate'}`} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Action Card */}
          <div className="relative rounded-2xl p-[1px] bg-gradient-to-b from-brand-primary/50 to-transparent shadow-xl mt-6">
            <div className="rounded-2xl bg-[#0B0F19]/90 backdrop-blur-xl p-6 h-full">
              <div className="flex items-center gap-3 mb-4 pb-4 border-b border-border-subtle">
                <div className="w-8 h-8 rounded bg-brand-primary/20 flex items-center justify-center">
                  <span className="material-symbols-outlined text-brand-primary text-[20px]">bolt</span>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">Actionable Next Steps</h3>
                  <p className="text-[10px] text-brand-secondary uppercase tracking-wider">Rule-Based Coaching</p>
                </div>
              </div>

              <ul className="space-y-3">
                {review.coaching.actions.map((action, idx) => (
                  <li key={idx} className="flex items-start gap-3 text-sm text-text-primary">
                    <span className="material-symbols-outlined text-brand-tertiary text-[18px] mt-0.5">arrow_right</span>
                    <span>{action}</span>
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