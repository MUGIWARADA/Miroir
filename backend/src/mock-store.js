import { randomUUID } from 'node:crypto';
import { DEMO_STRATEGY } from './fixtures.js';
import { evaluateTrade, DIMENSION_ORDER } from './scoring.js';
import { buildTrendSeries } from './analytics.js';

const daysAgo = (days, hour = 10) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString();
};

export class MockStore {
  constructor({ sessionTtlHours = 24 } = {}) {
    this.sessionTtlHours = sessionTtlHours;
    this.sessions = new Map();
    this.identities = new Map();
    this.strategies = new Map(); // identityId -> Map<strategyId, strategy>
    this.strategyVersions = new Map(); // strategyId -> Map<versionId, version>
    this.trades = new Map();
    this.reviews = new Map();
    this.conversations = new Map(); // identityId -> Map<conversationId, conversation>
    this.messages = new Map(); // conversationId -> Array<message>
  }

  async createDemoSession(displayName = 'Demo Trader') {
    const identityId = randomUUID();
    const token = randomUUID();
    const strategyId = randomUUID();
    const versionId = randomUUID();
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + this.sessionTtlHours * 3600_000).toISOString();

    const strategy = {
      ...structuredClone(DEMO_STRATEGY),
      id: strategyId,
      identity_id: identityId,
      current_version_id: versionId,
      status: 'confirmed',
      version_number: 1,
      created_at: now,
      updated_at: now
    };

    const initialVersion = {
      id: versionId,
      strategy_id: strategyId,
      identity_id: identityId,
      version_number: 1,
      name: strategy.name,
      rules: structuredClone(strategy.draft_rules),
      trading_schedule: structuredClone(strategy.draft_trading_schedule),
      snapshot: {
        name: strategy.name,
        description: strategy.description,
        rules: structuredClone(strategy.draft_rules),
        trading_schedule: structuredClone(strategy.draft_trading_schedule),
        markets: structuredClone(strategy.markets),
        timeframes: structuredClone(strategy.timeframes),
        entry_conditions: structuredClone(strategy.entry_conditions),
        stop_loss_method: structuredClone(strategy.stop_loss_method),
        exit_plan: structuredClone(strategy.exit_plan),
        risk_rules: structuredClone(strategy.risk_rules),
        position_sizing_rules: structuredClone(strategy.position_sizing_rules),
        other_restrictions: structuredClone(strategy.other_restrictions),
        preferences: structuredClone(strategy.preferences)
      },
      change_summary: 'Initial confirmed demo version',
      confirmed_at: now
    };

    const identity = { id: identityId, mode: 'demo', display_name: displayName };
    this.identities.set(identityId, identity);
    this.sessions.set(token, { identity_id: identityId, expires_at: expiresAt });

    const strategyMap = new Map();
    strategyMap.set(strategyId, strategy);
    this.strategies.set(identityId, strategyMap);

    const versionMap = new Map();
    versionMap.set(versionId, initialVersion);
    this.strategyVersions.set(strategyId, versionMap);

    this.trades.set(identityId, []);
    this.reviews.set(identityId, new Map());
    this.conversations.set(identityId, new Map());
    await this.seedSampleTrades(identityId, strategy);

