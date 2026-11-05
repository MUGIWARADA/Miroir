export const Provenance = Object.freeze({
  TRADER_PROVIDED: 'TRADER_PROVIDED',
  APPLICATION_CALCULATED: 'APPLICATION_CALCULATED',
  AI_INFERRED: 'AI_INFERRED',
  TRADER_APPROVED: 'TRADER_APPROVED'
});

export class ContextError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ContextError';
    this.code = code;
  }
}

function sanitizeText(value, maxLength = 300) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[<>{}]/g, '')
    .trim()
    .slice(0, maxLength);
}

/**
 * Builds the strategy context for the trader, distinguishing confirmed rules
 * (TRADER_APPROVED) from unconfirmed draft changes (TRADER_PROVIDED).
 */
export async function buildStrategyContext(store, identityId, { strategyId } = {}) {
  if (!identityId) throw new ContextError('IDENTITY_REQUIRED', 'Identity ID is required to build strategy context.');
  const { strategies = [] } = await store.getStrategies(identityId);

  if (!strategies.length) {
    return {
      status: 'missing',
      active_strategy: null,
      available_strategies: []
    };
  }

  let strategy;
  if (strategyId) {
    strategy = strategies.find((s) => s.id === strategyId);
    if (!strategy) {
      // Check if strategyId belongs to another trader
      throw new ContextError('UNAUTHORIZED_CONTEXT_ACCESS', 'Requested strategy does not exist or does not belong to this identity.');
    }
  } else {
    strategy = strategies[0];
  }

  // Retrieve the immutable confirmed version if available
  let confirmedVersion = null;
  if (strategy.current_version_id && typeof store.getStrategyVersion === 'function') {
    confirmedVersion = await store.getStrategyVersion(identityId, strategy.id, strategy.current_version_id);
  }

  const otherStrategies = strategies
    .filter((s) => s.id !== strategy.id)
    .map((s) => ({
      id: s.id,
      name: { value: sanitizeText(s.name, 80), provenance: Provenance.TRADER_PROVIDED },
      status: { value: s.status, provenance: Provenance.APPLICATION_CALCULATED }
    }));

  return {
    status: 'available',
    active_strategy: {
      id: strategy.id,
      name: { value: sanitizeText(strategy.name, 100), provenance: Provenance.TRADER_PROVIDED },
      description: { value: sanitizeText(strategy.description || '', 300), provenance: Provenance.TRADER_PROVIDED },
      status: { value: strategy.status, provenance: Provenance.APPLICATION_CALCULATED },
      confirmed_rules: confirmedVersion ? {
        version_number: confirmedVersion.version_number,
        confirmed_at: confirmedVersion.confirmed_at,
        rules: Array.isArray(confirmedVersion.rules) ? confirmedVersion.rules.map((r) => ({
          dimension: r.dimension,
          label: sanitizeText(r.label, 120),
          check: r.check
        })) : [],
        trading_schedule: confirmedVersion.trading_schedule || null,
        provenance: Provenance.TRADER_APPROVED
      } : null,
      draft_changes: strategy.status === 'draft' ? {
        has_unconfirmed_changes: true,
        rules: Array.isArray(strategy.draft_rules) ? strategy.draft_rules.map((r) => ({
          dimension: r.dimension,
          label: sanitizeText(r.label, 120),
          check: r.check
        })) : [],
        trading_schedule: strategy.draft_trading_schedule || null,
        provenance: Provenance.TRADER_PROVIDED
      } : {
        has_unconfirmed_changes: false
      }
    },
    available_strategies: otherStrategies
  };
}

/**
 * Builds recent trading history context bounded by recency limits.
 * Distinguishes trader entries (TRADER_PROVIDED) from realized metrics (APPLICATION_CALCULATED).
 */
