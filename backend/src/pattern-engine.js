/**
 * Miroir Personal Trading Intelligence and Pattern Recognition Engine
 *
 * Deterministic pattern detection and evidence grounding across trader history.
 * Every pattern computes sample sizes, confidence tiers, date ranges, and caveats.
 */

export const ConfidenceTier = {
  INSUFFICIENT_DATA: 'INSUFFICIENT_DATA',
  EARLY_PATTERN: 'EARLY_PATTERN',
  REPEATED_PATTERN: 'REPEATED_PATTERN',
  STRONGER_EVIDENCE: 'STRONGER_EVIDENCE'
};

/**
 * Assigns a sample-size protection confidence tier based on the number of observations.
 * Thresholds:
 * - < 3 observations: INSUFFICIENT_DATA
 * - 3 to 5 observations: EARLY_PATTERN
 * - 6 to 14 observations: REPEATED_PATTERN
 * - 15+ observations: STRONGER_EVIDENCE
 */
export function classifyConfidenceTier(sampleCount) {
  const count = Number(sampleCount) || 0;
  if (count < 3) return ConfidenceTier.INSUFFICIENT_DATA;
  if (count < 6) return ConfidenceTier.EARLY_PATTERN;
  if (count < 15) return ConfidenceTier.REPEATED_PATTERN;
  return ConfidenceTier.STRONGER_EVIDENCE;
}

function parseTradeDate(trade) {
  const val = trade.opened_at || trade.closed_at || trade.entry_at || trade.created_at;
  if (!val) return null;
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? null : d;
}

function extractEmotion(trade) {
  if (!Array.isArray(trade.evidence)) return null;
  for (const item of trade.evidence) {
    if (item?.kind === 'state' && item.payload?.emotional_state) {
      return String(item.payload.emotional_state).trim().toLowerCase();
    }
  }
  return null;
}

/**
 * Analyzes trades and their reviews deterministically to identify recurring behavioral patterns.
 * Supports filtering by date range, strategy_id, and strategy_version_id.
 */
