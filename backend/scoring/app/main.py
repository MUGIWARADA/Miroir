"""FastAPI entrypoint for the stateless Miroir scoring service.

No database access. Guarded by a shared service token. The Node API is the only
caller; the frontend never talks to this service directly.
"""

from __future__ import annotations

import hmac
import os

from fastapi import FastAPI, Header, HTTPException

from .models import ScoreRequest, ScoreResponse
from .scoring import SCORING_VERSION, score

SERVICE_TOKEN = os.environ.get("SCORING_SERVICE_TOKEN", "dev-scoring-token")
if os.environ.get("NODE_ENV") == "production" and (
    SERVICE_TOKEN == "dev-scoring-token"
    or SERVICE_TOKEN.strip() != SERVICE_TOKEN
    or len(SERVICE_TOKEN) < 32
):
    raise RuntimeError("Set a unique SCORING_SERVICE_TOKEN of at least 32 characters in production.")

app = FastAPI(
    title="Miroir Scoring Service",
    version=SCORING_VERSION,
    description="Deterministic, model-free Decision Quality scoring. No database access.",
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "miroir-scoring", "scoring_version": SCORING_VERSION}


@app.post("/v1/score", response_model=ScoreResponse)
def score_trade(
    request: ScoreRequest,
    x_service_token: str | None = Header(default=None),
) -> ScoreResponse:
    if not x_service_token or not hmac.compare_digest(x_service_token, SERVICE_TOKEN):
        raise HTTPException(status_code=401, detail="Invalid service token")
    if request.scoring_version != SCORING_VERSION:
        raise HTTPException(status_code=400, detail=f"Unsupported scoring_version '{request.scoring_version}'")
    return score(request)
