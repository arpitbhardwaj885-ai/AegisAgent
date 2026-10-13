import pytest
from unittest.mock import MagicMock
from fastapi.testclient import TestClient

from app.main import app
from app.api.dependencies import get_evidence_adapter, get_ai_reasoner
from app.trust.blockchain.evidence_adapter import AgentEvidence
from app.trust.blockchain.errors import AgentNotFoundError, RPCError
from app.trust.models import (
    IdentityEvidence, ReputationEvidence, ValidationEvidence,
    ReliabilityEvidence, TrustEvaluationResult, RiskFactor
)
from app.trust.constants import EvidenceStatus, Recommendation
from app.trust.ai.reasoner import AITrustReasoner
from app.trust.ai.schemas import FinalEvaluatedAgent, AIReasoningOutput, AIStatus


@pytest.fixture
def client():
    return TestClient(app)


def build_mock_evidence(agent_exists=True, feedback_count=10, validation_count=5):
    return AgentEvidence(
        identity=IdentityEvidence(
            agent_exists=agent_exists,
            wallet_verified=True,
            endpoint_verified=True,
            metadata_completeness=85.0,
            capability_count=3
        ),
        reputation=ReputationEvidence(
            feedback_count=feedback_count,
            unique_reviewer_count=5 if feedback_count > 0 else 0,
            average_feedback_score=4.5 if feedback_count > 0 else None,
            positive_feedback_count=feedback_count if feedback_count > 0 else 0,
            negative_feedback_count=0,
            reviewer_shares=[0.2] * 5 if feedback_count > 0 else []
        ),
        validation=ValidationEvidence(
            validation_count=validation_count,
            unique_validator_count=3 if validation_count > 0 else 0,
            successful_validation_count=validation_count if validation_count > 0 else 0,
            failed_validation_count=0,
            validator_shares=[0.33, 0.33, 0.34] if validation_count > 0 else []
        ),
        reliability=ReliabilityEvidence(task_count=10, completed_task_count=10),
        identity_status=EvidenceStatus.AVAILABLE if agent_exists else EvidenceStatus.MISSING,
        reputation_status=EvidenceStatus.AVAILABLE if feedback_count > 0 else EvidenceStatus.MISSING,
        validation_status=EvidenceStatus.AVAILABLE if validation_count > 0 else EvidenceStatus.MISSING,
        snapshot_meta={"chain_id": 10143, "block_number": 68400000, "timestamp": 1791700000}
    )


# 1. Valid Evaluation
def test_valid_evaluation(client):
    mock_adapter = MagicMock()
    mock_adapter.get_agent_evidence.return_value = build_mock_evidence(agent_exists=True)
    mock_adapter.identity_adapter = None

    app.dependency_overrides[get_evidence_adapter] = lambda: mock_adapter

    try:
        # Test GET /agents/1/trust
        resp = client.get("/agents/1/trust")
        assert resp.status_code == 200
        data = resp.json()
        assert data["agent_id"] == 1
        assert "scores" in data
        assert "global_trust" in data["scores"]
        assert "risk" in data["scores"]
        assert "task_fit" in data["scores"]
        assert "confidence" in data["scores"]
        assert "recommendation" in data
        assert "evidence" in data
        assert "snapshot" in data
        assert data["snapshot"]["chain_id"] == 10143
        assert data["snapshot"]["block_number"] == 68400000

        # Test POST /trust/evaluate
        eval_resp = client.post(
            "/trust/evaluate",
            json={
                "agent_id": 1,
                "task": {
                    "description": "Analyze market data",
                    "required_capabilities": ["data-analysis"],
                    "domain": "finance"
                }
            }
        )
        assert eval_resp.status_code == 200
        eval_data = eval_resp.json()
        assert eval_data["agent_id"] == 1
        assert eval_data["scores"]["global_trust"] > 0
    finally:
        app.dependency_overrides.clear()


# 2. Nonexistent Agent
def test_nonexistent_agent(client):
    mock_adapter = MagicMock()
    mock_adapter.get_agent_evidence.side_effect = AgentNotFoundError(999)

    app.dependency_overrides[get_evidence_adapter] = lambda: mock_adapter

    try:
        resp = client.get("/agents/999/trust")
        assert resp.status_code == 404
        data = resp.json()
        assert data["error"]["code"] == "AGENT_NOT_FOUND"
        assert "999" in data["error"]["message"]
    finally:
        app.dependency_overrides.clear()


