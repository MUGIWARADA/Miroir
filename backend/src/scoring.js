const WEIGHTS = { risk: 30, sizing: 20, plan: 25, timing: 15, emotion: 10 };
const DIMENSION_ORDER = ['risk', 'sizing', 'plan', 'timing', 'emotion'];

const ruleResult = (ruleId, label, status, reason) => ({ rule_id: ruleId, label, status, reason });
const dimensionResult = (dimension, status, reason, label) => ({
  dimension,
  status,
  score_pct: status === 'cannot_assess' ? null : status === 'followed' ? 100 : 0,
  rules: [ruleResult(dimension, label, status, reason)]
});

const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const evidenceValue = (trade, kind, field) =>
  (Array.isArray(trade.evidence) ? trade.evidence : []).find(
    (item) => item && typeof item === 'object' && item.kind === kind
  )?.payload?.[field];

function assessTiming(trade, schedule) {
  if (!schedule || !Array.isArray(schedule.days) || !schedule.days.length || !schedule.start_time || !schedule.end_time) {
    return dimensionResult('timing', 'cannot_assess', 'No trading schedule is configured in the confirmed strategy.', 'Trading hours');
  }

  const openedAt = trade.opened_at || trade.entry_at;
  if (!openedAt) {
    return dimensionResult('timing', 'cannot_assess', 'Trade opening timestamp is missing from evidence.', 'Trading hours');
  }

  const date = new Date(openedAt);
  if (Number.isNaN(date.getTime())) {
    return dimensionResult('timing', 'cannot_assess', 'Trade opening timestamp is not a valid date format.', 'Trading hours');
  }

  const day = date.toLocaleDateString('en-US', { weekday: 'long', timeZone: schedule.timezone || 'UTC' }).toLowerCase();
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: schedule.timezone || 'UTC' });
  const allowedDays = schedule.days.map((v) => String(v).toLowerCase());
  const dayAllowed = allowedDays.includes(day);
  const timeAllowed = time >= schedule.start_time && time <= schedule.end_time;
  const allowed = dayAllowed && timeAllowed;

  if (!dayAllowed) {
    return dimensionResult('timing', 'broken', `Trade opened on ${day}, which is not an allowed trading day (${allowedDays.join(', ')}).`, 'Trading hours');
  }
  if (!timeAllowed) {
    return dimensionResult('timing', 'broken', `Trade opened at ${time} ${schedule.timezone || 'UTC'}, outside the allowed window (${schedule.start_time} - ${schedule.end_time}).`, 'Trading hours');
  }

  return dimensionResult('timing', 'followed', `Trade opened inside the allowed schedule (${day} at ${time} ${schedule.timezone || 'UTC'}).`, 'Trading hours');
}