export function detectTradingPatterns({
  trades = [],
  reviews = [],
  strategies = [],
  strategyVersions = [],
  filter = {}
} = {}) {
  const { startDate, endDate, strategyId, strategyVersionId } = filter;

  const startMs = startDate ? new Date(startDate).getTime() : -Infinity;
  const endMs = endDate ? new Date(endDate).getTime() : Infinity;

  // Map reviews by trade_id
  const reviewsByTradeId = new Map();
  for (const r of reviews) {
    if (r?.trade_id && r.result) {
      reviewsByTradeId.set(r.trade_id, r.result);
    }
  }

  // Filter trades
  const filteredTrades = trades.filter((trade) => {
    if (strategyId && trade.strategy_id !== strategyId) return false;
    if (strategyVersionId && trade.strategy_version_id !== strategyVersionId) return false;
    const d = parseTradeDate(trade);
    if (!d) return true;
    const ms = d.getTime();
    return ms >= startMs && ms <= endMs;
  });

  const totalTradesCount = filteredTrades.length;
  const reviewedTrades = filteredTrades.filter((t) => reviewsByTradeId.has(t.id));
  const reviewedCount = reviewedTrades.length;

  // Determine overall date range
  let earliestDate = null;
  let latestDate = null;
  for (const t of filteredTrades) {
    const d = parseTradeDate(t);
    if (d) {
      if (!earliestDate || d < earliestDate) earliestDate = d;
      if (!latestDate || d > latestDate) latestDate = d;
    }
  }
  const dateRange = {
    start: earliestDate ? earliestDate.toISOString() : null,
    end: latestDate ? latestDate.toISOString() : null
  };

  // 1. Frequently broken rules & recurring mistakes
  const brokenRuleStats = new Map();
  const dimensionStats = {
    risk: { assessed: 0, broken: 0, followed: 0 },
    sizing: { assessed: 0, broken: 0, followed: 0 },
    plan: { assessed: 0, broken: 0, followed: 0 },
    timing: { assessed: 0, broken: 0, followed: 0 },
    emotion: { assessed: 0, broken: 0, followed: 0 }
  };

  for (const trade of reviewedTrades) {
    const review = reviewsByTradeId.get(trade.id);
    for (const dim of (review.dimensions || [])) {
      if (dimensionStats[dim.dimension]) {
        if (dim.status === 'followed') {
          dimensionStats[dim.dimension].assessed += 1;
          dimensionStats[dim.dimension].followed += 1;
        } else if (dim.status === 'broken') {
          dimensionStats[dim.dimension].assessed += 1;
          dimensionStats[dim.dimension].broken += 1;
        }
      }

      for (const rule of (dim.rules || [])) {
        if (rule.status === 'broken') {
          const key = rule.label || rule.rule_id;
          const current = brokenRuleStats.get(key) || {
            rule_id: rule.rule_id,
            label: rule.label,
            dimension: dim.dimension,
            broken_count: 0,
            trades: [],
            sample_size: 0
          };
          current.broken_count += 1;
          current.trades.push(trade.id);
          brokenRuleStats.set(key, current);
        }
      }
    }
  }

  // Update sample sizes for broken rules
  const frequentlyBrokenRules = [...brokenRuleStats.values()]
    .map((item) => {
      const dimAssessed = dimensionStats[item.dimension]?.assessed || reviewedCount;
      const violationRate = dimAssessed > 0 ? (item.broken_count / dimAssessed) : 0;
      return {
        ...item,
        sample_size: dimAssessed,
        violation_rate_pct: Math.round(violationRate * 100),
        confidence_tier: classifyConfidenceTier(item.broken_count),
        calculation_method: 'Count of deterministic rule breaches divided by reviewed trades where dimension was assessable',
        limitations: item.broken_count < 3 ? 'Too few observations to conclude a habitual pattern.' : null
      };
    })
    .sort((a, b) => b.broken_count - a.broken_count);

  // 2. Risk management recurring problems
  const riskAssessed = dimensionStats.risk.assessed;
  const riskBroken = dimensionStats.risk.broken;
  const riskManagementSummary = {
    assessed_trades: riskAssessed,
    violations: riskBroken,
    adherence_pct: riskAssessed > 0 ? Math.round(((riskAssessed - riskBroken) / riskAssessed) * 100) : null,
    confidence_tier: classifyConfidenceTier(riskAssessed),
    pattern_detected: riskBroken >= 3,
    calculation_method: 'Evaluated against confirmed strategy risk check amount',
    limitations: riskAssessed < 3 ? 'Insufficient risk observations to establish risk discipline profile.' : null
  };

  // 3. Discipline over time (Chronological halves comparison)
  const sortedReviewed = [...reviewedTrades].sort((a, b) => {
    const da = parseTradeDate(a)?.getTime() || 0;
    const db = parseTradeDate(b)?.getTime() || 0;
    return da - db;
  });

  let disciplineTrend = null;
  if (sortedReviewed.length >= 4) {
    const half = Math.floor(sortedReviewed.length / 2);
    const firstHalf = sortedReviewed.slice(0, half);
    const secondHalf = sortedReviewed.slice(half);

    const calcDq = (batch) => {
      const scores = batch
        .map((t) => reviewsByTradeId.get(t.id)?.decision_quality_score)
        .filter((s) => typeof s === 'number' && Number.isFinite(s));
      return scores.length > 0 ? scores.reduce((sum, v) => sum + v, 0) / scores.length : null;
    };

    const dqEarlier = calcDq(firstHalf);
    const dqRecent = calcDq(secondHalf);

    let direction = 'stable';
    if (dqEarlier !== null && dqRecent !== null) {
      if (dqRecent - dqEarlier >= 5) direction = 'improving';
      else if (dqEarlier - dqRecent >= 5) direction = 'declining';
    }

    disciplineTrend = {
      sample_size: sortedReviewed.length,
      earlier_avg_score: dqEarlier !== null ? Math.round(dqEarlier) : null,
      recent_avg_score: dqRecent !== null ? Math.round(dqRecent) : null,
      trend_direction: direction,
      confidence_tier: classifyConfidenceTier(sortedReviewed.length),
      calculation_method: 'Comparison of mean decision quality score between earlier and recent chronological halves',
      limitations: 'Discipline scores reflect rule adherence, not market condition difficulty.'
    };
  } else {
    disciplineTrend = {
      sample_size: sortedReviewed.length,
      earlier_avg_score: null,
      recent_avg_score: null,
      trend_direction: 'insufficient_history',
      confidence_tier: ConfidenceTier.INSUFFICIENT_DATA,
      calculation_method: 'Comparison of mean decision quality score between earlier and recent chronological halves',
      limitations: 'Need at least 4 reviewed trades to compute discipline trajectory over time.'
    };
  }

  // 4. Performance & Adherence by Instrument (Symbol)
  const byInstrumentMap = new Map();
  for (const trade of filteredTrades) {
    const sym = trade.symbol ? trade.symbol.trim().toUpperCase() : 'UNKNOWN';
    const current = byInstrumentMap.get(sym) || {
      instrument: sym,
      trade_count: 0,
      wins: 0,
      losses: 0,
      total_pnl: 0,
      reviewed_count: 0,
      dq_scores: []
    };
    current.trade_count += 1;
    const pnl = Number(trade.realized_pnl);
    if (Number.isFinite(pnl)) {
      current.total_pnl += pnl;
      if (pnl > 0) current.wins += 1;
      else if (pnl < 0) current.losses += 1;
    }
    const rev = reviewsByTradeId.get(trade.id);
    if (rev) {
      current.reviewed_count += 1;
      if (Number.isFinite(rev.decision_quality_score)) {
        current.dq_scores.push(rev.decision_quality_score);
      }
    }
    byInstrumentMap.set(sym, current);
  }

  const performanceByInstrument = [...byInstrumentMap.values()].map((item) => {
    const avgDq = item.dq_scores.length > 0
      ? Math.round(item.dq_scores.reduce((s, v) => s + v, 0) / item.dq_scores.length)
      : null;
    return {
      instrument: item.instrument,
      sample_size: item.trade_count,
      total_pnl: Math.round(item.total_pnl * 100) / 100,
      win_rate_pct: item.wins + item.losses > 0 ? Math.round((item.wins / (item.wins + item.losses)) * 100) : null,
      average_decision_quality: avgDq,
      confidence_tier: classifyConfidenceTier(item.trade_count),
      calculation_method: 'Aggregation of realized P&L and decision quality score grouped by trade symbol',
      limitations: item.trade_count < 3 ? 'Small sample: cannot distinguish instrument edge from random luck.' : null
    };
  }).sort((a, b) => b.sample_size - a.sample_size);

  // 5. Performance & Adherence by Strategy and Strategy Version
  const byVersionMap = new Map();
  for (const trade of filteredTrades) {
    const vId = trade.strategy_version_id || 'unversioned';
    const sId = trade.strategy_id || 'unknown';
    const current = byVersionMap.get(vId) || {
      strategy_id: sId,
      strategy_version_id: vId,
      trade_count: 0,
      total_pnl: 0,
      dq_scores: [],
      broken_rules: 0
    };
    current.trade_count += 1;
    const pnl = Number(trade.realized_pnl);
    if (Number.isFinite(pnl)) current.total_pnl += pnl;

    const rev = reviewsByTradeId.get(trade.id);
    if (rev) {
      if (Number.isFinite(rev.decision_quality_score)) current.dq_scores.push(rev.decision_quality_score);
      const brokenInTrade = (rev.dimensions || []).filter((d) => d.status === 'broken').length;
      current.broken_rules += brokenInTrade;
    }
    byVersionMap.set(vId, current);
  }

  const performanceByVersion = [...byVersionMap.values()].map((v) => {
    const avgDq = v.dq_scores.length > 0
      ? Math.round(v.dq_scores.reduce((s, val) => s + val, 0) / v.dq_scores.length)
      : null;
    return {
      strategy_id: v.strategy_id,
      strategy_version_id: v.strategy_version_id,
      sample_size: v.trade_count,
      total_pnl: Math.round(v.total_pnl * 100) / 100,
      average_decision_quality: avgDq,
      total_broken_dimensions: v.broken_rules,
      confidence_tier: classifyConfidenceTier(v.trade_count),
      calculation_method: 'Aggregation of trade outcomes and rule violations grouped by confirmed strategy version ID',
      limitations: v.trade_count < 3 ? 'Insufficient version trades to reliably benchmark rule changes.' : null
    };
  });

  // 6. Emotional State Associations (Careful non-causal correlation)
  const emotionMap = new Map();
  for (const trade of filteredTrades) {
    const emotion = extractEmotion(trade);
    if (!emotion) continue;

    const current = emotionMap.get(emotion) || {
      emotion,
      sample_size: 0,
      dq_scores: [],
      pnl_sum: 0,
      broken_rules_count: 0
    };
    current.sample_size += 1;
    const pnl = Number(trade.realized_pnl);
    if (Number.isFinite(pnl)) current.pnl_sum += pnl;

    const rev = reviewsByTradeId.get(trade.id);
    if (rev) {
      if (Number.isFinite(rev.decision_quality_score)) current.dq_scores.push(rev.decision_quality_score);
      current.broken_rules_count += (rev.dimensions || []).filter((d) => d.status === 'broken').length;
    }
    emotionMap.set(emotion, current);
  }

  const emotionalStatePatterns = [...emotionMap.values()].map((item) => {
    const avgDq = item.dq_scores.length > 0
      ? Math.round(item.dq_scores.reduce((sum, s) => sum + s, 0) / item.dq_scores.length)
      : null;
    return {
      emotion: item.emotion,
      observations: item.sample_size,
      average_decision_quality: avgDq,
      total_realized_pnl: Math.round(item.pnl_sum * 100) / 100,
      broken_rules_observed: item.broken_rules_count,
      confidence_tier: classifyConfidenceTier(item.sample_size),
      calculation_method: 'Observed co-occurrence of trader-recorded emotional state with deterministic scores and outcomes',
      limitations: 'Correlation does not establish causation. Emotional records are self-reported and reflect mindset at entry.'
    };
  }).sort((a, b) => b.observations - a.observations);

  return {
    analysis_meta: {
      generated_at: new Date().toISOString(),
      date_range: dateRange,
      total_trades_analyzed: totalTradesCount,
      reviewed_trades_analyzed: reviewedCount,
      filter: {
        start_date: startDate || null,
        end_date: endDate || null,
        strategy_id: strategyId || null,
        strategy_version_id: strategyVersionId || null
      }
    },
    frequently_broken_rules: frequentlyBrokenRules,
    risk_management: riskManagementSummary,
    discipline_trend: disciplineTrend,
    by_instrument: performanceByInstrument,
    by_strategy_version: performanceByVersion,
    emotional_state_patterns: emotionalStatePatterns
  };
}

