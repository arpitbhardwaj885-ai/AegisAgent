import pytest
from unittest.mock import MagicMock
from fastapi.testclient import TestClient

from app.main import app
from app.api.dependencies import get_evidence_adapter, get_ai_reasoner
from app.trust.blockchain.evidence_adapter import AgentEvidence
from app.trust.models import (
    IdentityEvidence, ReputationEvidence, ValidationEvidence, ReliabilityEvidence
)
from app.trust.constants import EvidenceStatus


@pytest.fixture
def client():
    return TestClient(app)


def make_mock_evidence_for_agent(agent_id: int):
    # Differentiate agent properties to test deterministic ranking
    # Agent 1: High reputation, high validation -> HIRE
    if agent_id == 1:
        return AgentEvidence(
            identity=IdentityEvidence(agent_exists=True, wallet_verified=True, metadata_completeness=100.0),
            reputation=ReputationEvidence(
                feedback_count=60, unique_reviewer_count=20, average_feedback_score=4.9,
                reviewer_shares=[0.05] * 20
            ),
            validation=ValidationEvidence(
                validation_count=30, unique_validator_count=10, successful_validation_count=30,
                validator_shares=[0.1] * 10
            ),
            reliability=ReliabilityEvidence(task_count=30, completed_task_count=30),
            identity_status=EvidenceStatus.AVAILABLE,
            reputation_status=EvidenceStatus.AVAILABLE,
            validation_status=EvidenceStatus.AVAILABLE,
            snapshot_meta={"chain_id": 10143, "block_number": 68400000}
        )
    # Agent 2: Moderate reputation -> REVIEW
    elif agent_id == 2:
        return AgentEvidence(
            identity=IdentityEvidence(agent_exists=True, wallet_verified=True, metadata_completeness=80.0),
            reputation=ReputationEvidence(
                feedback_count=15, unique_reviewer_count=5, average_feedback_score=3.8,
                reviewer_shares=[0.2] * 5
            ),
            validation=ValidationEvidence(
                validation_count=10, unique_validator_count=3, successful_validation_count=7,
                failed_validation_count=3, validator_shares=[0.33] * 3
            ),
            reliability=ReliabilityEvidence(task_count=10, completed_task_count=8),
            identity_status=EvidenceStatus.AVAILABLE,
            reputation_status=EvidenceStatus.AVAILABLE,
            validation_status=EvidenceStatus.AVAILABLE,
            snapshot_meta={"chain_id": 10143, "block_number": 68400000}
        )
    # Agent 3: High risk -> DO_NOT_HIRE
    elif agent_id == 3:
        return AgentEvidence(
            identity=IdentityEvidence(agent_exists=True, wallet_verified=False),
            reputation=ReputationEvidence(
                feedback_count=20, unique_reviewer_count=1, average_feedback_score=5.0,
                reviewer_shares=[1.0]
            ),
            validation=ValidationEvidence(
                validation_count=10, unique_validator_count=1, successful_validation_count=2,
                failed_validation_count=8, validator_shares=[1.0]
            ),
            reliability=ReliabilityEvidence(task_count=10, completed_task_count=2, failed_task_count=8),
            identity_status=EvidenceStatus.AVAILABLE,
            reputation_status=EvidenceStatus.AVAILABLE,
            validation_status=EvidenceStatus.AVAILABLE,
            snapshot_meta={"chain_id": 10143, "block_number": 68400000}
        )
    else:
        # Generic agent for scaling up to 10 agents
        return AgentEvidence(
            identity=IdentityEvidence(agent_exists=True, wallet_verified=True),
            reputation=ReputationEvidence(feedback_count=10, unique_reviewer_count=4, average_feedback_score=4.0, reviewer_shares=[0.25]*4),
            validation=ValidationEvidence(validation_count=5, unique_validator_count=2, successful_validation_count=5, validator_shares=[0.5]*2),
            reliability=ReliabilityEvidence(task_count=5, completed_task_count=5),
            identity_status=EvidenceStatus.AVAILABLE,
            reputation_status=EvidenceStatus.AVAILABLE,
            validation_status=EvidenceStatus.AVAILABLE,
            snapshot_meta={"chain_id": 10143, "block_number": 68400000}
        )


