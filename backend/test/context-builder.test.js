import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MockStore } from '../src/mock-store.js';
import {
  Provenance,
  buildStrategyContext,
  buildRecentTradingContext,
  buildReviewHistoryContext,
  buildProgressSummaryContext,
  buildConversationContext,
  buildTraderContext,
  formatContextForPrompt
} from '../src/context-builder.js';

test('buildStrategyContext: retrieves active confirmed strategy with TRADER_APPROVED provenance', async () => {
  const store = new MockStore();
  const session = await store.createDemoSession('Alice');
  const context = await buildStrategyContext(store, session.identity.id);

  assert.equal(context.status, 'available');
  assert.equal(context.active_strategy.name.provenance, Provenance.TRADER_PROVIDED);
  assert.equal(context.active_strategy.name.value, 'Demo Breakout Plan');
  assert.equal(context.active_strategy.confirmed_rules.provenance, Provenance.TRADER_APPROVED);
  assert.equal(context.active_strategy.confirmed_rules.version_number, 1);
  assert.ok(context.active_strategy.confirmed_rules.rules.length > 0);
  assert.equal(context.active_strategy.draft_changes.has_unconfirmed_changes, false);
});

test('buildStrategyContext: handles draft changes as TRADER_PROVIDED', async () => {
  const store = new MockStore();
  const session = await store.createDemoSession('Bob');
  const strat = (await store.getStrategies(session.identity.id)).strategies[0];

  // Update strategy draft
  await store.updateStrategyDraft(session.identity.id, strat.id, {
    draft_rules: [{ id: 'risk-200', dimension: 'risk', label: 'Max risk 200', check: { type: 'max_risk_amount', amount: 200 } }]
  });

  const context = await buildStrategyContext(store, session.identity.id);
  assert.equal(context.active_strategy.status.value, 'draft');
  assert.equal(context.active_strategy.draft_changes.has_unconfirmed_changes, true);
  assert.equal(context.active_strategy.draft_changes.provenance, Provenance.TRADER_PROVIDED);
  assert.equal(context.active_strategy.draft_changes.rules[0].label, 'Max risk 200');
  // Confirmed version remains version 1 (TRADER_APPROVED)
  assert.equal(context.active_strategy.confirmed_rules.version_number, 1);
});

test('buildStrategyContext: handles multiple strategies and specific strategyId lookup', async () => {
  const store = new MockStore();
  const session = await store.createDemoSession('MultiTrader');
  const strat2 = await store.createStrategy(session.identity.id, {
    name: 'Scalping Strategy',
    draft_rules: [{ id: 'size-1k', dimension: 'sizing', label: 'Size 1000', check: { type: 'max_notional', amount: 1000 } }]
  });

  // Query without specific ID defaults to first strategy and lists other
  const defaultContext = await buildStrategyContext(store, session.identity.id);
  assert.equal(defaultContext.active_strategy.name.value, 'Demo Breakout Plan');
  assert.equal(defaultContext.available_strategies.length, 1);
  assert.equal(defaultContext.available_strategies[0].id, strat2.id);

  // Query with specific ID returns that strategy
  const specificContext = await buildStrategyContext(store, session.identity.id, { strategyId: strat2.id });
  assert.equal(specificContext.active_strategy.id, strat2.id);
  assert.equal(specificContext.active_strategy.name.value, 'Scalping Strategy');
});

test('buildStrategyContext: handles missing strategy gracefully', async () => {
  const store = new MockStore();
  const emptyIdentityId = randomUUID();
  store.identities.set(emptyIdentityId, { id: emptyIdentityId, mode: 'user', display_name: 'No Strategy User' });

  const context = await buildStrategyContext(store, emptyIdentityId);
  assert.equal(context.status, 'missing');
  assert.equal(context.active_strategy, null);
  assert.deepEqual(context.available_strategies, []);
});

