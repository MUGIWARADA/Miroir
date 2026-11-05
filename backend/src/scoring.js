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
const evidenceValue = (trade, kind, field) => (Array.isArray(trade.evidence) ? trade.evidence : []).find((item) => item && typeof item === 'object' && item.kind === kind)?.payload?.[field];

function assessTiming(trade, schedule) {
  const openedAt = trade.opened_at || trade.entry_at;
  if (!openedAt || !schedule?.days?.length || !schedule.start_time || !schedule.end_time) {
    return dimensionResult('timing', 'cannot_assess', 'Opening time or schedule evidence is missing.', 'Trading hours');
  }
  const date = new Date(openedAt);
  if (Number.isNaN(date.getTime())) return dimensionResult('timing', 'cannot_assess', 'Opening time is not a valid date.', 'Trading hours');
  const day = date.toLocaleDateString('en-US', { weekday: 'long', timeZone: schedule.timezone || 'UTC' }).toLowerCase();
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: schedule.timezone || 'UTC' });
  const allowed = schedule.days.map((value) => value.toLowerCase()).includes(day) && time >= schedule.start_time && time <= schedule.end_time;
  return dimensionResult('timing', allowed ? 'followed' : 'broken', allowed ? 'Trade opened inside the allowed trading schedule.' : 'Trade opened outside the allowed trading schedule.', 'Trading hours');
}

export function evaluateTrade(trade, strategy) {
  const riskLimit = Number(strategy?.draft_rules?.find((rule) => rule.dimension === 'risk')?.check?.amount ?? 100);
  const notionalLimit = Number(strategy?.draft_rules?.find((rule) => rule.dimension === 'sizing')?.check?.amount ?? 10000);
  const risk = trade.risk_amount ?? trade.initial_risk;
  const notional = finite(trade.notional) ? trade.notional : finite(trade.quantity) && finite(trade.entry_price) ? Math.abs(trade.quantity * trade.entry_price) : null;
  const setupNote = evidenceValue(trade, 'note', 'setup_note');
  const emotion = evidenceValue(trade, 'state', 'emotional_state');

  const dimensions = [
    dimensionResult('risk', finite(risk) ? (risk <= riskLimit ? 'followed' : 'broken') : 'cannot_assess', finite(risk) ? (risk <= riskLimit ? `Initial risk ${risk} is within the ${riskLimit} limit.` : `Initial risk ${risk} exceeds the ${riskLimit} limit.`) : 'Initial risk amount is missing.', 'Risk limit'),
    dimensionResult('sizing', finite(notional) ? (notional <= notionalLimit ? 'followed' : 'broken') : 'cannot_assess', finite(notional) ? (notional <= notionalLimit ? `Position notional ${notional} is within the ${notionalLimit} limit.` : `Position notional ${notional} exceeds the ${notionalLimit} limit.`) : 'Quantity and entry price are needed to assess position notional.', 'Position size limit'),
    dimensionResult('plan', typeof setupNote === 'string' && setupNote.trim() ? 'followed' : 'cannot_assess', typeof setupNote === 'string' && setupNote.trim() ? 'Evidence field setup_note is present.' : 'Evidence field setup_note is missing; this is not counted as a breach.', 'Record a setup note'),
    assessTiming(trade, strategy?.draft_trading_schedule),
    dimensionResult('emotion', typeof emotion === 'string' ? (emotion.toLowerCase() === 'calm' ? 'followed' : 'broken') : 'cannot_assess', typeof emotion !== 'string' ? 'Evidence field emotional_state is missing.' : emotion.toLowerCase() === 'calm' ? 'You recorded a calm state.' : `You recorded '${emotion}' instead of 'calm'.`, 'Record a calm emotional state')
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
  if (hasMissing) actions.push('Add the missing risk, sizing, schedule, or evidence details next time to improve coverage.');
  if (failures) actions.push('Review the rule evidence marked as broken and consider how to follow the confirmed plan.');
  if (!hasMissing && !failures) actions.push('Keep applying the same rules and log evidence on every trade.');

  return {
    decision_quality_score: score,
    coverage_pct: coverage,
    dimensions,
    coaching: {
      summary: score === null ? 'There is not enough evidence to assess this trade.' : `Decision Quality ${score}/100. ${failures ? 'One or more assessable rules were broken.' : hasMissing ? 'Some rules could not be assessed.' : 'You followed every assessed rule.'}`,
      actions
    },
    ai_explanation: { status: 'not_configured' }
  };
}

export { DIMENSION_ORDER, WEIGHTS };
