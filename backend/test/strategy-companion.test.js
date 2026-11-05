import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { MockStore } from '../src/mock-store.js';
import {
  FIELD_STATUS,
  STRATEGY_COMPANION_SYSTEM_PROMPT,
  buildCompanionUserPrompt,
  validateStrategyExtraction,
  extractProvidedUpdates,
  createStrategyCompanionEngine
} from '../src/strategy-companion.js';

const config = { corsOrigins: ['http://localhost:5173'], nodeEnv: 'test', dataMode: 'mock' };

async function withApp(fn, { companionEngine } = {}) {
  const store = new MockStore();
  const app = await createApp({ store, config, companionEngine });
  try {
    await fn(app, store);
  } finally {
    await app.close();
  }
}

test('strategy companion: prompt enforces one question at a time and strict boundaries', () => {
  assert.ok(STRATEGY_COMPANION_SYSTEM_PROMPT.includes('ASK ONE MEANINGFUL QUESTION AT A TIME'));
  assert.ok(STRATEGY_COMPANION_SYSTEM_PROMPT.includes('STRICT RULES VERSUS PREFERENCES'));
  assert.ok(STRATEGY_COMPANION_SYSTEM_PROMPT.includes('NO FABRICATED RULES'));
  assert.ok(STRATEGY_COMPANION_SYSTEM_PROMPT.includes('NEVER invent or assume rules'));

  const prompt = buildCompanionUserPrompt({
    strategy: { name: 'Breakout Plan', markets: ['BTC/USDT'] },
    messages: [{ role: 'user', content: 'I like trading morning breakouts' }],
    userInput: 'Actually <script>alert(1)</script> I only trade 1h candles'
  });

  assert.ok(prompt.includes('BTC/USDT'));
  assert.ok(prompt.includes('<trader_input>'));
  assert.ok(!prompt.includes('<script>')); // Sanitized
  assert.ok(prompt.includes('I only trade 1h candles'));
});

test('strategy companion: validation classifies field statuses and rejects fabricated values', () => {
  const rawOutput = {
    assistant_message: 'Great, what timeframes do you look at for entries?',
    question_focus: 'timeframes',
    strategy_extraction: {
      name: { value: 'Trend Momentum', status: 'PROVIDED' },
      markets: { value: ['BTC/USDT', 'ETH/USDT'], status: 'PROVIDED' },
      timeframes: { value: null, status: 'NOT_PROVIDED' },
      entry_conditions: { value: null, status: 'UNCLEAR' },
      risk_rules: { value: null, status: 'NOT_PROVIDED' },
      preferences: { value: ['Prefers morning sessions'], status: 'PROVIDED' },
      other_restrictions: { value: ['Only trade London open'], status: 'PROVIDED' }
    },
    suggestions: ['Consider defining a stop-loss at swing low']
  };

  const validated = validateStrategyExtraction(rawOutput);
  assert.equal(validated.assistant_message, 'Great, what timeframes do you look at for entries?');
  assert.equal(validated.question_focus, 'timeframes');
  assert.equal(validated.strategy_extraction.markets.status, FIELD_STATUS.PROVIDED);
  assert.deepEqual(validated.strategy_extraction.markets.value, ['BTC/USDT', 'ETH/USDT']);
  assert.equal(validated.strategy_extraction.timeframes.status, FIELD_STATUS.NOT_PROVIDED);
  assert.equal(validated.strategy_extraction.entry_conditions.status, FIELD_STATUS.UNCLEAR);
  assert.equal(validated.strategy_extraction.preferences.status, FIELD_STATUS.PROVIDED);
  assert.equal(validated.strategy_extraction.other_restrictions.status, FIELD_STATUS.PROVIDED);

  // Extract provided updates
  const updates = extractProvidedUpdates(validated, {});
  assert.equal(updates.name, 'Trend Momentum');
  assert.deepEqual(updates.markets, ['BTC/USDT', 'ETH/USDT']);
  assert.equal(updates.timeframes, undefined); // NOT_PROVIDED must not overwrite!
  assert.equal(updates.entry_conditions, undefined); // UNCLEAR must not overwrite!
  assert.deepEqual(updates.preferences, ['Prefers morning sessions']);
  assert.deepEqual(updates.other_restrictions, ['Only trade London open']);
});

test('strategy companion: strict rules vs preferences distinction', () => {
  const rawExtraction = {
    assistant_message: 'Clarified: morning trading is a preference, but max risk $50 is a strict limit.',
    question_focus: 'risk_rules',
    strategy_extraction: {
      preferences: { value: ['Prefers trading during London session'], status: 'PROVIDED' },
      other_restrictions: { value: ['Never trade during FOMC announcements'], status: 'PROVIDED' },
      risk_rules: {
        value: [{ id: 'risk-50', dimension: 'risk', label: 'Max risk $50', check: { type: 'max_risk_amount', amount: 50 } }],
        status: 'PROVIDED'
      }
    }
  };

  const validated = validateStrategyExtraction(rawExtraction);
  const updates = extractProvidedUpdates(validated, {});
  assert.deepEqual(updates.preferences, ['Prefers trading during London session']);
  assert.deepEqual(updates.other_restrictions, ['Never trade during FOMC announcements']);
  assert.equal(updates.risk_rules.length, 1);
  assert.equal(updates.draft_rules[0].check.amount, 50);
});

