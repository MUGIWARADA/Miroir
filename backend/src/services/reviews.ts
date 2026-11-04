import type { Db } from '../db/types.js';
import { withIdentity } from '../db/types.js';
import { ApiError, notFound } from '../lib/errors.js';
import { canonicalJson, newId, sha256 } from '../lib/ids.js';
import type { ScoringClient, ScoringRequest, ScoringResponse } from './scoring-client.js';
import { mapTrade } from './trades.js';

const SCORING_VERSION = 'demo-v2';

export interface ReviewDeps {
  db: Db;
  scoring: ScoringClient;
}

function validateScoringResponse(response: ScoringResponse, request: ScoringRequest): void {
  if (
    response.request_id !== request.request_id ||
    response.scoring_version !== SCORING_VERSION ||
    response.strategy_version_id !== request.strategy_version.id ||
    response.trade_id !== request.trade.id ||
    !(
      response.decision_quality_score === null ||
      typeof response.decision_quality_score === 'number'
    ) ||
    typeof response.coverage_pct !== 'number' ||
    !Array.isArray(response.dimensions) ||
    !Array.isArray(response.warnings) ||
    !response.coaching
  ) {
    throw new ApiError(
      502,
      'invalid_scoring_response',
      'Scoring service returned an invalid result',
    );
  }
}

export async function createReview(deps: ReviewDeps, identityId: string, tradeId: string) {
  const context = await withIdentity(deps.db, identityId, async (tx) => {
    const tradeResult = await tx.query('SELECT * FROM trades WHERE id = $1 AND identity_id = $2', [
      tradeId,
      identityId,
    ]);
    const tradeRow = tradeResult.rows[0];
    if (!tradeRow) notFound('Trade not found');
    const versionResult = await tx.query(
      'SELECT * FROM strategy_versions WHERE id = $1 AND identity_id = $2',
      [tradeRow.strategy_version_id, identityId],
    );
    const version = versionResult.rows[0];
    if (!version) notFound('Strategy version not found');
    const evidenceResult = await tx.query(
      `SELECT kind, payload, created_at
       FROM trade_evidence
       WHERE trade_id = $1 AND identity_id = $2
       ORDER BY created_at, id`,
      [tradeId, identityId],
    );
    return { trade: mapTrade(tradeRow), version, evidence: evidenceResult.rows };
  });

  const trade = context.trade;
  const version = context.version;
  const evidence = context.evidence.map((row: any) => ({ kind: row.kind, payload: row.payload }));
  const inputHash = sha256(
    canonicalJson({
      scoring_version: SCORING_VERSION,
      strategy_version: {
        id: version.id,
        version_number: version.version_number,
        rules: version.rules,
        trading_schedule: version.trading_schedule ?? null,
      },
      trade,
      evidence,
    }),
  );

  const existing = await withIdentity(deps.db, identityId, async (tx) => {
    const result = await tx.query(
      'SELECT * FROM reviews WHERE trade_id = $1 AND input_hash = $2 AND identity_id = $3',
      [tradeId, inputHash, identityId],
    );
    return result.rows[0] ?? null;
  });
  if (existing) return { review: existing, cached: true };

  const request: ScoringRequest = {
    request_id: newId(),
    scoring_version: SCORING_VERSION,
    strategy_version: {
      id: version.id,
      version_number: version.version_number,
      rules: version.rules,
      trading_schedule: version.trading_schedule ?? null,
    },
    trade: trade as unknown as Record<string, unknown>,
    evidence,
  };

  let response: ScoringResponse;
  try {
    response = await deps.scoring.score(request);
  } catch {
    throw new ApiError(502, 'scoring_unavailable', 'Scoring service is unavailable');
  }
  validateScoringResponse(response, request);

  const saved = await withIdentity(deps.db, identityId, async (tx) => {
    const inserted = await tx.query(
      `INSERT INTO reviews (
         identity_id, trade_id, strategy_version_id, input_hash, scoring_version,
         decision_quality_score, coverage_pct, result
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
       ON CONFLICT (trade_id, input_hash) DO NOTHING
       RETURNING *`,
      [
        identityId,
        tradeId,
        version.id,
        inputHash,
        SCORING_VERSION,
        response.decision_quality_score,
        response.coverage_pct,
        JSON.stringify(response),
      ],
    );
    if (inserted.rows[0]) return inserted.rows[0];
    const conflict = await tx.query(
      'SELECT * FROM reviews WHERE trade_id = $1 AND input_hash = $2 AND identity_id = $3',
      [tradeId, inputHash, identityId],
    );
    return conflict.rows[0];
  });

  return { review: saved, cached: false };
}

export async function listTradeReviews(deps: ReviewDeps, identityId: string, tradeId: string) {
  return withIdentity(deps.db, identityId, async (tx) => {
    const trade = await tx.query('SELECT id FROM trades WHERE id = $1 AND identity_id = $2', [
      tradeId,
      identityId,
    ]);
    if (!trade.rows[0]) notFound('Trade not found');
    const result = await tx.query(
      'SELECT * FROM reviews WHERE trade_id = $1 AND identity_id = $2 ORDER BY created_at DESC, id',
      [tradeId, identityId],
    );
    return result.rows;
  });
}
