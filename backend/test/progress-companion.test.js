import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { MockStore } from '../src/mock-store.js';
import { createOpenRouterProvider, createAiAdapter } from '../src/ai-adapter.js';

test('Personal Progress Companion: answers personal history questions with deterministic grounding', async () => {
  const store = new MockStore();
  const app = await createApp({
    store,
    config: { corsOrigins: ['http://localhost:5173'], nodeEnv: 'test', dataMode: 'mock' }
  });

  try {
    const sessionRes = await app.inject({
      method: 'POST',
      url: '/v1/demo/session',
      payload: { display_name: 'Progress Demo Trader' }
    });
    const { token } = JSON.parse(sessionRes.payload);
    const authHeaders = { authorization: `Bearer ${token}` };

    // Create a progress conversation
    const convoRes = await app.inject({
      method: 'POST',
      url: '/v1/ai/conversations',
      headers: authHeaders,
      payload: {
        title: 'Weekly Discipline Review',
        context_type: 'weekly_coaching'
      }
    });
    assert.equal(convoRes.statusCode, 201);
    const convo = JSON.parse(convoRes.payload).conversation;

    // Ask: What mistakes do I repeat most?
    const turn1 = await app.inject({
      method: 'POST',
      url: `/v1/ai/conversations/${convo.id}/progress-turn`,
      headers: authHeaders,
      payload: { question: 'What mistakes do I repeat most?' }
    });
    assert.equal(turn1.statusCode, 200);
    const res1 = JSON.parse(turn1.payload);

    assert.ok(res1.answer);
    assert.ok(Array.isArray(res1.observed_facts));
    assert.ok(res1.confidence_level);
    assert.ok(res1.coaching_recommendation);
    assert.ok(Array.isArray(res1.suggested_followups));
    assert.equal(res1.pattern_snapshot.total_trades, 3);
  } finally {
    await app.close();
  }
});

test('Personal Progress Companion: accurately states insufficient data when trader has no trade reviews', async () => {
  const store = new MockStore();
  const app = await createApp({
    store,
    config: { corsOrigins: ['http://localhost:5173'], nodeEnv: 'test', dataMode: 'mock' }
  });

  try {
    const sessionRes = await app.inject({
      method: 'POST',
      url: '/v1/demo/session',
      payload: { display_name: 'New Trader' }
    });
    const { token, identity } = JSON.parse(sessionRes.payload);
    const authHeaders = { authorization: `Bearer ${token}` };

    // Wipe trades to test empty history
    store.trades.set(identity.id, []);
    store.reviews.set(identity.id, new Map());

    const convoRes = await app.inject({
      method: 'POST',
      url: '/v1/ai/conversations',
      headers: authHeaders,
      payload: { title: 'Test Empty' }
    });
    const convo = JSON.parse(convoRes.payload).conversation;

    const turn = await app.inject({
      method: 'POST',
      url: `/v1/ai/conversations/${convo.id}/progress-turn`,
      headers: authHeaders,
      payload: { question: 'Which rules do I break most frequently?' }
    });

    assert.equal(turn.statusCode, 200);
    const data = JSON.parse(turn.payload);
    assert.equal(data.confidence_level, 'INSUFFICIENT_DATA');
    assert.ok(data.answer.toLowerCase().includes('not recorded enough reviewed trades'));
    assert.ok(data.data_limitations);
  } finally {
    await app.close();
  }
});