export function evaluateTrade(trade, strategy) {
  // Strategy rules resolution: do NOT use hardcoded defaults if strategy did not define limits!
  const allRules = Array.isArray(strategy?.rules)
    ? strategy.rules
    : Array.isArray(strategy?.draft_rules)
    ? strategy.draft_rules
    : [];

  const riskRule = allRules.find((r) => r.dimension === 'risk') ||
    (Array.isArray(strategy?.risk_rules) ? strategy.risk_rules[0] : null);

  const sizingRule = allRules.find((r) => r.dimension === 'sizing') ||
    (Array.isArray(strategy?.position_sizing_rules) ? strategy.position_sizing_rules[0] : null);

  const planRule = allRules.find((r) => r.dimension === 'plan');
  const emotionRule = allRules.find((r) => r.dimension === 'emotion');
  const schedule = strategy?.trading_schedule || strategy?.draft_trading_schedule;

  // Trade Evidence
  const risk = trade.risk_amount ?? trade.initial_risk;
  const notional = finite(trade.notional)
    ? trade.notional
    : finite(trade.quantity) && finite(trade.entry_price)
    ? Math.abs(trade.quantity * trade.entry_price)
    : null;
  const setupNote = evidenceValue(trade, 'note', 'setup_note');
  const emotion = evidenceValue(trade, 'state', 'emotional_state');

  // Dimension 1: Risk Management
  let riskAssessment;
  if (!riskRule || !finite(Number(riskRule.check?.amount))) {
    riskAssessment = dimensionResult('risk', 'cannot_assess', 'No risk limit is configured in the confirmed strategy.', 'Risk limit');
  } else {
    const limit = Number(riskRule.check.amount);
    if (!finite(risk)) {
      riskAssessment = dimensionResult('risk', 'cannot_assess', 'Initial trade risk amount is missing from evidence.', 'Risk limit');
    } else if (risk <= limit) {
      riskAssessment = dimensionResult('risk', 'followed', `Initial risk $${risk} is within the $${limit} limit.`, 'Risk limit');
    } else {
      riskAssessment = dimensionResult('risk', 'broken', `Initial risk $${risk} exceeds the $${limit} maximum limit.`, 'Risk limit');
    }
  }

  // Dimension 2: Position Sizing
  let sizingAssessment;
  if (!sizingRule || !finite(Number(sizingRule.check?.amount))) {
    sizingAssessment = dimensionResult('sizing', 'cannot_assess', 'No position sizing limit is configured in the confirmed strategy.', 'Position size limit');
  } else {
    const limit = Number(sizingRule.check.amount);
    if (!finite(notional)) {
      sizingAssessment = dimensionResult('sizing', 'cannot_assess', 'Quantity and entry price are needed to assess position notional.', 'Position size limit');
    } else if (notional <= limit) {
      sizingAssessment = dimensionResult('sizing', 'followed', `Position notional $${notional} is within the $${limit} limit.`, 'Position size limit');
    } else {
      sizingAssessment = dimensionResult('sizing', 'broken', `Position notional $${notional} exceeds the $${limit} limit.`, 'Position size limit');
    }
  }

  // Dimension 3: Plan Adherence (Setup note / entry criteria)
  let planAssessment;
  if (!planRule) {
    planAssessment = dimensionResult('plan', 'cannot_assess', 'No plan documentation rule is configured in the confirmed strategy.', 'Record a setup note');
  } else if (typeof setupNote === 'string' && setupNote.trim()) {
    planAssessment = dimensionResult('plan', 'followed', `Setup note recorded: "${setupNote.trim().slice(0, 100)}"`, 'Record a setup note');
  } else {
    planAssessment = dimensionResult('plan', 'cannot_assess', 'Evidence field setup_note is missing; this is not counted as an unverified breach.', 'Record a setup note');
  }

  // Dimension 4: Execution Timing
  const timingAssessment = assessTiming(trade, schedule);

  // Dimension 5: Emotional Control
  let emotionAssessment;
  if (!emotionRule) {
    emotionAssessment = dimensionResult('emotion', 'cannot_assess', 'No emotional state rule is configured in the confirmed strategy.', 'Record a calm emotional state');
  } else if (typeof emotion !== 'string' || !emotion.trim()) {
    emotionAssessment = dimensionResult('emotion', 'cannot_assess', 'Evidence field emotional_state is missing from trade log.', 'Record a calm emotional state');
  } else {
    const normalizedEmotion = emotion.trim().toLowerCase();
    const expected = (emotionRule.check?.value || 'calm').toLowerCase();
    if (normalizedEmotion === expected) {
      emotionAssessment = dimensionResult('emotion', 'followed', `Recorded emotional state: '${emotion.trim()}'.`, 'Record a calm emotional state');
    } else {
      emotionAssessment = dimensionResult('emotion', 'broken', `Recorded '${emotion.trim()}' instead of the required '${expected}' state.`, 'Record a calm emotional state');
    }
  }

  const dimensions = [
    riskAssessment,
    sizingAssessment,
    planAssessment,
    timingAssessment,
    emotionAssessment
  ];

  let assessableWeight = 0;
  let earnedWeight = 0;
  for (const item of dimensions) {
    if (item.status !== 'cannot_assess') {
      assessableWeight += WEIGHTS[item.dimension];
      if (item.status === 'followed') earnedWeight += WEIGHTS[item.dimension];
    }
  }

  const score = assessableWeight ? Math.round((earnedWeight / assessableWeight) * 100) : null;
  const coverage = Math.round(assessableWeight);
  const failures = dimensions.some((item) => item.status === 'broken');
  const hasMissing = dimensions.some((item) => item.status === 'cannot_assess');

  const actions = [];
  if (hasMissing) actions.push('Add missing trade evidence (risk, sizing, or timestamps) to increase framework coverage.');
  if (failures) actions.push('Review the rules marked as broken and adhere to confirmed parameters on future executions.');
  if (!hasMissing && !failures) actions.push('Disciplined execution: maintain identical risk and timing consistency on your next setup.');

  return {
    decision_quality_score: score,
    coverage_pct: coverage,
    dimensions,
    coaching: {
      summary: score === null
        ? 'There is not enough evidence to score this trade against your confirmed strategy.'
        : `Decision Quality ${score}/100. ${failures ? 'One or more assessable rules were broken.' : hasMissing ? 'Some rules could not be assessed.' : 'You followed every assessed rule.'}`,
      actions
    },
    ai_explanation: { status: 'not_configured' },
    strategy_version_id: strategy?.current_version_id || null,
    evaluated_at: new Date().toISOString()
  };
}

export { DIMENSION_ORDER, WEIGHTS };