test('buildRecentTradingContext: bounds large trading history and tags provenance', async () => {
  const store = new MockStore();
  const session = await store.createDemoSession('TraderWithManyTrades');
  const strat = (await store.getStrategies(session.identity.id)).strategies[0];

  // Insert 20 trades
  for (let i = 0; i < 20; i++) {
    await store.createTrade(session.identity.id, {
      strategy_id: strat.id,
      symbol: `COIN${i}/USDT`,
      direction: 'long',
      entry_price: 100 + i,
      exit_price: 110 + i,
      realized_pnl: 10 * (i % 2 === 0 ? 1 : -1),
      evidence: [{ kind: 'note', payload: { setup_note: `Trade note ${i}` } }]
    });
  }

  // Request context bounded to 5 (the default limit)
  const context = await buildRecentTradingContext(store, session.identity.id, { limit: 5 });

  assert.equal(context.total_trader_trades, 23); // 20 + 3 demo trades
  assert.equal(context.bounded_count, 5);
  assert.equal(context.trades.length, 5);

  const sample = context.trades[0];
  assert.equal(sample.symbol.provenance, Provenance.TRADER_PROVIDED);
  assert.equal(sample.realized_pnl.provenance, Provenance.APPLICATION_CALCULATED);
  assert.equal(sample.setup_note.provenance, Provenance.TRADER_PROVIDED);
});

test('buildReviewHistoryContext: aggregates rule violations and flags prior AI inferences', async () => {
  const store = new MockStore();
  const session = await store.createDemoSession('ReviewedTrader');

  // Inject a review with AI explanation
  const trades = (await store.listTrades(session.identity.id)).trades;
  const reviewedTrade = trades[0];
  const reviewResult = structuredClone(reviewedTrade.review.result);
  reviewResult.ai_explanation = {
    status: 'available',
    summary: 'Previous AI analysis indicating high discipline.',
    actions: ['Keep current sizing']
  };
  await store.saveReview(session.identity.id, reviewedTrade.id, reviewResult);

  const context = await buildReviewHistoryContext(store, session.identity.id, { limit: 3 });

  assert.ok(context.total_reviews >= 3);
  assert.equal(context.dimension_rule_adherence.provenance, Provenance.APPLICATION_CALCULATED);
  assert.ok(context.dimension_rule_adherence.metrics.risk);

  const matched = context.recent_reviews.find((r) => r.trade_id === reviewedTrade.id);
  assert.ok(matched);
  assert.equal(matched.decision_quality_score.provenance, Provenance.APPLICATION_CALCULATED);
  assert.equal(matched.prior_ai_explanation.provenance, Provenance.AI_INFERRED);
  assert.equal(matched.prior_ai_explanation.summary, 'Previous AI analysis indicating high discipline.');
});

test('buildProgressSummaryContext: calculates performance and discipline metrics', async () => {
  const store = new MockStore();
  const session = await store.createDemoSession('StatsTrader');
  const context = await buildProgressSummaryContext(store, session.identity.id);

  assert.equal(context.performance.provenance, Provenance.APPLICATION_CALCULATED);
  assert.equal(typeof context.performance.sample_size, 'number');
  assert.equal(typeof context.performance.net_realized_pnl, 'number');
  assert.equal(context.discipline.provenance, Provenance.APPLICATION_CALCULATED);
  assert.ok(context.discipline.average_coverage_pct > 0);
});

