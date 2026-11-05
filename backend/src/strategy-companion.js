import { Provenance } from './context-builder.js';

export const FIELD_STATUS = Object.freeze({
  PROVIDED: 'PROVIDED',
  NOT_PROVIDED: 'NOT_PROVIDED',
  UNCLEAR: 'UNCLEAR',
  CONFLICTING: 'CONFLICTING',
  NEEDS_CONFIRMATION: 'NEEDS_CONFIRMATION'
});

export const STRATEGY_COMPANION_SYSTEM_PROMPT = `You are Miroir AI, an expert trading discipline and strategy execution companion.
Your objective is to help the trader systematically articulate and define their OWN trading strategy through natural conversation.

CORE RULES:
1. ASK ONE MEANINGFUL QUESTION AT A TIME. Never overwhelm the trader with a checklist or multiple questions at once.
2. YOU ARE NOT AN ADVISOR OR SIGNAL PROVIDER. Never recommend specific tickers to buy/sell, never forecast prices, never give investment advice.
3. UNDERSTAND ORDINARY TRADING LANGUAGE. If the trader uses trading slang (e.g. "sweep of liquidity", "FVG", "2R", "swing low"), understand it. If terminology is ambiguous or unfamiliar, explain it simply and ask for clarification.
4. STRICT RULES VERSUS PREFERENCES:
   - A PREFERENCE is something the trader likes or aims for, but is not mandatory (e.g., "I prefer London session", "I like trending markets").
   - A STRICT RULE / RESTRICTION is a hard boundary that must NEVER be breached (e.g., "I only trade London session", "Never risk more than $100", "No trades during FOMC").
   - When the trader expresses a habit, explicitly clarify whether it is a strict restriction or a flexible preference before categorizing it.
5. NO FABRICATED RULES:
   - NEVER invent or assume rules that the trader did not mention.
   - If an element is missing, keep its status as NOT_PROVIDED.
   - You may offer suggestions in the "suggestions" array, but MUST explicitly label them as suggestions and seek trader approval. Never save suggestions into the strategy without explicit approval.
6. ALLOW CORRECTIONS: If the trader updates or corrects a previous rule, immediately accept the change and update the extraction.
7. SUMMARIZE UNDERSTANDING: After 2-3 pieces of information are gathered, briefly summarize what you have understood before moving to the next dimension.
8. RETURN VALID JSON ONLY: You must respond strictly with the JSON object structure specified below.`;

