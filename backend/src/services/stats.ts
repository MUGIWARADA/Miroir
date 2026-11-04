import { Decimal } from 'decimal.js';
import type { Db } from '../db/types.js';
import { withIdentity } from '../db/types.js';
import { dec, round } from '../lib/money.js';

export interface StatsQuery {
  currency: string;
  strategy_version_id?: string;
  from?: string;
  to?: string;
}

export async function getStats(db: Db, identityId: string, query: StatsQuery) {
  return withIdentity(db, identityId, async (tx) => {
    const params: unknown[] = [identityId, query.currency];
    let where = 'WHERE identity_id = $1 AND closed_at IS NOT NULL AND currency = $2';
    if (query.strategy_version_id) {
      params.push(query.strategy_version_id);
      where += ` AND strategy_version_id = $${params.length}`;
    }
    if (query.from) {
      params.push(query.from);
      where += ` AND closed_at >= $${params.length}`;
    }
    if (query.to) {
      params.push(query.to);
      where += ` AND closed_at <= $${params.length}`;
    }
    const result = await tx.query(
      `SELECT id, closed_at, realized_pnl, fees, r_multiple
       FROM trades ${where}
       ORDER BY closed_at, id`,
      params,
    );

    let grossProfit = new Decimal(0);
    let grossLoss = new Decimal(0);
    let net = new Decimal(0);
    let fees = new Decimal(0);
    let wins = 0;
    let losses = 0;
    let breakeven = 0;
    let rSum = new Decimal(0);
    let rCount = 0;
    let cumulative = new Decimal(0);
    const curve: Array<{ trade_id: string; closed_at: string; cumulative_realized_pnl: number }> =
      [];

    for (const row of result.rows) {
      const pnl = dec(row.realized_pnl);
      net = net.plus(pnl);
      fees = fees.plus(dec(row.fees));
      cumulative = cumulative.plus(pnl);
      if (pnl.greaterThan(0)) {
        wins += 1;
        grossProfit = grossProfit.plus(pnl);
      } else if (pnl.lessThan(0)) {
        losses += 1;
        grossLoss = grossLoss.plus(pnl.abs());
      } else {
        breakeven += 1;
      }
      if (row.r_multiple !== null && row.r_multiple !== undefined) {
        rSum = rSum.plus(dec(row.r_multiple));
        rCount += 1;
      }
      curve.push({
        trade_id: row.id,
        closed_at: new Date(row.closed_at).toISOString(),
        cumulative_realized_pnl: round(cumulative),
      });
    }

    const closed = result.rows.length;
    const avgWin = wins > 0 ? grossProfit.div(wins) : null;
    const avgLoss = losses > 0 ? grossLoss.div(losses) : null;
    const payoffRatio = avgWin && avgLoss && !avgLoss.isZero() ? avgWin.div(avgLoss) : null;
    const profitFactor = !grossLoss.isZero() ? grossProfit.div(grossLoss) : null;

    return {
      currency: query.currency,
      timezone: 'UTC',
      sample_size: closed,
      wins,
      losses,
      breakeven,
      win_rate: closed > 0 ? round(new Decimal(wins).div(closed).times(100)) : null,
      net_realized_pnl: round(net),
      gross_profit: round(grossProfit),
      gross_loss: round(grossLoss),
      total_fees: round(fees),
      average_win: avgWin ? round(avgWin) : null,
      average_loss: avgLoss ? round(avgLoss) : null,
      payoff_ratio: payoffRatio ? round(payoffRatio) : null,
      profit_factor: profitFactor ? round(profitFactor) : null,
      expectancy: closed > 0 ? round(net.div(closed)) : null,
      average_r_multiple: rCount > 0 ? round(rSum.div(rCount)) : null,
      cumulative_realized_pnl_curve: curve,
    };
  });
}

export interface ProgressQuery {
  strategy_id?: string;
}

