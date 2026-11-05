import 'dotenv/config';
import { loadConfig } from './config.js';
import { createOpenRouterProvider, createAiAdapter } from './ai-adapter.js';
import { DEMO_STRATEGY } from './fixtures.js';
import { evaluateTrade } from './scoring.js';

async function main() {
  console.log('=== Miroir AI OpenRouter Live Verification ===\n');

  let config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error('Configuration error:', err.message);
    process.exit(1);
  }

  if (!config.openRouterApiKey) {
    console.log('Status: NOT CONFIGURED');
    console.log('No OPENROUTER_API_KEY found in backend environment.');
    console.log('To test live connectivity:');
    console.log('  1. Add OPENROUTER_API_KEY=your_key_here to backend/.env');
    console.log('  2. (Optional) Set OPENROUTER_MODEL (default: google/gemini-2.0-flash-001)');
    console.log('  3. Re-run: node src/verify-openrouter.js\n');
    return;
  }

  console.log(`Configured Model: ${config.openRouterModel}`);
  console.log(`Gateway Base URL: ${config.openRouterBaseUrl}`);
  console.log(`Timeout: ${config.openRouterTimeoutSeconds}s`);
  console.log('API Key: [CONFIGURED - HIDDEN]');
  console.log('\nSending test prompt to OpenRouter...');

  const sampleTrade = {
    symbol: 'BTC/USDT',
    direction: 'long',
    quantity: 0.5,
    entry_price: 64000,
    exit_price: 65200,
    realized_pnl: 600,
    risk_amount: 80,
    opened_at: new Date(Date.now() - 3600000).toISOString(),
    closed_at: new Date().toISOString(),
    evidence: [
      { kind: 'note', payload: { setup_note: 'Tested 4h resistance retest with increasing volume' } },
      { kind: 'state', payload: { emotional_state: 'calm' } }
    ]
  };

  const deterministic = evaluateTrade(sampleTrade, DEMO_STRATEGY);
  console.log(`Deterministic Decision Quality: ${deterministic.decision_quality_score}/100`);

  const provider = createOpenRouterProvider(config);
  const adapter = createAiAdapter(provider);

  const startTime = Date.now();
  const result = await adapter.explain({ trade: sampleTrade, review: deterministic });
  const elapsedMs = Date.now() - startTime;

  console.log(`\nResponse received in ${elapsedMs}ms:`);
  console.log('Status:', result.status);

  if (result.status === 'available') {
    console.log('\n--- AI Explanation Summary ---');
    console.log(result.summary);
    console.log('\n--- Recommended Actions ---');
    for (const action of result.actions) {
      console.log(`- ${action}`);
    }
    console.log('\nSUCCESS: OpenRouter live connection verified!');
  } else {
    console.log('\nFAILURE: AI explanation unavailable. Check your API key, credit balance, or model name.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unexpected error during verification:', err);
  process.exit(1);
});