export function buildCompanionUserPrompt({ strategy, messages, userInput }) {
  const sanitizedInput = (userInput || '')
    .replace(/[<>{}]/g, '')
    .trim()
    .slice(0, 1500);

  const currentSummary = {
    name: strategy?.name || 'Untitled Strategy',
    description: strategy?.description || '',
    markets: strategy?.markets || [],
    timeframes: strategy?.timeframes || [],
    entry_conditions: strategy?.entry_conditions || [],
    stop_loss_method: strategy?.stop_loss_method || {},
    exit_plan: strategy?.exit_plan || {},
    risk_rules: strategy?.risk_rules || [],
    position_sizing_rules: strategy?.position_sizing_rules || [],
    trading_schedule: strategy?.trading_schedule || strategy?.draft_trading_schedule || null,
    other_restrictions: strategy?.other_restrictions || [],
    preferences: strategy?.preferences || []
  };

  const historyFormatted = (messages || [])
    .slice(-10)
    .map((m) => `${m.role === 'user' ? 'Trader' : 'Miroir'}: ${(m.content || '').slice(0, 500)}`)
    .join('\n');

  return `CURRENT STRATEGY DRAFT ON RECORD:
${JSON.stringify(currentSummary, null, 2)}

RECENT CONVERSATION HISTORY:
${historyFormatted || 'No previous messages.'}

<trader_input>
${sanitizedInput}
</trader_input>

INSTRUCTIONS:
1. Analyze the trader's message in the context of previous messages and the current strategy draft.
2. Formulate your conversational response:
   - Ask ONE focused question addressing the next missing or unclear dimension.
   - If the trader gave new info, acknowledge and summarize it.
   - If a rule was corrected, update it.
   - Distinguish strict rules from preferences.
3. Extract all strategy fields with their appropriate status:
   - "PROVIDED": Field has a clear, trader-defined value.
   - "NOT_PROVIDED": Trader has not specified this yet (value should be null or empty).
   - "UNCLEAR": Trader mentioned something ambiguous requiring clarification.
   - "CONFLICTING": Contradicts a previously defined rule.
   - "NEEDS_CONFIRMATION": A suggestion was proposed or an interpretation needs the trader's explicit "yes".

Respond ONLY with a JSON object in this exact schema:
{
  "assistant_message": "Your conversational reply asking ONE question or clarifying.",
  "question_focus": "markets | timeframes | entry_conditions | stop_loss_method | exit_plan | risk_rules | position_sizing_rules | trading_schedule | other_restrictions | preferences | name | summary",
  "strategy_extraction": {
    "name": { "value": "string or null", "status": "PROVIDED | NOT_PROVIDED | UNCLEAR | CONFLICTING | NEEDS_CONFIRMATION" },
    "description": { "value": "string or null", "status": "..." },
    "markets": { "value": ["array of strings"] or null, "status": "..." },
    "timeframes": { "value": ["array of strings"] or null, "status": "..." },
    "entry_conditions": { "value": ["array of strings"] or null, "status": "..." },
    "stop_loss_method": { "value": { "type": "...", "description": "..." } or null, "status": "..." },
    "exit_plan": { "value": { "type": "...", "description": "..." } or null, "status": "..." },
    "risk_rules": { "value": [ { "id": "...", "dimension": "risk", "label": "...", "check": { "type": "max_risk_amount", "amount": 100 } } ] or null, "status": "..." },
    "position_sizing_rules": { "value": [ { "id": "...", "dimension": "sizing", "label": "...", "check": { "type": "max_notional", "amount": 5000 } } ] or null, "status": "..." },
    "trading_schedule": { "value": { "days": ["monday"], "start_time": "08:00", "end_time": "16:00", "timezone": "UTC" } or null, "status": "..." },
    "other_restrictions": { "value": ["array of strict rules"] or null, "status": "..." },
    "preferences": { "value": ["array of flexible preferences"] or null, "status": "..." }
  },
  "suggestions": [
    "Optional suggestions clearly framed as suggestions for trader approval"
  ]
}`;
}

export function validateStrategyExtraction(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const validStatuses = new Set(Object.values(FIELD_STATUS));
  const result = {
    assistant_message: typeof raw.assistant_message === 'string' && raw.assistant_message.trim()
      ? raw.assistant_message.trim().slice(0, 2000)
      : 'Could you tell me more about your trading approach?',
    question_focus: typeof raw.question_focus === 'string' ? raw.question_focus.slice(0, 50) : 'general',
    strategy_extraction: {},
    suggestions: Array.isArray(raw.suggestions)
      ? raw.suggestions.filter((s) => typeof s === 'string' && s.trim()).slice(0, 5).map((s) => s.trim().slice(0, 300))
      : []
  };

  const fields = [
    'name', 'description', 'markets', 'timeframes', 'entry_conditions',
    'stop_loss_method', 'exit_plan', 'risk_rules', 'position_sizing_rules',
    'trading_schedule', 'other_restrictions', 'preferences'
  ];

  const rawExt = raw.strategy_extraction || {};
  for (const field of fields) {
    const item = rawExt[field];
    if (item && typeof item === 'object') {
      const status = validStatuses.has(item.status) ? item.status : FIELD_STATUS.NOT_PROVIDED;
      result.strategy_extraction[field] = {
        value: item.value ?? null,
        status
      };
    } else {
      result.strategy_extraction[field] = {
        value: null,
        status: FIELD_STATUS.NOT_PROVIDED
      };
    }
  }

  return result;
}

