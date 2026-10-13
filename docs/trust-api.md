# AegisAgent Trust Evaluation API (Phase 5.1)

## Overview

The AegisAgent Trust Evaluation API exposes the completed AegisAgent trust infrastructure through a high-performance, stateless FastAPI service.

The API orchestrates three distinct architectural tiers:
1. **Blockchain Evidence Adapter (Source of Verifiable Truth)**: Retrieves cryptographically verifiable on-chain evidence (identity, reputation, validation checks) directly from deployed smart contracts on Monad Testnet (Chain ID `10143`).
2. **Deterministic Trust Engine (Authoritative Core)**: Computes authoritative, mathematically provable scores for global trust, risk, contextual task fit, confidence, and hiring recommendation.
3. **AI Trust Reasoning Layer (Explanatory Only)**: Synthesizes deterministic evaluation outputs into human-readable narratives, explaining strengths, concerns, and risk factors. The AI is strictly explanatory and has **zero authority** over scores, recommendations, or ranking.

---

## Core Principles

- **Deterministic Authority**: Numerical scores (`global_trust`, `risk`, `task_fit`, `confidence`) and the decision recommendation (`HIRE`, `REVIEW`, `DO_NOT_HIRE`) are computed exclusively by the deterministic trust engine.
- **AI Explanatory Role**: If the AI model times out, returns malformed data, or becomes unavailable, the API gracefully falls back to deterministic explanations without failing the request (returns HTTP 200).
- **Stateless & Database-Free**: No database persistence is introduced in this phase; all evaluations are derived in real time from verifiable on-chain state and deterministic formulas.
- **Security & Privacy**: No private keys, RPC credentials, internal server paths, or Python stack traces are exposed in API responses or errors.

---

## Architecture & Evaluation Pipeline

```text
HTTP Request
     │
     ▼
[Validation Layer] (Pydantic schemas, ID checks, length bounds)
     │
     ▼
[Unified Evidence Adapter] (Monad Testnet RPC @ Chain 10143)
  ├── Identity Registry (ERC-721 token, metadata, wallet verification)
  ├── Reputation Registry (client feedback, ratings, reviewer diversity)
  └── Validation Registry (independent validator audits, success rates)
     │
     ▼
AgentEvidence + Snapshot Metadata
     │
     ▼
[Deterministic Trust Engine]
  ├── Base Scoring (Reputation 30%, Validation 25%, Identity 15%, Reliability 15%)
  ├── Behavioral Risk Evaluation (Reviewer concentration, collusion, conflict penalties)
  ├── Contextual Task Fit (Capabilities & domain matching)
  ├── Confidence Score (Evidence volume & diversity)
  └── Recommendation Tier (HIRE / REVIEW / DO_NOT_HIRE)
     │
     ▼
[AI Trust Reasoning Layer] (Gemini / Mock Provider)
  ├── Natural language synthesis of strengths and concerns
  └── Fallback resilience if AI unavailable
     │
     ▼
HTTP Structured Response
```

---

## Required Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Instant health check (no RPC or AI dependency) |
| `GET` | `/agents/{agent_id}/trust` | Complete baseline trust evaluation & snapshot for an agent |
| `GET` | `/agents/{agent_id}/risk` | Risk-focused assessment, risk tier, and active risk factors |
| `POST` | `/trust/evaluate` | Primary task-specific evaluation and AI reasoning pipeline |
| `POST` | `/trust/compare` | Deterministic comparative ranking for up to 10 agents |

---

## Endpoints Specification

### 1. `GET /health`
Returns service availability status without querying external RPC or AI providers.

**Response (200 OK)**:
```json
{
  "status": "ok"
}
```

---

### 2. `GET /agents/{agent_id}/trust`
Retrieves the comprehensive baseline trust evaluation for a single agent.

**Path Parameters**:
- `agent_id` (integer, `> 0`): The token ID of the agent registered in the Identity Registry.

**Example Request**:
```http
GET /agents/1/trust HTTP/1.1
Host: localhost:8000
```