/**
 * Builds user prompt for OpenRouter AI to interpret the personal trading intelligence report.
 * Strictly provides deterministic numbers and instructions not to fabricate numbers.
 */
export function buildIntelligencePrompt(report) {
  const meta = report.analysis_meta;
  const brokenRules = report.frequently_broken_rules.map((r) =>
    `- [${r.confidence_tier}] ${r.label}: broken ${r.broken_count} times out of ${r.sample_size} assessed trades (${r.violation_rate_pct}% rate)`
  ).join('\n') || 'None recorded.';

  const instruments = report.by_instrument.map((inst) =>
    `- ${inst.instrument} (${inst.confidence_tier}): ${inst.sample_size} trades, P&L $${inst.total_pnl}, Avg DQ ${inst.average_decision_quality ?? '—'}`
  ).join('\n') || 'No trades recorded.';

  const emotions = report.emotional_state_patterns.map((e) =>
    `- Emotion "${e.emotion}" (${e.confidence_tier}): ${e.observations} observations, Avg DQ ${e.average_decision_quality ?? '—'}, ${e.broken_rules_observed} rule breaches observed`
  ).join('\n') || 'No emotional states recorded in evidence.';

  const trend = report.discipline_trend;
  const trendDesc = trend.trend_direction === 'insufficient_history'
    ? 'Insufficient history (< 4 reviewed trades)'
    : `${trend.trend_direction.toUpperCase()} (Earlier Avg DQ: ${trend.earlier_avg_score}, Recent Avg DQ: ${trend.recent_avg_score})`;

  return `Please interpret these personal trading pattern findings for the trader.

DATA CONTEXT:
- Total Trades: ${meta.total_trades_analyzed}
- Reviewed Trades: ${meta.reviewed_trades_analyzed}
- Date Range: ${meta.date_range.start || 'Start'} to ${meta.date_range.end || 'Present'}
- Filter Applied: ${meta.filter.strategy_id ? `Strategy ID ${meta.filter.strategy_id}` : 'All Strategies'}

DETERMINISTIC PATTERN FINDINGS:
1. Frequently Broken Rules:
${brokenRules}

2. Risk Management Discipline:
- Assessed: ${report.risk_management.assessed_trades} trades
- Violations: ${report.risk_management.violations}
- Adherence Rate: ${report.risk_management.adherence_pct ?? 'N/A'}%
- Confidence Tier: ${report.risk_management.confidence_tier}

3. Discipline Trend Over Time:
- Trajectory: ${trendDesc}
- Confidence Tier: ${trend.confidence_tier}

4. Breakdown by Instrument:
${instruments}

5. Recorded Emotional State Associations:
${emotions}

CRITICAL RULES FOR YOUR EXPLANATION:
1. Ground ALL statements in the exact numbers above. NEVER invent or hallucinate metrics, frequencies, or percentages.
2. Respect confidence tiers: If a finding is labeled INSUFFICIENT_DATA or EARLY_PATTERN, explicitly warn the trader that sample size is small.
3. Distinguish CORRELATION from CAUSATION: Do NOT state that an emotional state "caused" a loss or mistake. State only that they were observed together.
4. Provide one specific, actionable discipline coaching recommendation based on the top repeated pattern.

OUTPUT SCHEMA (valid JSON):
{
  "summary": "Clear, objective explanation of the top discovered personal patterns in under 700 characters.",
  "top_pattern": "Specific identification of the most frequent rule breach or behavioral inconsistency with exact counts",
  "confidence_evaluation": "Transparent explanation of which findings have stronger evidence vs which are preliminary early patterns",
  "coaching_recommendation": "One practical, evidence-based improvement for next week",
  "actions": [
    "First practical action to curb the recurring mistake",
    "Second practical action"
  ]
}`;
}