test('Personal Progress Companion: OpenRouter integration delivers structured evidence-based responses', async () => {
  const store = new MockStore();

  const mockAiOutput = {
    assistant_answer: 'In your 3 reviewed trades, your primary execution challenge was adhering to the daily schedule constraint.',
    observed_facts: [
      'Trade opened at 10:00 UTC outside confirmed 08:00 - 09:30 session',
      'All 3 trades respected the maximum risk ceiling of $100'
    ],
    confidence_level: 'EARLY_PATTERN',
    data_limitations: 'Sample size of 3 trades is an early pattern',
    coaching_recommendation: 'Wait until the London open window before entering new breakout setups',
    suggested_followups: [
      'How has my discipline trended over time?',
      'Which instruments show my strongest adherence?'
    ]
  };

  const mockFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(mockAiOutput) } }]
    })
  });

  const provider = createOpenRouterProvider({ openRouterApiKey: 'test-key' }, { fetchFn: mockFetch });
  const aiAdapter = createAiAdapter(provider);

  const app = await createApp({
    store,
    aiAdapter,
    config: { corsOrigins: ['http://localhost:5173'], nodeEnv: 'test', dataMode: 'mock' }
  });

  try {
    const sessionRes = await app.inject({
      method: 'POST',
      url: '/v1/demo/session'
    });
    const { token } = JSON.parse(sessionRes.payload);
    const authHeaders = { authorization: `Bearer ${token}` };

    const convoRes = await app.inject({
      method: 'POST',
      url: '/v1/ai/conversations',
      headers: authHeaders,
      payload: { title: 'OpenRouter Progress Test' }
    });
    const convo = JSON.parse(convoRes.payload).conversation;

    const turn = await app.inject({
      method: 'POST',
      url: `/v1/ai/conversations/${convo.id}/progress-turn`,
      headers: authHeaders,
      payload: { question: 'Am I improving my discipline?' }
    });

    assert.equal(turn.statusCode, 200);
    const data = JSON.parse(turn.payload);
    assert.equal(data.answer, mockAiOutput.assistant_answer);
    assert.equal(data.confidence_level, 'EARLY_PATTERN');
    assert.deepEqual(data.observed_facts, mockAiOutput.observed_facts);
    assert.equal(data.coaching_recommendation, mockAiOutput.coaching_recommendation);

    // Verify conversation message persistence
    const msgListRes = await app.inject({
      method: 'GET',
      url: `/v1/ai/conversations/${convo.id}/messages`,
      headers: authHeaders
    });
    const msgList = JSON.parse(msgListRes.payload).messages;
    assert.equal(msgList.length, 2); // 1 user + 1 assistant
    assert.equal(msgList[1].metadata.confidence_level, 'EARLY_PATTERN');
  } finally {
    await app.close();
  }
});

test('Personal Progress Companion: OpenRouter outage falls back safely to deterministic evidence without 500 error', async () => {
  const store = new MockStore();
  const failingFetch = async () => { throw new Error('Network timeout'); };
  const provider = createOpenRouterProvider({ openRouterApiKey: 'test-key' }, { fetchFn: failingFetch });
  const aiAdapter = createAiAdapter(provider);

  const app = await createApp({
    store,
    aiAdapter,
    config: { corsOrigins: ['http://localhost:5173'], nodeEnv: 'test', dataMode: 'mock' }
  });

  try {
    const sessionRes = await app.inject({
      method: 'POST',
      url: '/v1/demo/session'
    });
    const { token } = JSON.parse(sessionRes.payload);
    const authHeaders = { authorization: `Bearer ${token}` };

    const convoRes = await app.inject({
      method: 'POST',
      url: '/v1/ai/conversations',
      headers: authHeaders
    });
    const convo = JSON.parse(convoRes.payload).conversation;

    const turn = await app.inject({
      method: 'POST',
      url: `/v1/ai/conversations/${convo.id}/progress-turn`,
      headers: authHeaders,
      payload: { question: 'Am I improving my discipline?' }
    });

    // Graceful fallback to deterministic response
    assert.equal(turn.statusCode, 200);
    const data = JSON.parse(turn.payload);
    assert.ok(data.answer);
    assert.ok(data.observed_facts.length > 0);
  } finally {
    await app.close();
  }
});

test('Cross-user isolation: User A cannot read or post to User B progress conversation', async () => {
  const store = new MockStore();
  const app = await createApp({
    store,
    config: { corsOrigins: ['http://localhost:5173'], nodeEnv: 'test', dataMode: 'mock' }
  });

  try {
    // User A session & conversation
    const resA = await app.inject({
      method: 'POST',
      url: '/v1/demo/session',
      payload: { display_name: 'Trader A' }
    });
    const tokenA = JSON.parse(resA.payload).token;

    const convoA = (await app.inject({
      method: 'POST',
      url: '/v1/ai/conversations',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { title: 'Trader A Progress' }
    })).json().conversation;

    // User B session
    const resB = await app.inject({
      method: 'POST',
      url: '/v1/demo/session',
      payload: { display_name: 'Trader B' }
    });
    const tokenB = JSON.parse(resB.payload).token;

    // User B tries to post a turn to User A's conversation
    const breachRes = await app.inject({
      method: 'POST',
      url: `/v1/ai/conversations/${convoA.id}/progress-turn`,
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { question: 'Leak user A data' }
    });

    assert.equal(breachRes.statusCode, 404); // Conversation not found for User B
  } finally {
    await app.close();
  }
});
