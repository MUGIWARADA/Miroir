export function buildTrendSeries(trades, reviews) {
  const tradeById = new Map(trades.map((trade) => [trade.id, trade]));
  const weeks = new Map();
  for (const review of reviews) {
    const score = review.result?.decision_quality_score;
    if (score === null || !Number.isFinite(score)) continue;
    const trade = tradeById.get(review.trade_id);
    const dateValue = trade?.closed_at || trade?.opened_at || trade?.created_at || review.created_at;
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) continue;
    const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = monday.getUTCDay() || 7;
    monday.setUTCDate(monday.getUTCDate() - day + 1);
    const key = monday.toISOString().slice(0, 10);
    const values = weeks.get(key) || [];
    values.push(score);
    weeks.set(key, values);
  }
  return [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([weekStart, scores]) => ({
    week: new Date(`${weekStart}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
    score: Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length)
  }));
}