export function extractProvidedUpdates(extraction, currentStrategy = {}) {
  if (!extraction || !extraction.strategy_extraction) return {};
  const updates = {};
  const ext = extraction.strategy_extraction;

  // Name
  if (ext.name?.status === FIELD_STATUS.PROVIDED && typeof ext.name.value === 'string' && ext.name.value.trim()) {
    updates.name = ext.name.value.trim().slice(0, 100);
  }

  // Description
  if (ext.description?.status === FIELD_STATUS.PROVIDED && typeof ext.description.value === 'string') {
    updates.description = ext.description.value.trim().slice(0, 500);
  }

  // Markets
  if (ext.markets?.status === FIELD_STATUS.PROVIDED && Array.isArray(ext.markets.value)) {
    updates.markets = ext.markets.value.filter((m) => typeof m === 'string' && m.trim()).map((m) => m.trim().toUpperCase());
  }

  // Timeframes
  if (ext.timeframes?.status === FIELD_STATUS.PROVIDED && Array.isArray(ext.timeframes.value)) {
    updates.timeframes = ext.timeframes.value.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim().toLowerCase());
  }

  // Entry conditions
  if (ext.entry_conditions?.status === FIELD_STATUS.PROVIDED && Array.isArray(ext.entry_conditions.value)) {
    updates.entry_conditions = ext.entry_conditions.value.filter((e) => typeof e === 'string' && e.trim()).map((e) => e.trim());
  }

  // Stop loss
  if (ext.stop_loss_method?.status === FIELD_STATUS.PROVIDED && ext.stop_loss_method.value && typeof ext.stop_loss_method.value === 'object') {
    updates.stop_loss_method = {
      type: typeof ext.stop_loss_method.value.type === 'string' ? ext.stop_loss_method.value.type : 'custom',
      description: typeof ext.stop_loss_method.value.description === 'string' ? ext.stop_loss_method.value.description.slice(0, 300) : ''
    };
  }

  // Exit plan
  if (ext.exit_plan?.status === FIELD_STATUS.PROVIDED && ext.exit_plan.value && typeof ext.exit_plan.value === 'object') {
    updates.exit_plan = {
      type: typeof ext.exit_plan.value.type === 'string' ? ext.exit_plan.value.type : 'custom',
      description: typeof ext.exit_plan.value.description === 'string' ? ext.exit_plan.value.description.slice(0, 300) : ''
    };
  }

  // Risk rules
  if (ext.risk_rules?.status === FIELD_STATUS.PROVIDED && Array.isArray(ext.risk_rules.value)) {
    updates.risk_rules = ext.risk_rules.value.filter((r) => r && typeof r === 'object');
    // Also mirror to draft_rules for deterministic evaluator
    const existingOther = (currentStrategy.draft_rules || []).filter((r) => r.dimension !== 'risk');
    updates.draft_rules = [...existingOther, ...updates.risk_rules];
  }

  // Position sizing rules
  if (ext.position_sizing_rules?.status === FIELD_STATUS.PROVIDED && Array.isArray(ext.position_sizing_rules.value)) {
    updates.position_sizing_rules = ext.position_sizing_rules.value.filter((r) => r && typeof r === 'object');
    const existingOther = (updates.draft_rules || currentStrategy.draft_rules || []).filter((r) => r.dimension !== 'sizing');
    updates.draft_rules = [...existingOther, ...updates.position_sizing_rules];
  }

  // Trading schedule
  if (ext.trading_schedule?.status === FIELD_STATUS.PROVIDED && ext.trading_schedule.value && typeof ext.trading_schedule.value === 'object') {
    const sched = ext.trading_schedule.value;
    updates.draft_trading_schedule = {
      days: Array.isArray(sched.days) ? sched.days.map((d) => String(d).toLowerCase()) : ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      start_time: typeof sched.start_time === 'string' ? sched.start_time : '08:00',
      end_time: typeof sched.end_time === 'string' ? sched.end_time : '17:00',
      timezone: typeof sched.timezone === 'string' ? sched.timezone : 'UTC'
    };
  }

  // Restrictions (Strict rules)
  if (ext.other_restrictions?.status === FIELD_STATUS.PROVIDED && Array.isArray(ext.other_restrictions.value)) {
    updates.other_restrictions = ext.other_restrictions.value.filter((r) => typeof r === 'string' && r.trim()).map((r) => r.trim());
  }

  // Preferences (Flexible guidelines)
  if (ext.preferences?.status === FIELD_STATUS.PROVIDED && Array.isArray(ext.preferences.value)) {
    updates.preferences = ext.preferences.value.filter((p) => typeof p === 'string' && p.trim()).map((p) => p.trim());
  }

  return updates;
}