type ProgressTrend =
  | {
      eligible: true;
      direction: 'improving' | 'declining' | 'flat';
      slope_per_trade: number;
      sample_size: number;
    }
  | { eligible: false; reason: string; sample_size: number };

interface DimensionResult {
  dimension: string;
  status: 'followed' | 'broken' | 'cannot_assess';
  weight: number;
  assessable_weight: number;
  earned_weight: number;
  rules: Array<{ rule_id: string; status: string }>;
}

export async function getProgress(db: Db, identityId: string, query: ProgressQuery) {
  return withIdentity(db, identityId, async (tx) => {
    const params: unknown[] = [identityId];
    let joinFilter = '';
    if (query.strategy_id) {
      params.push(query.strategy_id);
      joinFilter = `AND sv.strategy_id = $${params.length}`;
    }
    const result = await tx.query(
      `SELECT DISTINCT ON (r.trade_id)
         r.id, r.trade_id, r.strategy_version_id, r.decision_quality_score,
         r.coverage_pct, r.result, r.created_at, sv.version_number, sv.strategy_id
       FROM reviews r
       JOIN strategy_versions sv ON sv.id = r.strategy_version_id
       WHERE r.identity_id = $1 AND sv.identity_id = $1 ${joinFilter}
       ORDER BY r.trade_id, r.created_at DESC, r.id`,
      params,
    );

    const byVersion = new Map<string, any[]>();
    for (const row of result.rows) {
      const list = byVersion.get(row.strategy_version_id) ?? [];
      list.push(row);
      byVersion.set(row.strategy_version_id, list);
    }

    const versions = [];
    for (const [strategyVersionId, rows] of byVersion) {
      rows.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      const assessed = rows.filter((row) => row.decision_quality_score !== null);
      const dimensionCounts: Record<string, Record<string, number>> = {};
      let scoreSum = 0;
      let coverageSum = 0;
      for (const row of rows) {
        coverageSum += Number(row.coverage_pct);
        if (row.decision_quality_score !== null) scoreSum += Number(row.decision_quality_score);
        const dimensions: DimensionResult[] = row.result?.dimensions ?? [];
        for (const dimension of dimensions) {
          const counts = dimensionCounts[dimension.dimension] ?? {
            followed: 0,
            broken: 0,
            cannot_assess: 0,
          };
          counts[dimension.status] = (counts[dimension.status] ?? 0) + 1;
          dimensionCounts[dimension.dimension] = counts;
        }
      }

      let trend: ProgressTrend;
      if (assessed.length >= 5) {
        const scores = assessed.map((row) => Number(row.decision_quality_score));
        const n = scores.length;
        const meanX = (n - 1) / 2;
        const meanY = scores.reduce((a, b) => a + b, 0) / n;
        let numerator = 0;
        let denominator = 0;
        scores.forEach((y, x) => {
          numerator += (x - meanX) * (y - meanY);
          denominator += (x - meanX) ** 2;
        });
        const slope = denominator === 0 ? 0 : numerator / denominator;
        trend = {
          eligible: true,
          direction: slope > 0.5 ? 'improving' : slope < -0.5 ? 'declining' : 'flat',
          slope_per_trade: Number(slope.toFixed(3)),
          sample_size: n,
        };
      } else {
        trend = {
          eligible: false,
          reason:
            'Trend claims require at least 5 comparable assessed trades on the same strategy version.',
          sample_size: assessed.length,
        };
      }

      versions.push({
        strategy_id: rows[0]?.strategy_id,
        strategy_version_id: strategyVersionId,
        version_number: rows[0]?.version_number,
        reviewed_trades: rows.length,
        assessed_trades: assessed.length,
        unassessed_trades: rows.length - assessed.length,
        average_decision_quality_score:
          assessed.length > 0 ? Number((scoreSum / assessed.length).toFixed(2)) : null,
        average_coverage_pct:
          rows.length > 0 ? Number((coverageSum / rows.length).toFixed(2)) : null,
        dimension_counts: dimensionCounts,
        trend,
      });
    }

    return { versions };
  });
}