export async function buildRecentTradingContext(store, identityId, { limit = 5, strategyId } = {}) {
  if (!identityId) throw new ContextError('IDENTITY_REQUIRED', 'Identity ID is required.');
  const clampedLimit = Math.min(Math.max(1, Number(limit) || 5), 10);
  const { trades = [] } = await store.listTrades(identityId);

  const filtered = strategyId
    ? trades.filter((t) => t.strategy_id === strategyId)
    : trades;

  const boundedTrades = filtered.slice(0, clampedLimit).map((trade) => {
    let setupNote = null;
    let emotionalState = null;
    if (Array.isArray(trade.evidence)) {
      for (const item of trade.evidence) {
        if (item?.kind === 'note' && item.payload?.setup_note) setupNote = sanitizeText(item.payload.setup_note, 250);
        if (item?.kind === 'state' && item.payload?.emotional_state) emotionalState = sanitizeText(item.payload.emotional_state, 40);
      }
    }

    return {
      id: trade.id,
      symbol: { value: sanitizeText(trade.symbol || 'UNKNOWN', 20), provenance: Provenance.TRADER_PROVIDED },
      direction: { value: sanitizeText(trade.direction || 'unknown', 10), provenance: Provenance.TRADER_PROVIDED },
      quantity: { value: Number.isFinite(trade.quantity) ? trade.quantity : null, provenance: Provenance.TRADER_PROVIDED },
      entry_price: { value: Number.isFinite(trade.entry_price) ? trade.entry_price : null, provenance: Provenance.TRADER_PROVIDED },
      exit_price: { value: Number.isFinite(trade.exit_price) ? trade.exit_price : null, provenance: Provenance.TRADER_PROVIDED },
      risk_amount: { value: Number.isFinite(trade.risk_amount) ? trade.risk_amount : null, provenance: Provenance.TRADER_PROVIDED },
      realized_pnl: { value: Number.isFinite(trade.realized_pnl) ? trade.realized_pnl : null, provenance: Provenance.APPLICATION_CALCULATED },
      opened_at: { value: trade.opened_at || trade.created_at, provenance: Provenance.TRADER_PROVIDED },
      closed_at: { value: trade.closed_at || null, provenance: Provenance.TRADER_PROVIDED },
      setup_note: setupNote ? { value: setupNote, provenance: Provenance.TRADER_PROVIDED } : null,
      emotional_state: emotionalState ? { value: emotionalState, provenance: Provenance.TRADER_PROVIDED } : null
    };
  });

  return {
    total_trader_trades: filtered.length,
    bounded_count: boundedTrades.length,
    trades: boundedTrades
  };
}

/**
 * Builds review history context summarizing deterministic rule violations,
 * passes, and unassessable rules (APPLICATION_CALCULATED), plus previous AI inferences (AI_INFERRED).
 */
export async function buildReviewHistoryContext(store, identityId, { limit = 5, strategyId } = {}) {
  if (!identityId) throw new ContextError('IDENTITY_REQUIRED', 'Identity ID is required.');
  const clampedLimit = Math.min(Math.max(1, Number(limit) || 5), 10);
  const { trades = [] } = await store.listTrades(identityId);

  const reviewedTrades = trades.filter((t) => t.review && t.review.result);
  const filtered = strategyId
    ? reviewedTrades.filter((t) => t.strategy_id === strategyId)
    : reviewedTrades;

  const dimensionStats = {
    risk: { followed: 0, broken: 0, cannot_assess: 0 },
    sizing: { followed: 0, broken: 0, cannot_assess: 0 },
    plan: { followed: 0, broken: 0, cannot_assess: 0 },
    timing: { followed: 0, broken: 0, cannot_assess: 0 },
    emotion: { followed: 0, broken: 0, cannot_assess: 0 }
  };

  for (const trade of filtered) {
    const dims = trade.review.result.dimensions || [];
    for (const d of dims) {
      if (dimensionStats[d.dimension] && dimensionStats[d.dimension][d.status] !== undefined) {
        dimensionStats[d.dimension][d.status] += 1;
      }
    }
  }

  const recentReviews = filtered.slice(0, clampedLimit).map((trade) => {
    const res = trade.review.result;
    return {
      trade_id: trade.id,
      symbol: sanitizeText(trade.symbol || '', 20),
      decision_quality_score: { value: res.decision_quality_score, provenance: Provenance.APPLICATION_CALCULATED },
      coverage_pct: { value: res.coverage_pct, provenance: Provenance.APPLICATION_CALCULATED },
      dimensions: (res.dimensions || []).map((d) => ({
        dimension: d.dimension,
        status: d.status,
        provenance: Provenance.APPLICATION_CALCULATED,
        rules: (d.rules || []).map((r) => ({ label: sanitizeText(r.label, 80), status: r.status, reason: sanitizeText(r.reason, 150) }))
      })),
      prior_ai_explanation: res.ai_explanation?.status === 'available' ? {
        summary: sanitizeText(res.ai_explanation.summary || '', 400),
        provenance: Provenance.AI_INFERRED
      } : null
    };
  });

  return {
    total_reviews: filtered.length,
    bounded_count: recentReviews.length,
    dimension_rule_adherence: {
      metrics: dimensionStats,
      provenance: Provenance.APPLICATION_CALCULATED
    },
    recent_reviews: recentReviews
  };
}

