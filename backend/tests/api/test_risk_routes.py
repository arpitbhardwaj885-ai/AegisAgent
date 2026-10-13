import pytest
from unittest.mock import MagicMock
from fastapi.testclient import TestClient

from app.main import app
from app.api.dependencies import get_evidence_adapter
from app.trust.blockchain.evidence_adapter import AgentEvidence
from app.trust.models import (
    IdentityEvidence, ReputationEvidence, ValidationEvidence, ReliabilityEvidence
)
from app.trust.constants import EvidenceStatus


@pytest.fixture
def client():
    return TestClient(app)


# 9. Valid Risk
def test_valid_risk(client):
    mock_adapter = MagicMock()
    mock_adapter.get_agent_evidence.return_value = AgentEvidence(
        identity=IdentityEvidence(agent_exists=True, wallet_verified=True),
        reputation=ReputationEvidence(
            feedback_count=20,
            unique_reviewer_count=8,
            average_feedback_score=4.2,
            reviewer_shares=[0.125] * 8
        ),
        validation=ValidationEvidence(
            validation_count=10,
            unique_validator_count=4,
            successful_validation_count=9,
            failed_validation_count=1,
            validator_shares=[0.25] * 4
        ),
        reliability=ReliabilityEvidence(task_count=10, completed_task_count=10),
        identity_status=EvidenceStatus.AVAILABLE,
        reputation_status=EvidenceStatus.AVAILABLE,
        validation_status=EvidenceStatus.AVAILABLE,
        snapshot_meta={"chain_id": 10143, "block_number": 68400000}
    )

    app.dependency_overrides[get_evidence_adapter] = lambda: mock_adapter

    try:
        resp = client.get("/agents/1/risk")
        assert resp.status_code == 200
        data = resp.json()
        assert data["agent_id"] == 1
        assert 0.0 <= data["risk_score"] <= 100.0
        assert data["risk_level"] in ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
        assert isinstance(data["factors"], list)
        assert 0.0 <= data["confidence"] <= 100.0
    finally:
        app.dependency_overrides.clear()


# 10. No Risk Factors
def test_no_risk_factors(client):
    mock_adapter = MagicMock()
    # High-reputation, diversified agent with no triggered risk factors
    mock_adapter.get_agent_evidence.return_value = AgentEvidence(
        identity=IdentityEvidence(
            agent_exists=True,
            wallet_verified=True,
            endpoint_verified=True,
            metadata_completeness=100.0,
            registration_age_days=100
        ),
        reputation=ReputationEvidence(
            feedback_count=50,
            unique_reviewer_count=20,
            average_feedback_score=4.9,
            reviewer_shares=[0.05] * 20,
            recent_feedback_count=10,
            days_since_last_feedback=1
        ),
        validation=ValidationEvidence(
            validation_count=20,
            unique_validator_count=10,
            successful_validation_count=20,
            failed_validation_count=0,
            validator_shares=[0.1] * 10,
            days_since_last_validation=2
        ),
        reliability=ReliabilityEvidence(task_count=50, completed_task_count=50),
        identity_status=EvidenceStatus.AVAILABLE,
        reputation_status=EvidenceStatus.AVAILABLE,
        validation_status=EvidenceStatus.AVAILABLE,
        snapshot_meta={"chain_id": 10143, "block_number": 68400000}
    )

    app.dependency_overrides[get_evidence_adapter] = lambda: mock_adapter

    try:
        resp = client.get("/agents/2/risk")
        assert resp.status_code == 200
        data = resp.json()
        assert data["risk_score"] == 0.0
        assert data["risk_level"] == "LOW"
        assert len(data["factors"]) == 0
    finally:
        app.dependency_overrides.clear()


# 11. High-Risk Agent
def test_high_risk_agent(client):
    mock_adapter = MagicMock()
    # 100% reviewer concentration and high failure rate
    mock_adapter.get_agent_evidence.return_value = AgentEvidence(
        identity=IdentityEvidence(agent_exists=True, wallet_verified=False),
        reputation=ReputationEvidence(
            feedback_count=50,
            unique_reviewer_count=1, # 1 reviewer has 100% of feedback
            average_feedback_score=5.0,
            reviewer_shares=[1.0]
        ),
        validation=ValidationEvidence(
            validation_count=20,
            unique_validator_count=1,
            successful_validation_count=5,
            failed_validation_count=15, # 75% failure rate
            validator_shares=[1.0]
        ),
        reliability=ReliabilityEvidence(task_count=20, completed_task_count=5, failed_task_count=15),
        identity_status=EvidenceStatus.AVAILABLE,
        reputation_status=EvidenceStatus.AVAILABLE,
        validation_status=EvidenceStatus.AVAILABLE,
        snapshot_meta={"chain_id": 10143, "block_number": 68400000}
    )

    app.dependency_overrides[get_evidence_adapter] = lambda: mock_adapter

    try:
        resp = client.get("/agents/3/risk")
        assert resp.status_code == 200
        data = resp.json()
        assert data["risk_score"] >= 60.0
        assert data["risk_level"] in ["HIGH", "CRITICAL"]
        assert len(data["factors"]) > 0
        factor_names = [f["name"] for f in data["factors"]]
        assert "reviewer_concentration" in factor_names
    finally:
        app.dependency_overrides.clear()


# 12. Missing Evidence
def test_missing_evidence(client):
    mock_adapter = MagicMock()
    # Brand new agent with no feedback, no validation
    mock_adapter.get_agent_evidence.return_value = AgentEvidence(
        identity=IdentityEvidence(agent_exists=True),
        reputation=ReputationEvidence(),
        validation=ValidationEvidence(),
        reliability=ReliabilityEvidence(),
        identity_status=EvidenceStatus.AVAILABLE,
        reputation_status=EvidenceStatus.MISSING,
        validation_status=EvidenceStatus.MISSING,
        snapshot_meta={"chain_id": 10143, "block_number": 68400000}
    )

    app.dependency_overrides[get_evidence_adapter] = lambda: mock_adapter

    try:
        resp = client.get("/agents/4/risk")
        assert resp.status_code == 200
        data = resp.json()
        assert data["agent_id"] == 4
        # Must compute cleanly without throwing exceptions
        assert isinstance(data["risk_score"], float)
        assert data["confidence"] >= 0.0
    finally:
        app.dependency_overrides.clear()