    return {
      token,
      token_type: 'Bearer',
      expires_at: expiresAt,
      identity,
      demo_data: { strategy_id: strategy.id, strategy_version_id: strategy.current_version_id, trade_count: 3, review_count: 3 }
    };
  }

  async seedSampleTrades(identityId, strategy) {
    const samples = [
      { symbol: 'BTC/USDT', direction: 'long', quantity: 0.5, entry_price: 63000, exit_price: 65000, realized_pnl: 1000, risk_amount: 80, opened_at: daysAgo(2, 10), closed_at: daysAgo(2, 14), evidence: [{ kind: 'note', payload: { setup_note: 'Breakout above weekly resistance with volume confirmation.' } }, { kind: 'state', payload: { emotional_state: 'calm' } }] },
      { symbol: 'ETH/USDT', direction: 'short', quantity: 2, entry_price: 3500, exit_price: 3550, realized_pnl: -100, risk_amount: 120, opened_at: daysAgo(1, 11), closed_at: daysAgo(1, 12), evidence: [{ kind: 'note', payload: { setup_note: 'Failed retest at the range high.' } }, { kind: 'state', payload: { emotional_state: 'anxious' } }] },
      { symbol: 'SOL/USDT', direction: 'long', quantity: 10, entry_price: 150, exit_price: 154.5, realized_pnl: 45, risk_amount: 60, opened_at: daysAgo(3, 9), closed_at: daysAgo(3, 11), evidence: [{ kind: 'note', payload: { setup_note: 'Higher-low continuation setup.' } }, { kind: 'state', payload: { emotional_state: 'calm' } }] }
    ];
    for (const payload of samples) {
      const trade = { id: randomUUID(), identity_id: identityId, strategy_id: strategy.id, strategy_version_id: strategy.current_version_id, ...payload, created_at: payload.opened_at };
      this.trades.get(identityId).push(trade);
      this.reviews.get(identityId).set(trade.id, { id: randomUUID(), trade_id: trade.id, result: evaluateTrade(trade, strategy), created_at: payload.closed_at });
    }
  }

  async authenticate(token) {
    const session = this.sessions.get(token);
    if (!session || new Date(session.expires_at) <= new Date()) return null;
    return this.identities.get(session.identity_id) || null;
  }

  async revokeSession(token) { this.sessions.delete(token); }

  async getIdentity(identityId) {
    const identity = this.identities.get(identityId);
    return identity ? structuredClone(identity) : null;
  }

  async getStrategies(identityId) {
    const map = this.strategies.get(identityId) || new Map();
    return { strategies: Array.from(map.values()).map((s) => structuredClone(s)) };
  }

  async getStrategy(identityId, strategyId) {
    const s = this.strategies.get(identityId)?.get(strategyId);
    return s ? structuredClone(s) : null;
  }

  async createStrategy(identityId, {
    name,
    description = '',
    status = 'confirmed',
    draft_rules = [],
    draft_trading_schedule = null,
    markets = [],
    timeframes = [],
    entry_conditions = [],
    stop_loss_method = {},
    exit_plan = {},
    risk_rules = [],
    position_sizing_rules = [],
    other_restrictions = [],
    preferences = []
  }) {
    const strategyId = randomUUID();
    const versionId = randomUUID();
    const now = new Date().toISOString();
    const normalizedStatus = ['draft', 'needs_review', 'confirmed', 'archived'].includes(String(status).toLowerCase())
      ? String(status).toLowerCase()
      : 'draft';

    const resolvedRiskRules = Array.isArray(risk_rules) && risk_rules.length > 0
      ? structuredClone(risk_rules)
      : (Array.isArray(draft_rules) ? draft_rules.filter((r) => r.dimension === 'risk') : []);
    const resolvedSizingRules = Array.isArray(position_sizing_rules) && position_sizing_rules.length > 0
      ? structuredClone(position_sizing_rules)
      : (Array.isArray(draft_rules) ? draft_rules.filter((r) => r.dimension === 'sizing') : []);

    const strategy = {
      id: strategyId,
      identity_id: identityId,
      name: name.trim(),
      description: (description || '').trim(),
      status: normalizedStatus,
      draft_rules: structuredClone(draft_rules),
      draft_trading_schedule: draft_trading_schedule ? structuredClone(draft_trading_schedule) : null,
      markets: structuredClone(markets),
      timeframes: structuredClone(timeframes),
      entry_conditions: structuredClone(entry_conditions),
      stop_loss_method: structuredClone(stop_loss_method),
      exit_plan: structuredClone(exit_plan),
      risk_rules: resolvedRiskRules,
      position_sizing_rules: resolvedSizingRules,
      other_restrictions: structuredClone(other_restrictions),
      preferences: structuredClone(preferences),
      current_version_id: normalizedStatus === 'confirmed' ? versionId : null,
      version_number: normalizedStatus === 'confirmed' ? 1 : 0,
      created_at: now,
      updated_at: now
    };

    let map = this.strategies.get(identityId);
    if (!map) {
      map = new Map();
      this.strategies.set(identityId, map);
    }
    map.set(strategyId, strategy);

    let vMap = this.strategyVersions.get(strategyId);
    if (!vMap) {
      vMap = new Map();
      this.strategyVersions.set(strategyId, vMap);
    }

    if (normalizedStatus === 'confirmed') {
      const initialVersion = {
        id: versionId,
        strategy_id: strategyId,
        identity_id: identityId,
        version_number: 1,
        name: strategy.name,
        rules: structuredClone(draft_rules),
        trading_schedule: draft_trading_schedule ? structuredClone(draft_trading_schedule) : null,
        snapshot: {
          name: strategy.name,
          description: strategy.description,
          rules: structuredClone(draft_rules),
          trading_schedule: draft_trading_schedule ? structuredClone(draft_trading_schedule) : null,
          markets: structuredClone(markets),
          timeframes: structuredClone(timeframes),
          entry_conditions: structuredClone(entry_conditions),
          stop_loss_method: structuredClone(stop_loss_method),
          exit_plan: structuredClone(exit_plan),
          risk_rules: structuredClone(risk_rules),
          position_sizing_rules: structuredClone(position_sizing_rules),
          other_restrictions: structuredClone(other_restrictions),
          preferences: structuredClone(preferences)
        },
        change_summary: 'Initial confirmed strategy version',
        confirmed_at: now
      };
      vMap.set(versionId, initialVersion);
    }

    return structuredClone(strategy);
  }

  async updateStrategyDraft(identityId, strategyId, updates) {
    const strategy = this.strategies.get(identityId)?.get(strategyId);
    if (!strategy) return null;
    if (strategy.status === 'archived') {
      throw new Error('INVALID_LIFECYCLE_TRANSITION: Cannot edit an archived strategy.');
    }

    if (typeof updates.name === 'string' && updates.name.trim()) strategy.name = updates.name.trim();
    if (typeof updates.description === 'string') strategy.description = updates.description.trim();
    if (Array.isArray(updates.draft_rules)) {
      strategy.draft_rules = structuredClone(updates.draft_rules);
      strategy.risk_rules = strategy.draft_rules.filter((r) => r.dimension === 'risk');
      strategy.position_sizing_rules = strategy.draft_rules.filter((r) => r.dimension === 'sizing');
    }
    if (updates.draft_trading_schedule !== undefined) strategy.draft_trading_schedule = updates.draft_trading_schedule ? structuredClone(updates.draft_trading_schedule) : null;
    if (Array.isArray(updates.markets)) strategy.markets = structuredClone(updates.markets);
    if (Array.isArray(updates.timeframes)) strategy.timeframes = structuredClone(updates.timeframes);
    if (Array.isArray(updates.entry_conditions)) strategy.entry_conditions = structuredClone(updates.entry_conditions);
    if (updates.stop_loss_method !== undefined) strategy.stop_loss_method = structuredClone(updates.stop_loss_method);
    if (updates.exit_plan !== undefined) strategy.exit_plan = structuredClone(updates.exit_plan);
    if (Array.isArray(updates.risk_rules)) strategy.risk_rules = structuredClone(updates.risk_rules);
    if (Array.isArray(updates.position_sizing_rules)) strategy.position_sizing_rules = structuredClone(updates.position_sizing_rules);
    if (Array.isArray(updates.other_restrictions)) strategy.other_restrictions = structuredClone(updates.other_restrictions);
    if (Array.isArray(updates.preferences)) strategy.preferences = structuredClone(updates.preferences);

    strategy.status = 'draft';
    strategy.updated_at = new Date().toISOString();
    return structuredClone(strategy);
  }

  async submitStrategyForReview(identityId, strategyId) {
    const strategy = this.strategies.get(identityId)?.get(strategyId);
    if (!strategy) return null;
    if (strategy.status === 'archived') {
      throw new Error('INVALID_LIFECYCLE_TRANSITION: Cannot submit an archived strategy for review.');
    }
    strategy.status = 'needs_review';
    strategy.updated_at = new Date().toISOString();
    return structuredClone(strategy);
  }

  async confirmStrategyVersion(identityId, strategyId, { change_summary = 'Confirmed strategy update' } = {}) {
    const strategy = this.strategies.get(identityId)?.get(strategyId);
    if (!strategy) return null;
    if (strategy.status === 'archived') {
      throw new Error('INVALID_LIFECYCLE_TRANSITION: Cannot confirm an archived strategy.');
    }

    const now = new Date().toISOString();
    const nextVersionNumber = (strategy.version_number || 0) + 1;
    const newVersionId = randomUUID();

    const snapshot = {
      name: strategy.name,
      description: strategy.description,
      rules: structuredClone(strategy.draft_rules),
      trading_schedule: structuredClone(strategy.draft_trading_schedule),
      markets: structuredClone(strategy.markets || []),
      timeframes: structuredClone(strategy.timeframes || []),
      entry_conditions: structuredClone(strategy.entry_conditions || []),
      stop_loss_method: structuredClone(strategy.stop_loss_method || {}),
      exit_plan: structuredClone(strategy.exit_plan || {}),
      risk_rules: structuredClone(strategy.risk_rules || []),
      position_sizing_rules: structuredClone(strategy.position_sizing_rules || []),
      other_restrictions: structuredClone(strategy.other_restrictions || []),
      preferences: structuredClone(strategy.preferences || [])
    };

    const version = {
      id: newVersionId,
      strategy_id: strategyId,
      identity_id: identityId,
      version_number: nextVersionNumber,
      name: strategy.name,
      rules: structuredClone(strategy.draft_rules),
      trading_schedule: structuredClone(strategy.draft_trading_schedule),
      snapshot,
      change_summary: change_summary || `Version ${nextVersionNumber} confirmed`,
      confirmed_at: now
    };

    let vMap = this.strategyVersions.get(strategyId);
    if (!vMap) {
      vMap = new Map();
      this.strategyVersions.set(strategyId, vMap);
    }
    vMap.set(newVersionId, version);

    strategy.current_version_id = newVersionId;
    strategy.version_number = nextVersionNumber;
    strategy.status = 'confirmed';
    strategy.updated_at = now;
    return { strategy: structuredClone(strategy), version: structuredClone(version) };
  }

  async archiveStrategy(identityId, strategyId) {
    const strategy = this.strategies.get(identityId)?.get(strategyId);
    if (!strategy) return null;
    if (strategy.status === 'archived') {
      throw new Error('INVALID_LIFECYCLE_TRANSITION: Strategy is already archived.');
    }
    strategy.status = 'archived';
    strategy.updated_at = new Date().toISOString();
    return structuredClone(strategy);
  }

  async getStrategyVersions(identityId, strategyId) {
    const strategy = this.strategies.get(identityId)?.get(strategyId);
    if (!strategy) return null;
    const vMap = this.strategyVersions.get(strategyId) || new Map();
    const versions = Array.from(vMap.values())
      .sort((a, b) => b.version_number - a.version_number)
      .map((v) => structuredClone(v));
    return { versions };
  }

  async getStrategyVersion(identityId, strategyId, versionId) {
    const strategy = this.strategies.get(identityId)?.get(strategyId);
    if (!strategy) return null;
    const version = this.strategyVersions.get(strategyId)?.get(versionId);
    return version ? structuredClone(version) : null;
  }

  async createTrade(identityId, payload) {
    if (!payload.strategy_id) {
      throw new Error('STRATEGY_REQUIRED: A valid strategy_id is required.');
    }
    const map = this.strategies.get(identityId) || new Map();
    const strategy = map.get(payload.strategy_id);
    if (!strategy) throw new Error('STRATEGY_NOT_FOUND');

    let strategyVersionId;
    if (payload.strategy_version_id) {
      const v = this.strategyVersions.get(strategy.id)?.get(payload.strategy_version_id);
      if (!v) throw new Error('VERSION_NOT_FOUND: Specified strategy version does not exist.');
      strategyVersionId = v.id;
    } else {
      if (!strategy.current_version_id) {
        throw new Error('STRATEGY_NOT_CONFIRMED: Strategy must have a confirmed version before recording trades.');
      }
      strategyVersionId = strategy.current_version_id;
    }

    const cleanPayload = structuredClone(payload);
    delete cleanPayload.strategy_id;
    delete cleanPayload.strategy_version_id;

    const trade = {
      id: randomUUID(),
      identity_id: identityId,
      strategy_id: strategy.id,
      strategy_version_id: strategyVersionId,
      ...cleanPayload,
      created_at: new Date().toISOString()
    };
    const list = this.trades.get(identityId) || [];
    list.unshift(trade);
    this.trades.set(identityId, list);
    return trade;
  }

  async listTrades(identityId) {
    const trades = (this.trades.get(identityId) || []).map((trade) => {
      const review = this.reviews.get(identityId)?.get(trade.id);
      return { ...structuredClone(trade), review: review ? { id: review.id, result: structuredClone(review.result) } : null };
    });
    return { trades, total: trades.length };
  }

  async getTrade(identityId, tradeId) {
    return (this.trades.get(identityId) || []).find((trade) => trade.id === tradeId) || null;
  }

  async getReview(identityId, tradeId) {
    return this.reviews.get(identityId)?.get(tradeId) || null;
  }

  async saveReview(identityId, tradeId, result) {
    const review = { id: randomUUID(), trade_id: tradeId, result: structuredClone(result), created_at: new Date().toISOString() };
    this.reviews.get(identityId)?.set(tradeId, review);
    return review;
  }

  async getStats(identityId, currency = 'USD') {
    const trades = this.trades.get(identityId) || [];
    const closed = trades.filter((trade) => trade.closed_at && Number.isFinite(Number(trade.realized_pnl)));
    if (!closed.length) return { currency, sample_size: 0, wins: 0, losses: 0, win_rate: null, net_realized_pnl: 0, profit_factor: null, expectancy: null, cumulative_realized_pnl_curve: [] };
    const sorted = [...closed].sort((a, b) => new Date(a.closed_at) - new Date(b.closed_at));
    const values = sorted.map((trade) => Number(trade.realized_pnl));
    const wins = values.filter((value) => value > 0).length;
    const losses = values.filter((value) => value < 0).length;
    const positive = values.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
    const negative = Math.abs(values.filter((value) => value < 0).reduce((sum, value) => sum + value, 0));
    let cumulative = 0;
    const curve = sorted.map((trade) => ({ trade_id: trade.id, closed_at: trade.closed_at, cumulative_realized_pnl: (cumulative += Number(trade.realized_pnl)) }));
    return { currency, sample_size: closed.length, wins, losses, win_rate: wins / closed.length * 100, net_realized_pnl: values.reduce((sum, value) => sum + value, 0), profit_factor: negative ? positive / negative : null, expectancy: values.reduce((sum, value) => sum + value, 0) / values.length, cumulative_realized_pnl_curve: curve };
  }

  async getProgress(identityId) {
    const trades = this.trades.get(identityId) || [];
    const reviews = this.reviews.get(identityId) || new Map();
    if (!reviews.size) return { progress: { versions: [] } };
    const versionIds = [...new Set(trades.filter((trade) => reviews.has(trade.id)).map((trade) => trade.strategy_version_id))];
    const versions = versionIds.map((versionId) => {
      const reviewedTrades = trades.filter((trade) => trade.strategy_version_id === versionId && reviews.has(trade.id));
      const results = reviewedTrades.map((trade) => reviews.get(trade.id).result);
      const scores = results.map((result) => result.decision_quality_score).filter((score) => score !== null);
      const coverages = results.map((result) => result.coverage_pct);
      const dimensionCounts = Object.fromEntries(DIMENSION_ORDER.map((dimension) => [dimension, { followed: 0, broken: 0, cannot_assess: 0 }]));
      for (const result of results) for (const dimension of result.dimensions) dimensionCounts[dimension.dimension][dimension.status] += 1;
      const reviewRecords = reviewedTrades.map((trade) => reviews.get(trade.id));
      return {
        strategy_version_id: versionId,
        assessed_trades: results.length,
        average_decision_quality_score: scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null,
        average_coverage_pct: coverages.length ? coverages.reduce((sum, value) => sum + value, 0) / coverages.length : 0,
        trend: { eligible: results.length >= 5, series: results.length >= 5 ? buildTrendSeries(reviewedTrades, reviewRecords) : [] },
        dimension_counts: dimensionCounts
      };
    });
    return { progress: { versions } };
  }

  async createConversation(identityId, { title = 'Discipline Coaching', context_type = 'general', context_id = null, strategy_id = null } = {}) {
    if (strategy_id) {
      const strat = this.strategies.get(identityId)?.get(strategy_id);
      if (!strat) throw new Error('STRATEGY_NOT_FOUND');
    }
    const conversationId = randomUUID();
    const now = new Date().toISOString();
    const safeType = ['general', 'trade_review', 'strategy_refinement', 'weekly_coaching'].includes(context_type) ? context_type : 'general';
    const conversation = {
      id: conversationId,
      identity_id: identityId,
      strategy_id: strategy_id || null,
      title: (title || 'Discipline Coaching').slice(0, 100),
      status: 'active',
      context_type: safeType,
      context_id: context_id || null,
      created_at: now,
      updated_at: now
    };
    let userConvos = this.conversations.get(identityId);
    if (!userConvos) {
      userConvos = new Map();
      this.conversations.set(identityId, userConvos);
    }
    userConvos.set(conversationId, conversation);
    this.messages.set(conversationId, []);
    return structuredClone(conversation);
  }

  async getConversation(identityId, conversationId) {
    const convo = this.conversations.get(identityId)?.get(conversationId);
    return convo ? structuredClone(convo) : null;
  }

  async listConversations(identityId, { limit = 20 } = {}) {
    const userConvos = this.conversations.get(identityId) || new Map();
    const list = Array.from(userConvos.values())
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      .slice(0, Math.min(Math.max(1, limit), 100))
      .map((c) => structuredClone(c));
    return { conversations: list };
  }

  async createMessage(identityId, conversationId, { role, content, metadata = {} }) {
    const convo = this.conversations.get(identityId)?.get(conversationId);
    if (!convo) return null;
    if (!['user', 'assistant', 'system'].includes(role)) throw new Error('INVALID_MESSAGE_ROLE');
    const messageId = randomUUID();
    const now = new Date().toISOString();
    const message = {
      id: messageId,
      conversation_id: conversationId,
      identity_id: identityId,
      role,
      content: typeof content === 'string' ? content : '',
      metadata: metadata && typeof metadata === 'object' ? structuredClone(metadata) : {},
      created_at: now
    };
    const list = this.messages.get(conversationId) || [];
    list.push(message);
    this.messages.set(conversationId, list);
    convo.updated_at = now;
    return structuredClone(message);
  }

  async getConversationMessages(identityId, conversationId, { limit = 50 } = {}) {
    const convo = this.conversations.get(identityId)?.get(conversationId);
    if (!convo) return null;
    const list = (this.messages.get(conversationId) || [])
      .slice(-Math.min(Math.max(1, limit), 200))
      .map((m) => structuredClone(m));
    return { messages: list };
  }
}