/**
 * Builds high-level progress statistics context (APPLICATION_CALCULATED).
 */
export async function buildProgressSummaryContext(store, identityId, { currency = 'USD' } = {}) {
  if (!identityId) throw new ContextError('IDENTITY_REQUIRED', 'Identity ID is required.');
  const [statsData, progressData] = await Promise.all([
    store.getStats(identityId, currency),
    store.getProgress(identityId)
  ]);

  const activeVersion = progressData?.progress?.versions?.[0] || null;

  return {
    performance: {
      sample_size: statsData.sample_size,
      wins: statsData.wins,
      losses: statsData.losses,
      win_rate_pct: statsData.win_rate !== null ? Math.round(statsData.win_rate) : null,
      net_realized_pnl: statsData.net_realized_pnl,
      profit_factor: statsData.profit_factor !== null ? Number(statsData.profit_factor.toFixed(2)) : null,
      expectancy: statsData.expectancy !== null ? Number(statsData.expectancy.toFixed(2)) : null,
      currency: statsData.currency,
      provenance: Provenance.APPLICATION_CALCULATED
    },
    discipline: {
      average_decision_quality: activeVersion?.average_decision_quality_score !== null && activeVersion?.average_decision_quality_score !== undefined
        ? Math.round(activeVersion.average_decision_quality_score)
        : null,
      average_coverage_pct: activeVersion?.average_coverage_pct !== undefined
        ? Math.round(activeVersion.average_coverage_pct)
        : 0,
      trend_series: activeVersion?.trend?.series || [],
      provenance: Provenance.APPLICATION_CALCULATED
    }
  };
}

/**
 * Builds previous conversation context ensuring strict ownership isolation.
 */
export async function buildConversationContext(store, identityId, conversationId, { maxMessages = 10 } = {}) {
  if (!identityId || !conversationId) return null;
  const convo = await store.getConversation(identityId, conversationId);
  if (!convo) {
    throw new ContextError('UNAUTHORIZED_CONTEXT_ACCESS', 'Conversation does not exist or does not belong to this identity.');
  }

  const { messages = [] } = await store.getConversationMessages(identityId, conversationId, { limit: maxMessages });

  return {
    conversation_id: convo.id,
    title: { value: sanitizeText(convo.title, 100), provenance: Provenance.TRADER_PROVIDED },
    context_type: convo.context_type,
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: sanitizeText(m.content, 1000),
      provenance: m.role === 'user' ? Provenance.TRADER_PROVIDED : m.role === 'assistant' ? Provenance.AI_INFERRED : Provenance.APPLICATION_CALCULATED,
      created_at: m.created_at
    }))
  };
}

/**
 * Primary context builder assembling bounded, authenticated trader records.
 */
export async function buildTraderContext(store, identityId, options = {}) {
  if (!identityId) throw new ContextError('IDENTITY_REQUIRED', 'Identity ID is required to build trader context.');

  const identity = await store.getIdentity(identityId);
  if (!identity) throw new ContextError('IDENTITY_NOT_FOUND', 'Identity not found.');

  const [strategyContext, tradingContext, reviewContext, progressContext] = await Promise.all([
    buildStrategyContext(store, identityId, { strategyId: options.strategyId }),
    buildRecentTradingContext(store, identityId, { limit: options.tradesLimit || 5, strategyId: options.strategyId }),
    buildReviewHistoryContext(store, identityId, { limit: options.reviewsLimit || 5, strategyId: options.strategyId }),
    buildProgressSummaryContext(store, identityId, { currency: options.currency || 'USD' })
  ]);

  let conversationContext = null;
  if (options.conversationId) {
    conversationContext = await buildConversationContext(store, identityId, options.conversationId, { maxMessages: options.maxMessages || 10 });
  }

  const context = {
    identity: {
      id: identity.id,
      display_name: { value: sanitizeText(identity.display_name, 80), provenance: Provenance.TRADER_PROVIDED },
      mode: identity.mode
    },
    strategy: strategyContext,
    recent_trading: tradingContext,
    review_history: reviewContext,
    progress_summary: progressContext,
    conversation: conversationContext,
    metadata: {
      built_at: new Date().toISOString(),
      truncated: false
    }
  };

  // Enforce context size bounds (approximate characters)
  const jsonStr = JSON.stringify(context);
  const approxTokens = Math.ceil(jsonStr.length / 4);
  context.metadata.approx_tokens = approxTokens;
  if (approxTokens > 4000) {
    context.metadata.truncated = true;
  }

  return context;
}