test('buildConversationContext: stores and retrieves conversation messages with role provenance', async () => {
  const store = new MockStore();
  const session = await store.createDemoSession('ConvoTrader');

  const convo = await store.createConversation(session.identity.id, {
    title: 'Risk Discipline Discussion',
    context_type: 'trade_review'
  });

  await store.createMessage(session.identity.id, convo.id, {
    role: 'user',
    content: 'Why did I breach my sizing rule on Friday?'
  });

  await store.createMessage(session.identity.id, convo.id, {
    role: 'assistant',
    content: 'According to your records, position notional was $12,000, exceeding your $10,000 limit.'
  });

  const context = await buildConversationContext(store, session.identity.id, convo.id);

  assert.equal(context.conversation_id, convo.id);
  assert.equal(context.title.provenance, Provenance.TRADER_PROVIDED);
  assert.equal(context.messages.length, 2);
  assert.equal(context.messages[0].role, 'user');
  assert.equal(context.messages[0].provenance, Provenance.TRADER_PROVIDED);
  assert.equal(context.messages[1].role, 'assistant');
  assert.equal(context.messages[1].provenance, Provenance.AI_INFERRED);
});

test('Cross-user isolation: User A cannot access User B strategy or conversation', async () => {
  const store = new MockStore();
  const userA = await store.createDemoSession('UserA');
  const userB = await store.createDemoSession('UserB');

  const userBStrategy = (await store.getStrategies(userB.identity.id)).strategies[0];
  const userBConvo = await store.createConversation(userB.identity.id, { title: 'User B Secrets' });

  // User A attempts to build strategy context targeting User B's strategy
  await assert.rejects(
    async () => {
      await buildStrategyContext(store, userA.identity.id, { strategyId: userBStrategy.id });
    },
    (err) => err.code === 'UNAUTHORIZED_CONTEXT_ACCESS'
  );

  // User A attempts to build conversation context targeting User B's conversation
  await assert.rejects(
    async () => {
      await buildConversationContext(store, userA.identity.id, userBConvo.id);
    },
    (err) => err.code === 'UNAUTHORIZED_CONTEXT_ACCESS'
  );

  // User A trade context only sees User A's data
  const userATrades = await buildRecentTradingContext(store, userA.identity.id);
  for (const trade of userATrades.trades) {
    const directLookup = await store.getTrade(userA.identity.id, trade.id);
    assert.ok(directLookup); // Owned by User A
    const forbiddenLookup = await store.getTrade(userB.identity.id, trade.id);
    assert.equal(forbiddenLookup, null); // Inaccessible to User B
  }
});

test('buildTraderContext: end-to-end composite context and formatContextForPrompt', async () => {
  const store = new MockStore();
  const session = await store.createDemoSession('CompositeTrader');

  const convo = await store.createConversation(session.identity.id, { title: 'Strategy Q&A' });
  await store.createMessage(session.identity.id, convo.id, { role: 'user', content: 'How did I perform?' });

  const context = await buildTraderContext(store, session.identity.id, {
    conversationId: convo.id,
    tradesLimit: 3
  });

  assert.equal(context.identity.display_name.value, 'CompositeTrader');
  assert.equal(context.identity.display_name.provenance, Provenance.TRADER_PROVIDED);
  assert.equal(context.strategy.status, 'available');
  assert.ok(context.recent_trading.trades.length <= 3);
  assert.ok(context.review_history.total_reviews >= 3);
  assert.ok(context.conversation.messages.length === 1);
  assert.ok(context.metadata.approx_tokens > 0);

  // Verify prompt formatter generates structured XML with provenance headers
  const promptText = formatContextForPrompt(context);
  assert.ok(promptText.includes('<trader_profile [PROVENANCE: TRADER_PROVIDED]>'));
  assert.ok(promptText.includes('<confirmed_strategy [PROVENANCE: TRADER_APPROVED]>'));
  assert.ok(promptText.includes('<rule_adherence_history [PROVENANCE: APPLICATION_CALCULATED]>'));
  assert.ok(promptText.includes('<performance_and_discipline_summary [PROVENANCE: APPLICATION_CALCULATED]>'));
  assert.ok(promptText.includes('<recent_trades [PROVENANCE: MIXED - DETAILS TRADER_PROVIDED, PNL APPLICATION_CALCULATED]>'));
  assert.ok(promptText.includes('<recent_conversation_messages>'));
  assert.ok(promptText.includes('Do NOT infer internal trader motivations without evidence.'));
});
