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
    this.strategies = new Map();
    this.trades = new Map();
    this.reviews = new Map();
  }

  async createDemoSession(displayName = 'Demo Trader') {
    const identityId = randomUUID();
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + this.sessionTtlHours * 3600_000).toISOString();
    const strategy = { ...structuredClone(DEMO_STRATEGY), id: randomUUID(), current_version_id: randomUUID() };
    const identity = { id: identityId, mode: 'demo', display_name: displayName };
    this.identities.set(identityId, identity);
    this.sessions.set(token, { identity_id: identityId, expires_at: expiresAt });
    this.strategies.set(identityId, strategy);
    this.trades.set(identityId, []);
    this.reviews.set(identityId, new Map());
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

  async getStrategies(identityId) {
    const strategy = this.strategies.get(identityId);
    return { strategies: strategy ? [structuredClone(strategy)] : [] };
  }

  async createTrade(identityId, payload) {
    const strategy = this.strategies.get(identityId);
    if (!strategy) throw new Error('STRATEGY_NOT_FOUND');
    const trade = {
      id: randomUUID(), identity_id: identityId, strategy_id: strategy.id,
      strategy_version_id: payload.strategy_version_id || strategy.current_version_id,
      ...structuredClone(payload), created_at: new Date().toISOString()
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
}
