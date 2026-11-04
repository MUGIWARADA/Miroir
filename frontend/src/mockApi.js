
const MOCK_SESSION = {
  token: "fixture-token",
  token_type: "Bearer",
  expires_at: "2026-11-04T12:00:00.000Z",
  identity: { id: "c7549069", mode: "demo", display_name: "Demo trader" },
  demo_data: { strategy_id: "f04d8a31", strategy_version_id: "2f580be1", trade_count: 6, review_count: 6 }
};

const MOCK_STRATEGY = {
  id: "03ecfa74-f489-4ac8-93dc-325f72544eb9",
  name: "Demo Breakout Plan",
  draft_rules: [
    { id: 'risk-limit', dimension: 'risk', label: 'Risk at most 100 USD per trade', check: { type: 'max_risk_amount', amount: 100 } },
    { id: 'size-limit', dimension: 'sizing', label: 'Position notional at most 10000 USD', check: { type: 'max_notional', amount: 10000 } },
    { id: 'setup-note', dimension: 'plan', label: 'Record a setup note before entry', check: { type: 'required_evidence', field: 'setup_note' } },
    { id: 'calm-state', dimension: 'emotion', label: 'Explicitly record a calm emotional state', check: { type: 'evidence_equals', field: 'emotional_state', value: 'calm' } },
  ],
  draft_trading_schedule: {
    days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
    start_time: "08:00",
    end_time: "16:00",
    timezone: "UTC"
  },
  current_version_id: "2f580be1-6424-492e-80f3-306f04677d2a",
};

// Store the last trade submitted
let LAST_TRADE_PAYLOAD = null;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const mockApi = {
  createDemoSession: async () => {
    await delay(800);
    return MOCK_SESSION;
  },

  getStrategies: async () => {
    await delay(400);
    return { strategies: [MOCK_STRATEGY] };
  },

  createTrade: async (payload) => {
    await delay(600);
    LAST_TRADE_PAYLOAD = payload;
    return { trade: { id: "trade-mock-id", ...payload } };
  },

  getTrades: async ({ limit = 100, offset = 0 } = {}) => {
    await delay(300);
    const items = LAST_TRADE_PAYLOAD
      ? [{ id: 'trade-mock-id', ...LAST_TRADE_PAYLOAD, realized_pnl: null }]
      : [];
    return { items: items.slice(offset, offset + limit), total: items.length, limit, offset };
  },

  requestReview: async () => {
    await delay(1200);

    // If no trade was submitted, fallback to missing evidence
    if (!LAST_TRADE_PAYLOAD) {
      LAST_TRADE_PAYLOAD = { evidence: [] };
    }

    const evidence = LAST_TRADE_PAYLOAD.evidence || [];
    const hasSetupNote = evidence.some(e => e.kind === 'note' && e.payload.setup_note);
    const hasEmotion = evidence.some(e => e.kind === 'state' && e.payload.emotional_state);
    const emotionValue = evidence.find(e => e.kind === 'state')?.payload.emotional_state;
    const isEmotionCalm = emotionValue === 'calm';

    const dimensions = [
      { dimension: "risk", status: "followed", score_pct: 100, rules: [{ rule_id: "risk", label: "Risk limit", status: "followed", reason: "Initial risk was within the allowed limit." }] },
      { dimension: "sizing", status: "followed", score_pct: 100, rules: [{ rule_id: "size", label: "Size limit", status: "followed", reason: "Position notional was within the allowed limit." }] },
      { 
        dimension: "plan", 
        status: hasSetupNote ? "followed" : "cannot_assess", 
        score_pct: hasSetupNote ? 100 : null, 
        rules: [{ rule_id: "plan", label: "Record a setup note", status: hasSetupNote ? "followed" : "cannot_assess", reason: hasSetupNote ? "Evidence field 'setup_note' is present." : "Evidence field 'setup_note' is missing; not counted as a breach." }] 
      },
      { dimension: "timing", status: "followed", score_pct: 100, rules: [{ rule_id: "timing", label: "Trading hours", status: "followed", reason: "Trade was opened inside the strategy's allowed trading schedule." }] },
      { 
        dimension: "emotion", 
        status: !hasEmotion ? "cannot_assess" : (isEmotionCalm ? "followed" : "broken"), 
        score_pct: !hasEmotion ? null : (isEmotionCalm ? 100 : 0), 
        rules: [{ rule_id: "emotion", label: "Explicitly record a calm emotional state", status: !hasEmotion ? "cannot_assess" : (isEmotionCalm ? "followed" : "broken"), reason: !hasEmotion ? "Evidence field 'emotional_state' is missing." : (isEmotionCalm ? "You recorded a calm state." : `You recorded '${emotionValue}' instead of 'calm'.`) }] 
      },
    ];

    let totalAssessableWeight = 0;
    let earnedWeight = 0;
    const weights = { risk: 30, sizing: 20, plan: 25, timing: 15, emotion: 10 };

    dimensions.forEach(d => {
      if (d.status !== 'cannot_assess') {
        totalAssessableWeight += weights[d.dimension];
        if (d.status === 'followed') earnedWeight += weights[d.dimension];
      }
    });

    const score = totalAssessableWeight > 0 ? Math.round((earnedWeight / totalAssessableWeight) * 100) : null;
    const coverage = Math.round((totalAssessableWeight / 100) * 100);

    return {
      review: {
        result: {
          decision_quality_score: score,
          coverage_pct: coverage,
          dimensions,
          coaching: {
            summary: `Decision Quality ${score}/100. ${hasSetupNote && isEmotionCalm ? 'You followed every rule.' : 'Some rules could not be assessed or were broken.'}`,
            actions: [
              ...(!hasSetupNote ? ["Add a setup note next time to increase your coverage."] : []),
              ...(hasEmotion && !isEmotionCalm ? ["You recorded an emotional state other than 'calm'. Work on staying disciplined."] : []),
              ...(hasSetupNote && isEmotionCalm ? ["Keep applying the same rules and log evidence on every trade."] : [])
            ]
          }
        }
      }
    };
  },

  getStats: async () => {
    await delay(400);
    return { 
      stats: { 
        currency: "USD", sample_size: 1, wins: 1, losses: 0, win_rate: 100, 
        net_realized_pnl: 100, profit_factor: 0, expectancy: 100, 
        cumulative_realized_pnl_curve: [{ trade_id: "1", closed_at: new Date().toISOString(), cumulative_realized_pnl: 100 }] 
      } 
    };
  },

  getProgress: async () => {
    await delay(400);
    // If we have a payload, we have 1 trade, otherwise 0.
    const tradeCount = LAST_TRADE_PAYLOAD ? 1 : 0;
    return { 
      progress: { 
        versions: tradeCount > 0 ? [{
          assessed_trades: tradeCount,
          average_decision_quality_score: 100,
          average_coverage_pct: 100,
          trend: { eligible: false }, // Less than 5 trades
          dimension_counts: {
            risk: { followed: 1, broken: 0, cannot_assess: 0 },
            sizing: { followed: 1, broken: 0, cannot_assess: 0 },
            plan: { followed: 1, broken: 0, cannot_assess: 0 },
            timing: { followed: 1, broken: 0, cannot_assess: 0 },
            emotion: { followed: 1, broken: 0, cannot_assess: 0 }
          }
        }] : []
      } 
    };
  }
};