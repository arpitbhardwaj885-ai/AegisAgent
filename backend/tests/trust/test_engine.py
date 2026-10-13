import pytest
import math
from app.trust.engine import TrustEngine
from app.trust.models import (
    IdentityEvidence, ReputationEvidence, ValidationEvidence,
    ReliabilityEvidence, TaskEvidence, AgentCapabilities
)
from app.trust.constants import Recommendation

@pytest.fixture
def engine():
    return TrustEngine()

def test_highly_trusted_agent(engine):
    identity = IdentityEvidence(
        agent_exists=True, wallet_verified=True, endpoint_verified=True,
        metadata_completeness=100.0, registration_age_days=400
    )
    reputation = ReputationEvidence(
        feedback_count=100, unique_reviewer_count=50, average_feedback_score=4.8,
        reviewer_shares=[0.02] * 50, recent_feedback_count=20, days_since_last_feedback=2
    )
    validation = ValidationEvidence(
        validation_count=50, unique_validator_count=25, successful_validation_count=48,
        failed_validation_count=2, validator_shares=[0.04] * 25, days_since_last_validation=1
    )
    reliability = ReliabilityEvidence(
        task_count=100, completed_task_count=98, failed_task_count=2
    )
    task = TaskEvidence(requested_task="audit", required_capabilities=["solidity"])
    caps = AgentCapabilities(capabilities=["solidity", "rust"], domain="security")
    
    res = engine.evaluate(identity, reputation, validation, reliability, task, caps)
    assert res.recommendation == Recommendation.HIRE
    assert res.global_trust_score > 90.0
    assert res.task_fit_score > 90.0
    assert res.confidence > 90.0
    assert res.risk_score < 10.0

def test_missing_evidence(engine):
    identity = IdentityEvidence()
    reputation = ReputationEvidence()
    validation = ValidationEvidence()
    reliability = ReliabilityEvidence()
    task = TaskEvidence(requested_task="audit")
    caps = AgentCapabilities()
    
    res = engine.evaluate(identity, reputation, validation, reliability, task, caps)
    assert res.recommendation == Recommendation.DO_NOT_HIRE
    assert res.global_trust_score == 0.0
    assert res.confidence == 0.0

def test_risk_reviewer_concentration(engine):
    identity = IdentityEvidence(agent_exists=True, wallet_verified=True)
    reputation = ReputationEvidence(
        feedback_count=100, unique_reviewer_count=2, average_feedback_score=5.0,
        reviewer_shares=[0.9, 0.1]
    )
    validation = ValidationEvidence()
    reliability = ReliabilityEvidence()
    task = TaskEvidence(requested_task="audit")
    caps = AgentCapabilities()
    
    res = engine.evaluate(identity, reputation, validation, reliability, task, caps)
    assert res.risk_score > 0
    concentration_risk = next((r for r in res.risk_factors if r.name == "reviewer_concentration"), None)
    assert concentration_risk is not None
    assert concentration_risk.triggered

def test_math_safety(engine):
    identity = IdentityEvidence(metadata_completeness=float('nan'))
    reputation = ReputationEvidence(average_feedback_score=float('inf'))
    validation = ValidationEvidence(validation_count=0, successful_validation_count=10)
    reliability = ReliabilityEvidence()
    task = TaskEvidence(requested_task="audit")
    caps = AgentCapabilities()
    
    res = engine.evaluate(identity, reputation, validation, reliability, task, caps)
    assert 0.0 <= res.global_trust_score <= 100.0
    assert 0.0 <= res.task_fit_score <= 100.0
    assert 0.0 <= res.risk_score <= 100.0
    assert 0.0 <= res.confidence <= 100.0

def test_deterministic(engine):
    identity = IdentityEvidence(agent_exists=True, wallet_verified=True, metadata_completeness=80.0)
    reputation = ReputationEvidence(feedback_count=10, unique_reviewer_count=5, average_feedback_score=4.0)
    validation = ValidationEvidence(validation_count=5, successful_validation_count=4)
    reliability = ReliabilityEvidence(task_count=10, completed_task_count=9)
    task = TaskEvidence(requested_task="audit", required_capabilities=["solidity"])
    caps = AgentCapabilities(capabilities=["solidity"])
    
    first_res = engine.evaluate(identity, reputation, validation, reliability, task, caps)
    for _ in range(100):
        res = engine.evaluate(identity, reputation, validation, reliability, task, caps)
        assert res.global_trust_score == first_res.global_trust_score
        assert res.task_fit_score == first_res.task_fit_score
        assert res.risk_score == first_res.risk_score
        assert res.confidence == first_res.confidence

def test_conflict_risk(engine):
    identity = IdentityEvidence(agent_exists=True)
    reputation = ReputationEvidence(feedback_count=100, average_feedback_score=5.0) 
    validation = ValidationEvidence(validation_count=100, successful_validation_count=10) 
    rel = ReliabilityEvidence()
    task = TaskEvidence(requested_task="x")
    caps = AgentCapabilities()
    
    res = engine.evaluate(identity, reputation, validation, rel, task, caps)
    conflict = next((r for r in res.risk_factors if r.name == "reputation_validation_conflict"), None)
    assert conflict is not None
    assert conflict.triggered