test('strategy companion: companion-turn endpoint updates strategy draft and maintains conversation history', async () => {
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{
        message: {
          content: JSON.stringify({
            assistant_message: 'Recorded BTC and ETH. What specific entry trigger do you look for?',
            question_focus: 'entry_conditions',
            strategy_extraction: {
              name: { value: 'Crypto Breakout 1H', status: 'PROVIDED' },
              markets: { value: ['BTC/USDT', 'ETH/USDT'], status: 'PROVIDED' },
              timeframes: { value: ['1h'], status: 'PROVIDED' },
              entry_conditions: { value: null, status: 'NOT_PROVIDED' }
            },
            suggestions: ['A breakout above resistance with volume']
          })
        }
      }]
    })
  });

  const customEngine = createStrategyCompanionEngine(
    { openRouterApiKey: 'test-key', openRouterModel: 'google/gemini-2.0-flash-001' },
    { fetchFn: mockFetch }
  );

  await withApp(async (app, store) => {
    const session = (await app.inject({ method: 'POST', url: '/v1/demo/session' })).json();
    const headers = { authorization: `Bearer ${session.token}` };

    // 1. Create a strategy in draft mode
    const stratRes = await app.inject({
      method: 'POST',
      url: '/v1/strategies',
      headers,
      payload: { name: 'Initial Draft', status: 'draft' }
    });
    const stratId = stratRes.json().strategy.id;

    // 2. Create an AI conversation tied to this strategy
    const convoRes = await app.inject({
      method: 'POST',
      url: '/v1/ai/conversations',
      headers,
      payload: {
        title: 'Strategy Definition',
        context_type: 'strategy_refinement',
        strategy_id: stratId
      }
    });
    const convoId = convoRes.json().conversation.id;

    // 3. Post a companion turn
    const turnRes = await app.inject({
      method: 'POST',
      url: `/v1/ai/conversations/${convoId}/companion-turn`,
      headers,
      payload: {
        content: 'I trade BTC and ETH on the 1h timeframe.',
        strategy_id: stratId
      }
    });

    assert.equal(turnRes.statusCode, 200);
    const data = turnRes.json();
    assert.equal(data.status, 'success');
    assert.equal(data.user_message.role, 'user');
    assert.equal(data.assistant_message.role, 'assistant');
    assert.equal(data.question_focus, 'entry_conditions');
    assert.equal(data.assistant_message.content, 'Recorded BTC and ETH. What specific entry trigger do you look for?');

    // 4. Verify strategy draft was updated automatically
    assert.equal(data.strategy.name, 'Crypto Breakout 1H');
    assert.deepEqual(data.strategy.markets, ['BTC/USDT', 'ETH/USDT']);
    assert.deepEqual(data.strategy.timeframes, ['1h']);
    // Strategy remains in draft (NEVER auto-confirmed!)
    assert.equal(data.strategy.status, 'draft');

    // 5. Query conversation strategy state endpoint
    const stateRes = await app.inject({
      method: 'GET',
      url: `/v1/ai/conversations/${convoId}/strategy-state`,
      headers
    });
    assert.equal(stateRes.statusCode, 200);
    const state = stateRes.json();
    assert.equal(state.strategy.id, stratId);
    assert.equal(state.strategy.name, 'Crypto Breakout 1H');
    assert.equal(state.messages.length, 2); // 1 user + 1 assistant
  }, { companionEngine: customEngine });
});