**Example Response (200 OK)**:
```json
{
  "agent_id": 1,
  "scores": {
    "global_trust": 22.52,
    "risk": 18.0,
    "task_fit": 0.0,
    "confidence": 42.0
  },
  "recommendation": "DO_NOT_HIRE",
  "evidence": {
    "identity": {
      "status": "AVAILABLE",
      "exists": true,
      "metadata_completeness": 30.0,
      "wallet_verified": true,
      "endpoint_verified": false,
      "capability_count": 0
    },
    "reputation": {
      "status": "MISSING",
      "feedback_count": 0,
      "reviewer_count": 0,
      "positive_feedback_count": 0,
      "negative_feedback_count": 0,
      "average_score": null
    },
    "validation": {
      "status": "MISSING",
      "validation_count": 0,
      "validator_count": 0,
      "successful_validation_count": 0,
      "failed_validation_count": 0,
      "days_since_last_validation": null
    }
  },
  "risks": [],
  "ai_reasoning": {
    "status": "AVAILABLE",
    "summary": "Agent exhibits verified on-chain wallet identity, but lacks reputation feedback.",
    "strengths": [],
    "concerns": [],
    "risk_explanation": [],
    "task_fit_explanation": "No specific task evaluated.",
    "recommendation_explanation": "Recommendation is DO_NOT_HIRE due to baseline confidence.",
    "confidence_explanation": "Confidence rated at 42.0% based on registered identity.",
    "suggested_next_checks": ["Acquire initial client feedback on-chain."]
  },
  "snapshot": {
    "chain_id": 10143,
    "block_number": 70157035,
    "retrieved_at": "2026-10-11T16:18:10Z"
  }
}
```

---

### 3. `GET /agents/{agent_id}/risk`
Returns risk-focused metrics and active risk factors without requiring a specific task evaluation.

**Path Parameters**:
- `agent_id` (integer, `> 0`): The target agent token ID.

**Example Request**:
```http
GET /agents/1/risk HTTP/1.1
Host: localhost:8000
```

**Example Response (200 OK)**:
```json
{
  "agent_id": 1,
  "risk_score": 31.5,
  "risk_level": "MEDIUM",
  "factors": [
    {
      "name": "reviewer_concentration",
      "severity": 62.0,
      "description": "High reviewer concentration detected. Single reviewer submitted majority of feedback."
    }
  ],
  "confidence": 42.0
}
```

**Risk Level Presentation Tiers**:
- `LOW`: `risk_score < 25.0`
- `MEDIUM`: `25.0 <= risk_score < 60.0`
- `HIGH`: `60.0 <= risk_score < 85.0`
- `CRITICAL`: `risk_score >= 85.0`

---

### 4. `POST /trust/evaluate`
Primary endpoint for task-contextual trust evaluation with explanatory AI reasoning.

**Request Body**:
```json
{
  "agent_id": 1,
  "task": {
    "description": "Analyze decentralized finance liquidity pools and token risk profiles",
    "required_capabilities": [
      "python",
      "data-analysis",
      "defi"
    ],
    "domain": "finance"
  },
  "include_ai": true
}
```

**Field Constraints**:
- `description`: 1 to 2,000 characters; cannot be blank or whitespace-only.
- `required_capabilities`: 0 to 20 items; each item 1 to 100 characters.
- `domain`: optional string; up to 100 characters.
- `include_ai`: boolean flag (defaults to `true`).

**Example Response (200 OK)**:
```json
{
  "agent_id": 1,
  "scores": {
    "global_trust": 68.5,
    "risk": 15.0,
    "task_fit": 85.0,
    "confidence": 72.0
  },
  "recommendation": "REVIEW",
  "evidence": {
    "identity": {
      "status": "AVAILABLE",
      "exists": true,
      "metadata_completeness": 80.0,
      "wallet_verified": true,
      "endpoint_verified": true,
      "capability_count": 3
    },
    "reputation": {
      "status": "AVAILABLE",
      "feedback_count": 18,
      "reviewer_count": 7,
      "positive_feedback_count": 16,
      "negative_feedback_count": 2,
      "average_score": 4.6
    },
    "validation": {
      "status": "AVAILABLE",
      "validation_count": 6,
      "validator_count": 3,
      "successful_validation_count": 6,
      "failed_validation_count": 0,
      "days_since_last_validation": 3
    }
  },
  "risks": [],
  "ai_reasoning": {
    "status": "AVAILABLE",
    "summary": "Agent exhibits consistent validation performance and high feedback satisfaction across distinct clients.",
    "strengths": [
      "High validation success rate",
      "Strong reviewer diversity"
    ],
    "concerns": [],
    "risk_explanation": [],
    "task_fit_explanation": "Declared capabilities match 2 out of 3 requested skills with aligned financial domain.",
    "recommendation_explanation": "Recommendation is REVIEW based on trust score (68.5) and task fit (85.0).",
    "confidence_explanation": "Strong confidence (72.0%) supported by 6 validation checks and 18 reviews.",
    "suggested_next_checks": ["Inspect specific telemetry logs prior to job execution."]
  },
  "snapshot": {
    "chain_id": 10143,
    "block_number": 70157035,
    "retrieved_at": "2026-10-11T16:18:10Z"
  }
}
```

---

### 5. `POST /trust/compare`
Evaluates multiple candidate agents against a single benchmark task and produces an authoritative deterministic ranking.

**Request Body**:
```json
{
  "agent_ids": [1, 2, 3],
  "task": {
    "description": "Analyze financial datasets",
    "required_capabilities": [
      "python",
      "data-analysis"
    ],
    "domain": "finance"
  }
}
```