export function createStrategyCompanionEngine(config = {}, { fetchFn = fetch } = {}) {
  const apiKey = (config.openRouterApiKey || '').trim();
  const baseUrl = (config.openRouterBaseUrl || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
  const model = config.openRouterModel || 'google/gemini-2.0-flash-001';
  const timeoutMs = (Number(config.openRouterTimeoutSeconds) || 15) * 1000;
  const appBaseUrl = config.appBaseUrl || 'http://localhost:5173';

  return {
    configured: Boolean(apiKey),
    model,
    async executeTurn({ strategy, messages, userInput }) {
      if (!apiKey) {
        return fallbackTurn({ strategy, userInput, reason: 'not_configured' });
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const body = {
          model,
          messages: [
            { role: 'system', content: STRATEGY_COMPANION_SYSTEM_PROMPT },
            { role: 'user', content: buildCompanionUserPrompt({ strategy, messages, userInput }) }
          ],
          temperature: 0.3,
          max_tokens: 1200,
          response_format: { type: 'json_object' }
        };

        const response = await fetchFn(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': appBaseUrl,
            'X-Title': 'Miroir AI Strategy Companion'
          },
          body: JSON.stringify(body),
          signal: controller.signal
        });

        if (!response.ok) {
          return fallbackTurn({ strategy, userInput, reason: `http_${response.status}` });
        }

        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content;
        if (!content) return fallbackTurn({ strategy, userInput, reason: 'empty_content' });

        let parsed;
        try {
          let raw = content.trim();
          if (raw.startsWith('```')) {
            raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
          }
          parsed = JSON.parse(raw);
        } catch {
          const first = content.indexOf('{');
          const last = content.lastIndexOf('}');
          if (first !== -1 && last > first) {
            try {
              parsed = JSON.parse(content.slice(first, last + 1));
            } catch {
              return fallbackTurn({ strategy, userInput, reason: 'invalid_json' });
            }
          } else {
            return fallbackTurn({ strategy, userInput, reason: 'invalid_json' });
          }
        }

        const validated = validateStrategyExtraction(parsed);
        if (!validated) return fallbackTurn({ strategy, userInput, reason: 'validation_failed' });

        return {
          status: 'success',
          ...validated
        };
      } catch (err) {
        return fallbackTurn({ strategy, userInput, reason: err.name === 'AbortError' ? 'timeout' : 'network_error' });
      } finally {
        clearTimeout(timer);
      }
    }
  };
}