# 3. Missing Reputation
def test_missing_reputation(client):
    mock_adapter = MagicMock()
    # Agent exists but has zero reputation feedback
    mock_adapter.get_agent_evidence.return_value = build_mock_evidence(
        agent_exists=True,
        feedback_count=0,
        validation_count=2
    )
    mock_adapter.identity_adapter = None

    app.dependency_overrides[get_evidence_adapter] = lambda: mock_adapter

    try:
        resp = client.get("/agents/1/trust")
        assert resp.status_code == 200
        data = resp.json()
        assert data["evidence"]["reputation"]["status"] == "MISSING"
        assert data["evidence"]["reputation"]["feedback_count"] == 0
        # Must NOT convert missing reputation into RPC error
        assert "error" not in data
    finally:
        app.dependency_overrides.clear()


# 4. Blockchain Failure
def test_blockchain_failure(client):
    mock_adapter = MagicMock()
    mock_adapter.get_agent_evidence.side_effect = RPCError("Connection refused by Monad node")

    app.dependency_overrides[get_evidence_adapter] = lambda: mock_adapter

    try:
        resp = client.get("/agents/1/trust")
        assert resp.status_code == 502
        data = resp.json()
        assert data["error"]["code"] == "RPC_ERROR"
        # Must NOT convert RPC error into Trust = 0
        assert "scores" not in data
    finally:
        app.dependency_overrides.clear()