**Constraints**:
- `agent_ids`: 1 to 10 items.
- Duplicate agent IDs are rejected (`HTTP 422`).
- Empty lists are rejected (`HTTP 422`).
- Invalid IDs (negative, zero, floating-point) are rejected (`HTTP 422`).

**Deterministic Ranking Policy**:
Ranking is strictly deterministic and does NOT use AI. Sorting applies the following precedence:
1. **Recommendation Tier**: `HIRE` (highest) > `REVIEW` > `DO_NOT_HIRE` (lowest)
2. **Global Trust Score**: Higher is prioritized
3. **Task Fit Score**: Higher is prioritized
4. **Behavioral Risk**: Lower risk is prioritized
5. **Confidence Rating**: Higher confidence is prioritized
6. **Agent ID**: Ascending token ID as stable deterministic tie-breaker

**Example Response (200 OK)**:
```json
{
  "task": {
    "description": "Analyze financial datasets",
    "required_capabilities": ["python", "data-analysis"],
    "domain": "finance"
  },
  "agents": [
    {
      "agent_id": 1,
      "global_trust": 72.4,
      "task_fit": 91.0,
      "risk": 18.2,
      "confidence": 67.0,
      "recommendation": "REVIEW"
    },
    {
      "agent_id": 2,
      "global_trust": 88.5,
      "task_fit": 95.0,
      "risk": 5.0,
      "confidence": 85.0,
      "recommendation": "HIRE"
    },
    {
      "agent_id": 3,
      "global_trust": 31.0,
      "task_fit": 40.0,
      "risk": 65.0,
      "confidence": 45.0,
      "recommendation": "DO_NOT_HIRE"
    }
  ],
  "ranking": [2, 1, 3]
}
```

---

## Structured Error Handling

All errors adhere to a standardized error envelope:

```json
{
  "error": {
    "code": "AGENT_NOT_FOUND",
    "message": "Agent 999 not found in Identity Registry.",
    "details": {
      "agent_id": 999
    }
  }
}
```

### Error Taxonomy & HTTP Status Mapping

| Error Code | HTTP Status | Description |
| :--- | :--- | :--- |
| `INVALID_REQUEST` | `400` / `422` | Request payload fails schema validation, limits, or types. |
| `AGENT_NOT_FOUND` | `404` | Agent token ID does not exist in on-chain Identity Registry. |
| `RPC_ERROR` | `502` | Monad RPC node is unreachable, times out, or returns network failure. |
| `CONTRACT_ERROR` | `502` | Smart contract call reverts unexpectedly. |
| `INVALID_BLOCKCHAIN_DATA` | `502` | Unparseable or corrupt data received from contract call. |
| `AI_UNAVAILABLE` | `503` | AI reasoning provider unreachable (when AI is explicitly required). |
| `TRUST_EVALUATION_ERROR` | `500` | Unhandled internal evaluation failure (stack traces suppressed). |

### Important Semantics
- **RPC failure is NOT Trust = 0**: An RPC failure raises `502 RPC_ERROR`.
- **Missing reputation is NOT an RPC error**: An existing agent with 0 feedback entries returns `200 OK` with `reputation.status: "MISSING"`.
- **AI failure does not crash the endpoint**: If Gemini or the AI reasoning provider is down, times out, or returns invalid output, the evaluation returns `200 OK` with `ai_reasoning.status: "UNAVAILABLE"` preserving deterministic trust scores.
- **AI Optionality vs 503 AI_UNAVAILABLE**: The evaluation API defaults to optional advisory AI. When `include_ai=true` and AI fails, HTTP 200 is returned with unavailable status. When `include_ai=false`, AI generation is skipped and returns HTTP 200 with `status: "UNAVAILABLE"` and summary `"AI reasoning was not requested."`. The `AIUnavailableException` (`503 AI_UNAVAILABLE`) exists in `app.api.errors` for future strict evaluation modes where AI is mandatory, but is not raised on standard evaluation endpoints.
- **Blockchain Snapshot Consistency**: The `snapshot` block number is captured via `get_latest_block()` at the initiation of evidence collection. Subsequent adapter calls (`ownerOf`, `getClients`, `getAgentValidations`) query the node using standard `latest` state. This provides best-effort point-in-time state rather than an atomic single-transaction Multicall read.

---

## Running the API Locally

### 1. Environment Setup
```bash
cd backend
source venv/bin/activate
pip install -r requirements.txt
```

### 2. Launch Dev Server
```bash
PYTHONPATH=backend uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Interactive Documentation
- **Swagger UI**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **OpenAPI Schema**: [http://localhost:8000/openapi.json](http://localhost:8000/openapi.json)

### 4. Running Test Suites
```bash
PYTHONPATH=backend pytest tests/api/ -v
```