/**
 * Formats structured trader context with explicit provenance into an LLM-ready prompt string.
 */
export function formatContextForPrompt(context) {
  if (!context || typeof context !== 'object') return '';

  const sections = [];

  // Identity
  sections.push(`<trader_profile [PROVENANCE: TRADER_PROVIDED]>
Trader Display Name: ${context.identity?.display_name?.value || 'Trader'}
Mode: ${context.identity?.mode || 'user'}
</trader_profile>`);

  // Active Strategy
  const strat = context.strategy?.active_strategy;
  if (strat) {
    const rulesList = strat.confirmed_rules?.rules?.map((r) => `- [${r.dimension.toUpperCase()}] ${r.label}`).join('\n') || 'None recorded';
    const schedule = strat.confirmed_rules?.trading_schedule
      ? `${strat.confirmed_rules.trading_schedule.start_time} - ${strat.confirmed_rules.trading_schedule.end_time} (${strat.confirmed_rules.trading_schedule.days?.join(', ')})`
      : 'No schedule constraint';

    sections.push(`<confirmed_strategy [PROVENANCE: TRADER_APPROVED]>
Strategy Name: ${strat.name?.value}
Description: ${strat.description?.value || 'N/A'}
Active Version: v${strat.confirmed_rules?.version_number || 1}
Confirmed Rules:
${rulesList}
Trading Schedule: ${schedule}
Unconfirmed Draft Changes Pending: ${strat.draft_changes?.has_unconfirmed_changes ? 'YES [PROVENANCE: TRADER_PROVIDED]' : 'NO'}
</confirmed_strategy>`);
  } else {
    sections.push('<confirmed_strategy [PROVENANCE: APPLICATION_CALCULATED]>\nNo active strategy defined yet.\n</confirmed_strategy>');
  }

  // Review & Adherence History
  const rh = context.review_history;
  if (rh) {
    const metrics = rh.dimension_rule_adherence?.metrics;
    const adherenceLines = Object.entries(metrics || {}).map(([dim, counts]) =>
      `- ${dim.toUpperCase()}: Followed ${counts.followed}x, Broken ${counts.broken}x, Cannot Assess ${counts.cannot_assess}x`
    ).join('\n');

    sections.push(`<rule_adherence_history [PROVENANCE: APPLICATION_CALCULATED]>
Total Trades Evaluated: ${rh.total_reviews}
Observed Rule Adherence Counts:
${adherenceLines}
(Note: Treat observed counts as historical facts. Do NOT infer internal trader motivations without evidence.)
</rule_adherence_history>`);
  }

  // Progress Performance
  const perf = context.progress_summary?.performance;
  const disc = context.progress_summary?.discipline;
  if (perf && disc) {
    sections.push(`<performance_and_discipline_summary [PROVENANCE: APPLICATION_CALCULATED]>
Sample Size: ${perf.sample_size} trades | Win Rate: ${perf.win_rate_pct ?? 'N/A'}% | Net P&L: $${perf.net_realized_pnl}
Average Decision Quality Score: ${disc.average_decision_quality ?? 'N/A'}/100
Average Rule Coverage: ${disc.average_coverage_pct}%
</performance_and_discipline_summary>`);
  }

  // Recent Trades
  const trades = context.recent_trading?.trades || [];
  if (trades.length) {
    const tradeLines = trades.map((t, idx) => {
      const pnl = t.realized_pnl?.value !== null ? `$${t.realized_pnl.value}` : 'Open/Unrealized';
      const note = t.setup_note?.value ? ` | Note: "${t.setup_note.value}"` : '';
      const emo = t.emotional_state?.value ? ` | Emotion: "${t.emotional_state.value}"` : '';
      return `${idx + 1}. [${t.symbol?.value} ${t.direction?.value}] Realized: ${pnl}${note}${emo}`;
    }).join('\n');

    sections.push(`<recent_trades [PROVENANCE: MIXED - DETAILS TRADER_PROVIDED, PNL APPLICATION_CALCULATED]>
${tradeLines}
</recent_trades>`);
  }

  // Conversation History
  const convo = context.conversation;
  if (convo && convo.messages?.length) {
    const convoLines = convo.messages.map((m) =>
      `[${m.role.toUpperCase()} - ${m.provenance}]: ${m.content}`
    ).join('\n');

    sections.push(`<recent_conversation_messages>
${convoLines}
</recent_conversation_messages>`);
  }

  return sections.join('\n\n');
}