# 5. AI Available
def test_ai_available(client):
    mock_adapter = MagicMock()
    mock_adapter.get_agent_evidence.return_value = build_mock_evidence(agent_exists=True)
    mock_adapter.identity_adapter = None

    mock_reasoner = MagicMock()
    mock_reasoner.generate_reasoning.return_value = FinalEvaluatedAgent(
        agent_id=1,
        global_trust_score=75.0,
        risk_score=10.0,
        task_fit_score=80.0,
        confidence=85.0,
        recommendation="HIRE",
        reasoning=AIReasoningOutput(
            summary="Agent demonstrates strong on-chain validation track record.",
            strengths=["High validation success rate"],
            concerns=[],
            risk_explanation=[],
            task_fit_explanation="Agent capabilities match task requirements.",
            recommendation_explanation="Recommendation is HIRE based on high trust.",
            confidence_explanation="Robust confidence from 5 independent validations.",
            suggested_next_checks=["Verify endpoint availability."],
            ai_status=AIStatus.AVAILABLE
        )
    )

    app.dependency_overrides[get_evidence_adapter] = lambda: mock_adapter
    app.dependency_overrides[get_ai_reasoner] = lambda: mock_reasoner

    try:
        resp = client.post(
            "/trust/evaluate",
            json={
                "agent_id": 1,
                "task": {"description": "Perform smart contract audit"}
            }
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["ai_reasoning"]["status"] == "AVAILABLE"
        assert "strong on-chain validation" in data["ai_reasoning"]["summary"]
        assert len(data["ai_reasoning"]["strengths"]) > 0
    finally:
        app.dependency_overrides.clear()


# 6. AI Unavailable
def test_ai_unavailable(client):
    mock_adapter = MagicMock()
    mock_adapter.get_agent_evidence.return_value = build_mock_evidence(agent_exists=True)
    mock_adapter.identity_adapter = None

    mock_reasoner = MagicMock()
    mock_reasoner.generate_reasoning.side_effect = Exception("Gemini API rate limit exceeded")

    app.dependency_overrides[get_evidence_adapter] = lambda: mock_adapter
    app.dependency_overrides[get_ai_reasoner] = lambda: mock_reasoner

    try:
        resp = client.post(
            "/trust/evaluate",
            json={
                "agent_id": 1,
                "task": {"description": "Evaluate agent"}
            }
        )
        assert resp.status_code == 200
        data = resp.json()
        # Returns 200 with deterministic assessment intact
        assert data["scores"]["global_trust"] > 0
        assert data["ai_reasoning"]["status"] == "UNAVAILABLE"
        assert "currently unavailable" in data["ai_reasoning"]["summary"]
    finally:
        app.dependency_overrides.clear()


# 7. AI Invalid Output
def test_ai_invalid_output(client):
    mock_adapter = MagicMock()
    mock_adapter.get_agent_evidence.return_value = build_mock_evidence(agent_exists=True)
    mock_adapter.identity_adapter = None

    mock_reasoner = MagicMock()
    # Reasoner internally triggers validation failure fallback
    mock_reasoner.generate_reasoning.return_value = FinalEvaluatedAgent(
        agent_id=1,
        global_trust_score=60.0,
        risk_score=20.0,
        task_fit_score=50.0,
        confidence=60.0,
        recommendation="REVIEW",
        reasoning=AIReasoningOutput(
            summary="AI reasoning unavailable. Deterministic trust assessment remains authoritative.",
            strengths=[],
            concerns=[],
            risk_explanation=[],
            task_fit_explanation="",
            recommendation_explanation="",
            confidence_explanation="",
            suggested_next_checks=[],
            ai_status=AIStatus.VALIDATION_FAILED
        )
    )

    app.dependency_overrides[get_evidence_adapter] = lambda: mock_adapter
    app.dependency_overrides[get_ai_reasoner] = lambda: mock_reasoner

    try:
        resp = client.post(
            "/trust/evaluate",
            json={
                "agent_id": 1,
                "task": {"description": "Check task fit"}
            }
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["ai_reasoning"]["status"] == "VALIDATION_FAILED"
        assert data["scores"]["global_trust"] > 0
    finally:
        app.dependency_overrides.clear()


# 8. Deterministic Score Remains Authoritative
def test_deterministic_score_remains_authoritative(client):
    mock_adapter = MagicMock()
    mock_adapter.get_agent_evidence.return_value = build_mock_evidence(agent_exists=True)
    mock_adapter.identity_adapter = None

    # Even if AI reasoner somehow returned hallucinated scores,
    # the endpoint strictly sources scores from deterministic engine
    mock_reasoner = MagicMock()
    mock_reasoner.generate_reasoning.return_value = FinalEvaluatedAgent(
        agent_id=1,
        global_trust_score=999.0, # Hallucinated score
        risk_score=-50.0,
        task_fit_score=100.0,
        confidence=100.0,
        recommendation="HIRE",
        reasoning=AIReasoningOutput(
            summary="Hallucinated summary claiming 100% score",
            task_fit_explanation="",
            recommendation_explanation="",
            confidence_explanation="",
            ai_status=AIStatus.AVAILABLE
        )
    )

    app.dependency_overrides[get_evidence_adapter] = lambda: mock_adapter
    app.dependency_overrides[get_ai_reasoner] = lambda: mock_reasoner

    try:
        resp = client.post(
            "/trust/evaluate",
            json={
                "agent_id": 1,
                "task": {
                    "description": "Financial modeling task",
                    "required_capabilities": ["unmatched_capability"]
                }
            }
        )
        assert resp.status_code == 200
        data = resp.json()
        # Authoritative score must NOT equal hallucinated 999.0
        assert data["scores"]["global_trust"] < 100.0
        assert data["scores"]["global_trust"] >= 0.0
        assert data["scores"]["risk"] >= 0.0
    finally:
        app.dependency_overrides.clear()


# 8b. Reconcile include_ai Flag Semantics
def test_ai_include_flag_semantics(client):
    mock_adapter = MagicMock()
    mock_adapter.get_agent_evidence.return_value = build_mock_evidence(agent_exists=True)
    mock_adapter.identity_adapter = None

    mock_reasoner = MagicMock()
    mock_reasoner.generate_reasoning.return_value = FinalEvaluatedAgent(
        agent_id=1,
        global_trust_score=75.0,
        risk_score=10.0,
        task_fit_score=80.0,
        confidence=85.0,
        recommendation="HIRE",
        reasoning=AIReasoningOutput(
            summary="Valid AI reasoning",
            strengths=[],
            concerns=[],
            risk_explanation=[],
            task_fit_explanation="",
            recommendation_explanation="",
            confidence_explanation="",
            suggested_next_checks=[],
            ai_status=AIStatus.AVAILABLE
        )
    )

    app.dependency_overrides[get_evidence_adapter] = lambda: mock_adapter
    app.dependency_overrides[get_ai_reasoner] = lambda: mock_reasoner

    try:
        # 1. include_ai = False: AI reasoner must NOT be invoked, status UNAVAILABLE, 200 OK
        resp_false = client.post(
            "/trust/evaluate",
            json={
                "agent_id": 1,
                "task": {"description": "Task without AI"},
                "include_ai": False
            }
        )
        assert resp_false.status_code == 200
        data_false = resp_false.json()
        assert data_false["ai_reasoning"]["status"] == "UNAVAILABLE"
        assert "not requested" in data_false["ai_reasoning"]["summary"]
        assert mock_reasoner.generate_reasoning.call_count == 0
        assert data_false["scores"]["global_trust"] > 0

        # 2. include_ai = True: AI reasoner IS invoked, status AVAILABLE, 200 OK
        resp_true = client.post(
            "/trust/evaluate",
            json={
                "agent_id": 1,
                "task": {"description": "Task with AI"},
                "include_ai": True
            }
        )
        assert resp_true.status_code == 200
        data_true = resp_true.json()
        assert data_true["ai_reasoning"]["status"] == "AVAILABLE"
        assert mock_reasoner.generate_reasoning.call_count == 1
    finally:
        app.dependency_overrides.clear()