test('strategy companion: user correction properly updates previous values', async () => {
  let callCount = 0;
  const mockFetch = async () => {
    callCount++;
    if (callCount === 1) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                assistant_message: 'Got it, max risk is $50. What is your position sizing limit?',
                question_focus: 'position_sizing_rules',
                strategy_extraction: {
                  risk_rules: {
                    value: [{ id: 'risk-50', dimension: 'risk', label: 'Max risk $50', check: { type: 'max_risk_amount', amount: 50 } }],
                    status: 'PROVIDED'
                  }
                }
              })
            }
          }]
        })
      };
    } else {
      // User corrected risk to $100
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                assistant_message: 'Updated your risk limit to $100. Do you have a maximum position size?',
                question_focus: 'position_sizing_rules',
                strategy_extraction: {
                  risk_rules: {
                    value: [{ id: 'risk-100', dimension: 'risk', label: 'Max risk $100', check: { type: 'max_risk_amount', amount: 100 } }],
                    status: 'PROVIDED'
                  }
                }
              })
            }
          }]
        })
      };
    }
  };

  const customEngine = createStrategyCompanionEngine(
    { openRouterApiKey: 'test-key', openRouterModel: 'google/gemini-2.0-flash-001' },
    { fetchFn: mockFetch }
  );

  await withApp(async (app) => {
    const session = (await app.inject({ method: 'POST', url: '/v1/demo/session' })).json();
    const headers = { authorization: `Bearer ${session.token}` };

    const stratRes = await app.inject({ method: 'POST', url: '/v1/strategies', headers, payload: { name: 'Risk Strategy', status: 'draft' } });
    const stratId = stratRes.json().strategy.id;

    const convoRes = await app.inject({ method: 'POST', url: '/v1/ai/conversations', headers, payload: { title: 'Risk Chat', strategy_id: stratId } });
    const convoId = convoRes.json().conversation.id;

    // Turn 1: set $50
    const turn1 = await app.inject({
      method: 'POST',
      url: `/v1/ai/conversations/${convoId}/companion-turn`,
      headers,
      payload: { content: 'My max risk is $50.' }
    });
    assert.equal(turn1.json().strategy.risk_rules[0].check.amount, 50);

    // Turn 2: User correction -> $100
    const turn2 = await app.inject({
      method: 'POST',
      url: `/v1/ai/conversations/${convoId}/companion-turn`,
      headers,
      payload: { content: 'Actually, change my max risk to $100.' }
    });
    assert.equal(turn2.json().strategy.risk_rules[0].check.amount, 100);
  }, { companionEngine: customEngine });
});

test('strategy companion: handles model failures gracefully with fallback without corrupting draft', async () => {
  // Mock failing OpenRouter fetch (e.g. 500 error)
  const mockFetch = async () => ({
    ok: false,
    status: 500,
    json: async () => ({ error: { message: 'Internal OpenRouter error' } })
  });

  const customEngine = createStrategyCompanionEngine(
    { openRouterApiKey: 'test-key', openRouterModel: 'google/gemini-2.0-flash-001' },
    { fetchFn: mockFetch }
  );

  await withApp(async (app) => {
    const session = (await app.inject({ method: 'POST', url: '/v1/demo/session' })).json();
    const headers = { authorization: `Bearer ${session.token}` };

    const stratRes = await app.inject({
      method: 'POST',
      url: '/v1/strategies',
      headers,
      payload: { name: 'Protected Strategy', status: 'draft', markets: ['ETH/USDT'] }
    });
    const stratId = stratRes.json().strategy.id;

    const convoRes = await app.inject({ method: 'POST', url: '/v1/ai/conversations', headers, payload: { title: 'Fallback Test', strategy_id: stratId } });
    const convoId = convoRes.json().conversation.id;

    const turnRes = await app.inject({
      method: 'POST',
      url: `/v1/ai/conversations/${convoId}/companion-turn`,
      headers,
      payload: { content: 'I trade breakouts.' }
    });

    assert.equal(turnRes.statusCode, 200);
    const data = turnRes.json();
    assert.equal(data.status, 'fallback');
    // Existing strategy data preserved intact
    assert.equal(data.strategy.name, 'Protected Strategy');
    assert.deepEqual(data.strategy.markets, ['ETH/USDT']);
    // Fallback response provides helpful answer
    assert.ok(data.assistant_message.content.length > 10);
  }, { companionEngine: customEngine });
});

test('strategy companion: cross-user isolation prevents unauthorized turns', async () => {
  await withApp(async (app) => {
    const userA = (await app.inject({ method: 'POST', url: '/v1/demo/session' })).json();
    const headersA = { authorization: `Bearer ${userA.token}` };

    const userB = (await app.inject({ method: 'POST', url: '/v1/demo/session' })).json();
    const headersB = { authorization: `Bearer ${userB.token}` };

    // User A creates a conversation
    const convoRes = await app.inject({
      method: 'POST',
      url: '/v1/ai/conversations',
      headers: headersA,
      payload: { title: 'User A Confidential Strategy' }
    });
    const convoId = convoRes.json().conversation.id;

    // User B attempts to execute companion turn on User A's conversation
    const forbiddenTurn = await app.inject({
      method: 'POST',
      url: `/v1/ai/conversations/${convoId}/companion-turn`,
      headers: headersB,
      payload: { content: 'Attempt to hijack conversation' }
    });
    assert.equal(forbiddenTurn.statusCode, 404);

    // User B attempts to access state
    const forbiddenState = await app.inject({
      method: 'GET',
      url: `/v1/ai/conversations/${convoId}/strategy-state`,
      headers: headersB
    });
    assert.equal(forbiddenState.statusCode, 404);
  });
});