function fallbackTurn({ strategy, userInput, reason }) {
  // Deterministic helpful rule-based fallback when OpenRouter is unreachable or not configured
  const inputLower = (userInput || '').toLowerCase();
  let questionFocus = 'markets';
  let reply = 'Welcome to Miroir Strategy Companion. What markets or instruments do you primarily trade (e.g. BTC/USDT, ETH/USDT, EUR/USD)?';

  const extraction = {
    name: { value: strategy?.name || null, status: strategy?.name ? FIELD_STATUS.PROVIDED : FIELD_STATUS.NOT_PROVIDED },
    description: { value: strategy?.description || null, status: strategy?.description ? FIELD_STATUS.PROVIDED : FIELD_STATUS.NOT_PROVIDED },
    markets: { value: strategy?.markets || null, status: strategy?.markets?.length ? FIELD_STATUS.PROVIDED : FIELD_STATUS.NOT_PROVIDED },
    timeframes: { value: strategy?.timeframes || null, status: strategy?.timeframes?.length ? FIELD_STATUS.PROVIDED : FIELD_STATUS.NOT_PROVIDED },
    entry_conditions: { value: strategy?.entry_conditions || null, status: strategy?.entry_conditions?.length ? FIELD_STATUS.PROVIDED : FIELD_STATUS.NOT_PROVIDED },
    stop_loss_method: { value: strategy?.stop_loss_method || null, status: strategy?.stop_loss_method?.type ? FIELD_STATUS.PROVIDED : FIELD_STATUS.NOT_PROVIDED },
    exit_plan: { value: strategy?.exit_plan || null, status: strategy?.exit_plan?.type ? FIELD_STATUS.PROVIDED : FIELD_STATUS.NOT_PROVIDED },
    risk_rules: { value: strategy?.risk_rules || null, status: strategy?.risk_rules?.length ? FIELD_STATUS.PROVIDED : FIELD_STATUS.NOT_PROVIDED },
    position_sizing_rules: { value: strategy?.position_sizing_rules || null, status: strategy?.position_sizing_rules?.length ? FIELD_STATUS.PROVIDED : FIELD_STATUS.NOT_PROVIDED },
    trading_schedule: { value: strategy?.draft_trading_schedule || null, status: strategy?.draft_trading_schedule ? FIELD_STATUS.PROVIDED : FIELD_STATUS.NOT_PROVIDED },
    other_restrictions: { value: strategy?.other_restrictions || null, status: strategy?.other_restrictions?.length ? FIELD_STATUS.PROVIDED : FIELD_STATUS.NOT_PROVIDED },
    preferences: { value: strategy?.preferences || null, status: strategy?.preferences?.length ? FIELD_STATUS.PROVIDED : FIELD_STATUS.NOT_PROVIDED }
  };

  if (inputLower.includes('btc') || inputLower.includes('eth') || inputLower.includes('crypto')) {
    extraction.markets = { value: ['BTC/USDT', 'ETH/USDT'], status: FIELD_STATUS.PROVIDED };
    questionFocus = 'timeframes';
    reply = 'Got it, you trade BTC and ETH. What timeframe charts do you use for your setups and execution (e.g., 15m, 1h, 4h)?';
  } else if (inputLower.includes('15m') || inputLower.includes('1h') || inputLower.includes('4h')) {
    extraction.timeframes = { value: ['1h', '15m'], status: FIELD_STATUS.PROVIDED };
    questionFocus = 'entry_conditions';
    reply = 'Understood. What specific technical or market trigger marks a valid trade entry for you?';
  } else if (inputLower.includes('breakout') || inputLower.includes('support') || inputLower.includes('resistance')) {
    extraction.entry_conditions = { value: [userInput.trim()], status: FIELD_STATUS.PROVIDED };
    questionFocus = 'risk_rules';
    reply = 'Recorded your entry condition. What is your maximum risk limit per trade in dollars or account percentage?';
  } else if (inputLower.includes('risk') || inputLower.includes('$') || inputLower.includes('dollar')) {
    questionFocus = 'stop_loss_method';
    reply = 'Noted on your risk constraint. Where do you place your stop-loss when entering a position?';
  }

  return {
    status: 'fallback',
    fallback_reason: reason,
    assistant_message: reply,
    question_focus: questionFocus,
    strategy_extraction: extraction,
    suggestions: [
      'Define a clear stop-loss method (e.g. below the preceding swing low)',
      'Specify a maximum dollar risk limit per trade'
    ]
  };
}
