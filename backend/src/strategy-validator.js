export const VALIDATION_STATUS = Object.freeze({
  COMPLETE: 'COMPLETE',
  INCOMPLETE: 'INCOMPLETE',
  AMBIGUOUS: 'AMBIGUOUS',
  CONTRADICTORY: 'CONTRADICTORY',
  NEEDS_TRADER_CONFIRMATION: 'NEEDS_TRADER_CONFIRMATION'
});

const VAGUE_PHRASES = [
  'feel right', 'feels right', 'gut feeling', 'intuition', 'whatever',
  'close whenever', 'sometime later', 'when i feel like it', 'as i see fit',
  'good vibe', 'market looks good', 'looks nice', 'random', 'whenever profit'
];

/**
 * Validates a trading strategy draft for completeness, internal consistency,
 * ambiguity, and absence of contradictions before confirmation.
 *
 * Does NOT reject unconventional trading styles as long as rules are coherent.
 */
export function validateStrategy(strategy) {
  if (!strategy || typeof strategy !== 'object') {
    return {
      status: VALIDATION_STATUS.INCOMPLETE,
      is_valid_for_confirmation: false,
      issues: [{ field: 'strategy', code: 'INVALID_STRATEGY', severity: 'error', message: 'Strategy must be a valid object.' }],
      completed_fields: [],
      missing_fields: ['name', 'markets', 'timeframes', 'entry_conditions', 'stop_loss_method', 'exit_plan', 'risk_rules'],
      ambiguous_fields: [],
      contradictory_fields: [],
      suggested_improvements: ['Provide a complete strategy draft to begin validation.']
    };
  }

  const issues = [];
  const completedFields = [];
  const missingFields = [];
  const ambiguousFields = [];
  const contradictoryFields = [];
  const suggestedImprovements = [];

  // 1. Name Check
  if (typeof strategy.name === 'string' && strategy.name.trim()) {
    completedFields.push('name');
  } else {
    missingFields.push('name');
    issues.push({
      field: 'name',
      code: 'MISSING_FIELD',
      severity: 'error',
      message: 'Strategy name is required.',
      suggestion: 'Provide a clear name identifying this trading strategy.'
    });
  }

  // 2. Markets / Instruments Check
  const markets = Array.isArray(strategy.markets) ? strategy.markets.filter((m) => typeof m === 'string' && m.trim()) : [];
  if (markets.length > 0) {
    completedFields.push('markets');
  } else {
    missingFields.push('markets');
    issues.push({
      field: 'markets',
      code: 'MISSING_FIELD',
      severity: 'error',
      message: 'At least one market or trading instrument is required.',
      suggestion: 'Specify the instruments you trade (e.g. BTC/USDT, ETH/USDT, EUR/USD).'
    });
  }

  // 3. Timeframes Check
  const timeframes = Array.isArray(strategy.timeframes) ? strategy.timeframes.filter((t) => typeof t === 'string' && t.trim()) : [];
  if (timeframes.length > 0) {
    completedFields.push('timeframes');
  } else {
    missingFields.push('timeframes');
    issues.push({
      field: 'timeframes',
      code: 'MISSING_FIELD',
      severity: 'error',
      message: 'At least one trading timeframe is required.',
      suggestion: 'Define the chart timeframes used for setup and execution (e.g. 15m, 1h, 4h).'
    });
  }

  // 4. Entry Conditions Check
  const entryConditions = Array.isArray(strategy.entry_conditions)
    ? strategy.entry_conditions.filter((e) => typeof e === 'string' && e.trim())
    : [];

  if (entryConditions.length > 0) {
    completedFields.push('entry_conditions');
    for (const cond of entryConditions) {
      const lower = cond.toLowerCase();
      const matchedVague = VAGUE_PHRASES.find((p) => lower.includes(p));
      if (matchedVague) {
        ambiguousFields.push('entry_conditions');
        issues.push({
          field: 'entry_conditions',
          code: 'AMBIGUOUS_RULE',
          severity: 'warning',
          message: `Entry condition contains subjective or ambiguous phrasing: "${matchedVague}".`,
          suggestion: 'Replace subjective criteria with objective indicators, price structure, or clear triggers.'
        });
        suggestedImprovements.push(`Clarify entry condition: "${cond}"`);
      }
    }
  } else {
    missingFields.push('entry_conditions');
    issues.push({
      field: 'entry_conditions',
      code: 'MISSING_FIELD',
      severity: 'error',
      message: 'Entry conditions are missing.',
      suggestion: 'Define what specific technical or structural trigger marks a valid trade entry.'
    });
  }

  // 5. Stop-Loss Method Check
  const stopLoss = strategy.stop_loss_method;
  if (stopLoss && typeof stopLoss === 'object' && (stopLoss.type || stopLoss.description)) {
    const hasType = typeof stopLoss.type === 'string' && stopLoss.type.trim();
    const hasDesc = typeof stopLoss.description === 'string' && stopLoss.description.trim();

    if (hasType && hasDesc) {
      completedFields.push('stop_loss_method');
      const lower = stopLoss.description.toLowerCase();
      const matchedVague = VAGUE_PHRASES.find((p) => lower.includes(p));
      if (matchedVague) {
        ambiguousFields.push('stop_loss_method');
        issues.push({
          field: 'stop_loss_method',
          code: 'AMBIGUOUS_RULE',
          severity: 'warning',
          message: `Stop-loss description is ambiguous: "${matchedVague}".`,
          suggestion: 'Specify an exact structural point, ATR multiple, or percentage for stop placement.'
        });
      }
    } else {
      issues.push({
        field: 'stop_loss_method',
        code: 'INCOMPLETE_DESCRIPTION',
        severity: 'warning',
        message: 'Stop-loss method requires both a method type and descriptive placement rule.',
        suggestion: 'Specify both the type (e.g. swing_low, atr) and placement description.'
      });
      missingFields.push('stop_loss_method');
    }
  } else {
    missingFields.push('stop_loss_method');
    issues.push({
      field: 'stop_loss_method',
      code: 'MISSING_FIELD',
      severity: 'error',
      message: 'Stop-loss method is missing.',
      suggestion: 'Define how initial risk is capped upon entering a trade.'
    });
  }

  // 6. Exit Plan Check
  const exitPlan = strategy.exit_plan;
  if (exitPlan && typeof exitPlan === 'object' && (exitPlan.type || exitPlan.description)) {
    const hasType = typeof exitPlan.type === 'string' && exitPlan.type.trim();
    const hasDesc = typeof exitPlan.description === 'string' && exitPlan.description.trim();

    if (hasType && hasDesc) {
      completedFields.push('exit_plan');
      const lower = exitPlan.description.toLowerCase();
      const matchedVague = VAGUE_PHRASES.find((p) => lower.includes(p));
      if (matchedVague) {
        ambiguousFields.push('exit_plan');
        issues.push({
          field: 'exit_plan',
          code: 'AMBIGUOUS_RULE',
          severity: 'warning',
          message: `Exit plan contains vague language: "${matchedVague}".`,
          suggestion: 'Specify concrete profit targets (e.g. 2R, previous resistance, trailing structure).'
        });
      }
    } else {
      issues.push({
        field: 'exit_plan',
        code: 'INCOMPLETE_DESCRIPTION',
        severity: 'warning',
        message: 'Exit plan requires both a strategy type and exit criteria description.',
        suggestion: 'Describe how winners are closed or trailed.'
      });
      missingFields.push('exit_plan');
    }
  } else {
    missingFields.push('exit_plan');
    issues.push({
      field: 'exit_plan',
      code: 'MISSING_FIELD',
      severity: 'error',
      message: 'Exit plan is missing.',
      suggestion: 'Define your take-profit strategy or exit criteria.'
    });
  }

  // 7. Risk Rules & Position Sizing Rules Check
  const riskRules = (Array.isArray(strategy.risk_rules) && strategy.risk_rules.length > 0)
    ? strategy.risk_rules
    : (Array.isArray(strategy.draft_rules) ? strategy.draft_rules.filter((r) => r.dimension === 'risk') : []);

  const sizingRules = (Array.isArray(strategy.position_sizing_rules) && strategy.position_sizing_rules.length > 0)
    ? strategy.position_sizing_rules
    : (Array.isArray(strategy.draft_rules) ? strategy.draft_rules.filter((r) => r.dimension === 'sizing') : []);

  let maxRiskAmount = null;
  let maxNotionalAmount = null;

  if (riskRules.length > 0) {
    completedFields.push('risk_rules');
    for (const rule of riskRules) {
      if (rule?.check?.type === 'max_risk_amount') {
        const val = Number(rule.check.amount);
        if (!Number.isFinite(val) || val <= 0) {
          issues.push({
            field: 'risk_rules',
            code: 'INVALID_NUMERIC_VALUE',
            severity: 'error',
            message: `Risk limit must be a positive number; got ${rule.check.amount}.`,
            suggestion: 'Set a positive numeric value for max_risk_amount.'
          });
        } else {
          maxRiskAmount = val;
        }
      }
    }
  } else {
    missingFields.push('risk_rules');
    issues.push({
      field: 'risk_rules',
      code: 'MISSING_FIELD',
      severity: 'error',
      message: 'Risk management rules are missing.',
      suggestion: 'Define a maximum dollar or percentage risk limit per trade.'
    });
  }

  if (sizingRules.length > 0) {
    completedFields.push('position_sizing_rules');
    for (const rule of sizingRules) {
      if (rule?.check?.type === 'max_notional') {
        const val = Number(rule.check.amount);
        if (!Number.isFinite(val) || val <= 0) {
          issues.push({
            field: 'position_sizing_rules',
            code: 'INVALID_NUMERIC_VALUE',
            severity: 'error',
            message: `Position sizing limit must be a positive number; got ${rule.check.amount}.`,
            suggestion: 'Set a positive numeric value for max_notional.'
          });
        } else {
          maxNotionalAmount = val;
        }
      }
    }
  }

  // 8. Incompatible Risk vs Position Sizing Contradiction Check
  // Risk cannot exceed total position notional (e.g. Risk $1000 on a $500 position is impossible)
  if (maxRiskAmount !== null && maxNotionalAmount !== null) {
    if (maxRiskAmount > maxNotionalAmount) {
      contradictoryFields.push('risk_rules');
      contradictoryFields.push('position_sizing_rules');
      issues.push({
        field: 'risk_rules',
        code: 'CONTRADICTORY_RULE',
        severity: 'error',
        message: `Maximum risk ($${maxRiskAmount}) cannot exceed maximum position size ($${maxNotionalAmount}).`,
        suggestion: 'Ensure your position sizing limit is equal to or greater than your maximum risk limit.'
      });
    }
  }

  // 9. Trading Schedule Check
  const sched = strategy.draft_trading_schedule || strategy.trading_schedule;
  if (sched && typeof sched === 'object') {
    const start = sched.start_time;
    const end = sched.end_time;
    if (typeof start === 'string' && typeof end === 'string') {
      if (start >= end) {
        contradictoryFields.push('trading_schedule');
        issues.push({
          field: 'trading_schedule',
          code: 'CONTRADICTORY_RULE',
          severity: 'error',
          message: `Trading window start time (${start}) must be before end time (${end}).`,
          suggestion: 'Check start and end times or adjust for day rollover.'
        });
      }
    }
    completedFields.push('trading_schedule');
  }

  // 10. Contradictions between Restrictions and Conditions
  const restrictions = Array.isArray(strategy.other_restrictions) ? strategy.other_restrictions : [];
  for (const restr of restrictions) {
    const restrLower = restr.toLowerCase();
    for (const entry of entryConditions) {
      const entryLower = entry.toLowerCase();
      if (
        (restrLower.includes('no breakout') && entryLower.includes('breakout')) ||
        (restrLower.includes('never trade crypto') && (markets.some(m => m.includes('BTC') || m.includes('ETH'))))
      ) {
        contradictoryFields.push('other_restrictions');
        issues.push({
          field: 'other_restrictions',
          code: 'CONTRADICTORY_RULE',
          severity: 'error',
          message: `Restriction "${restr}" contradicts strategy condition or market "${entry}".`,
          suggestion: 'Align your strict restrictions with your permitted setups and markets.'
        });
      }
    }
  }

  // Determine overall status
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;

  let status;
  let isValidForConfirmation;

  if (contradictoryFields.length > 0) {
    status = VALIDATION_STATUS.CONTRADICTORY;
    isValidForConfirmation = false;
  } else if (missingFields.length > 0 || errorCount > 0) {
    status = VALIDATION_STATUS.INCOMPLETE;
    isValidForConfirmation = false;
  } else if (ambiguousFields.length > 0) {
    status = VALIDATION_STATUS.AMBIGUOUS;
    // Ambiguity requires trader confirmation or clarification
    isValidForConfirmation = false;
  } else if (warningCount > 0) {
    status = VALIDATION_STATUS.NEEDS_TRADER_CONFIRMATION;
    isValidForConfirmation = true;
  } else {
    status = VALIDATION_STATUS.COMPLETE;
    isValidForConfirmation = true;
  }

  return {
    status,
    is_valid_for_confirmation: isValidForConfirmation,
    error_count: errorCount,
    warning_count: warningCount,
    issues,
    completed_fields: [...new Set(completedFields)],
    missing_fields: [...new Set(missingFields)],
    ambiguous_fields: [...new Set(ambiguousFields)],
    contradictory_fields: [...new Set(contradictoryFields)],
    suggested_improvements: suggestedImprovements
  };
}
