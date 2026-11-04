export interface ScoringRequest {
  request_id: string;
  scoring_version: string;
  strategy_version: {
    id: string;
    version_number: number;
    rules: unknown[];
    trading_schedule: Record<string, unknown> | null;
  };
  trade: Record<string, unknown>;
  evidence: Array<{ kind: string; payload: Record<string, unknown> }>;
}

export interface ScoringResponse {
  request_id: string;
  scoring_version: string;
  strategy_version_id: string;
  trade_id: string;
  decision_quality_score: number | null;
  coverage_pct: number;
  dimensions: unknown[];
  coaching: { mode: string; summary: string; actions: string[] };
  warnings: string[];
}

export interface ScoringClient {
  score(input: ScoringRequest): Promise<ScoringResponse>;
}

export class HttpScoringClient implements ScoringClient {
  constructor(
    private baseUrl: string,
    private token: string,
    private timeoutMs = 10_000,
  ) {}

  async score(input: ScoringRequest): Promise<ScoringResponse> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/v1/score`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-service-token': this.token,
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Scoring service returned ${response.status}: ${text.slice(0, 500)}`);
    }
    return (await response.json()) as ScoringResponse;
  }
}