# 13. Two Agents
def test_two_agents_comparison(client):
    mock_adapter = MagicMock()
    mock_adapter.get_agent_evidence.side_effect = make_mock_evidence_for_agent
    mock_adapter.identity_adapter = None

    app.dependency_overrides[get_evidence_adapter] = lambda: mock_adapter

    try:
        resp = client.post(
            "/trust/compare",
            json={
                "agent_ids": [1, 2],
                "task": {"description": "Perform data analysis"}
            }
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["agents"]) == 2
        assert len(data["ranking"]) == 2
        assert set(data["ranking"]) == {1, 2}
    finally:
        app.dependency_overrides.clear()


# 14. Ten Agents (Maximum Allowed)
def test_ten_agents_comparison(client):
    mock_adapter = MagicMock()
    mock_adapter.get_agent_evidence.side_effect = make_mock_evidence_for_agent
    mock_adapter.identity_adapter = None

    app.dependency_overrides[get_evidence_adapter] = lambda: mock_adapter

    try:
        resp = client.post(
            "/trust/compare",
            json={
                "agent_ids": list(range(1, 11)),
                "task": {"description": "Mass evaluation"}
            }
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["agents"]) == 10
        assert len(data["ranking"]) == 10
    finally:
        app.dependency_overrides.clear()


# 15. Eleven Agents Rejected
def test_eleven_agents_rejected(client):
    resp = client.post(
        "/trust/compare",
        json={
            "agent_ids": list(range(1, 12)),
            "task": {"description": "Oversized batch"}
        }
    )
    assert resp.status_code == 422
    data = resp.json()
    assert data["error"]["code"] == "INVALID_REQUEST"


# 16. Duplicate Agent IDs Rejected
def test_duplicate_agent_ids_rejected(client):
    resp = client.post(
        "/trust/compare",
        json={
            "agent_ids": [1, 2, 1],
            "task": {"description": "Duplicate check"}
        }
    )
    assert resp.status_code == 422
    data = resp.json()
    assert data["error"]["code"] == "INVALID_REQUEST"


# 17. Empty List Rejected
def test_empty_agent_ids_rejected(client):
    resp = client.post(
        "/trust/compare",
        json={
            "agent_ids": [],
            "task": {"description": "Empty check"}
        }
    )
    assert resp.status_code == 422
    data = resp.json()
    assert data["error"]["code"] == "INVALID_REQUEST"


# 18. Deterministic Ranking
def test_deterministic_ranking(client):
    mock_adapter = MagicMock()
    mock_adapter.get_agent_evidence.side_effect = make_mock_evidence_for_agent
    mock_adapter.identity_adapter = None

    app.dependency_overrides[get_evidence_adapter] = lambda: mock_adapter

    try:
        resp = client.post(
            "/trust/compare",
            json={
                "agent_ids": [3, 1, 2],
                "task": {"description": "Compare 3 distinct agents"}
            }
        )
        assert resp.status_code == 200
        data = resp.json()
        ranking = data["ranking"]
        # Agent 1 (HIRE) must rank higher than Agent 2 (REVIEW), which ranks higher than Agent 3 (DO_NOT_HIRE)
        assert ranking[0] == 1
        assert ranking[1] == 2
        assert ranking[2] == 3

        # Must be strictly deterministic across repeated requests
        for _ in range(5):
            repeat_resp = client.post(
                "/trust/compare",
                json={
                    "agent_ids": [3, 1, 2],
                    "task": {"description": "Compare 3 distinct agents"}
                }
            )
            assert repeat_resp.json()["ranking"] == [1, 2, 3]
    finally:
        app.dependency_overrides.clear()


# 19. AI Cannot Alter Ranking
def test_ai_cannot_alter_ranking(client):
    mock_adapter = MagicMock()
    mock_adapter.get_agent_evidence.side_effect = make_mock_evidence_for_agent
    mock_adapter.identity_adapter = None

    # AI reasoner is not even called for ranking, ensuring zero influence
    mock_reasoner = MagicMock()
    mock_reasoner.generate_reasoning.side_effect = Exception("Should not be called during compare")

    app.dependency_overrides[get_evidence_adapter] = lambda: mock_adapter
    app.dependency_overrides[get_ai_reasoner] = lambda: mock_reasoner

    try:
        resp = client.post(
            "/trust/compare",
            json={
                "agent_ids": [2, 1],
                "task": {"description": "Validate AI independence"}
            }
        )
        assert resp.status_code == 200
        data = resp.json()
        # Agent 1 ranks higher than Agent 2 deterministically
        assert data["ranking"] == [1, 2]
    finally:
        app.dependency_overrides.clear()
