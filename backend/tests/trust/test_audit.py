import pytest
import math
from app.trust.engine import TrustEngine
from app.trust.models import (
    IdentityEvidence, ReputationEvidence, ValidationEvidence,
    ReliabilityEvidence, TaskEvidence, AgentCapabilities,
    RiskFactor
)
from app.trust.constants import Recommendation

@pytest.fixture
def engine():
    return TrustEngine()

def get_base_caps():
    return AgentCapabilities(capabilities=["solidity"])

def get_base_task():
    return TaskEvidence(requested_task="audit", required_capabilities=["solidity"])

# 1. MISSING-EVIDENCE WEIGHT AUDIT
def test_missing_evidence_weight(engine):
    # Case A: Validation missing
    id_ev = IdentityEvidence(agent_exists=True, wallet_verified=True, endpoint_verified=True, metadata_completeness=100.0, registration_age_days=365)
    rep_ev = ReputationEvidence(feedback_count=100, average_feedback_score=4.6) # 90
    val_ev = ValidationEvidence()
    rel_ev = ReliabilityEvidence(task_count=100, completed_task_count=90) # 90
    
    res_a = engine.evaluate(id_ev, rep_ev, val_ev, rel_ev, get_base_task(), get_base_caps())
    
    # Case C: Only Reputation exists, but perfect
    rep_ev_100 = ReputationEvidence(feedback_count=100, average_feedback_score=5.0) # 100
    res_c = engine.evaluate(IdentityEvidence(), rep_ev_100, ValidationEvidence(), ReliabilityEvidence(), get_base_task(), get_base_caps())
    
    # Print results for inspection
    print(f"\\nCase A (Validation Missing) Trust: {res_a.global_trust_score}")
    print(f"Case C (Only Rep Exists=100) Trust: {res_c.global_trust_score}")

# 2. RISK-PENALTY AUDIT (Monotonicity)
def test_risk_monotonicity(engine):
    id_ev = IdentityEvidence(agent_exists=True, wallet_verified=True, metadata_completeness=100.0, registration_age_days=365)
    
    trusts = []
    for risk_severity in [0, 10, 20, 50, 100]:
        # We simulate risk severity by manipulating days_since_last_feedback (Stale Evidence)
        days = 90 + int((risk_severity / 100.0) * 365)
        if risk_severity == 0:
            days = 0
            
        rep_ev = ReputationEvidence(feedback_count=100, average_feedback_score=5.0, days_since_last_feedback=days)
        val_ev = ValidationEvidence(validation_count=100, successful_validation_count=100, days_since_last_validation=days)
        rel_ev = ReliabilityEvidence(task_count=100, completed_task_count=100)
        
        res = engine.evaluate(id_ev, rep_ev, val_ev, rel_ev, get_base_task(), get_base_caps())
        trusts.append((risk_severity, res.global_trust_score))
        
    for i in range(1, len(trusts)):
        assert trusts[i][1] <= trusts[i-1][1], f"Trust increased as risk increased! {trusts[i-1]} -> {trusts[i]}"

# 3. TRUST MONOTONICITY
def test_trust_monotonicity(engine):
    id_ev = IdentityEvidence(agent_exists=True)
    val_ev = ValidationEvidence()
    rel_ev = ReliabilityEvidence()
    
    trusts = []
    for score in [1.0, 2.0, 3.0, 4.0, 5.0]:
        rep_ev = ReputationEvidence(feedback_count=10, average_feedback_score=score)
        res = engine.evaluate(id_ev, rep_ev, val_ev, rel_ev, get_base_task(), get_base_caps())
        trusts.append((score, res.global_trust_score))
        
    for i in range(1, len(trusts)):
        assert trusts[i][1] >= trusts[i-1][1], f"Trust decreased as positive evidence increased! {trusts[i-1]} -> {trusts[i]}"

# 4. HHI AUDIT
def test_hhi_audit(engine):
    valid_id = IdentityEvidence(agent_exists=True, wallet_verified=True, metadata_completeness=100.0, endpoint_verified=True, registration_age_days=365)
    
    # Case A: 100 equal reviewers
    res_a = engine.evaluate(
        valid_id,
        ReputationEvidence(feedback_count=100, reviewer_shares=[0.01]*100),
        ValidationEvidence(), ReliabilityEvidence(), get_base_task(), get_base_caps()
    )
    
    # Case B: 2 equal reviewers
    res_b = engine.evaluate(
        valid_id,
        ReputationEvidence(feedback_count=100, reviewer_shares=[0.5, 0.5]),
        ValidationEvidence(), ReliabilityEvidence(), get_base_task(), get_base_caps()
    )
    
    # Case C: 1 reviewer
    res_c = engine.evaluate(
        valid_id,
        ReputationEvidence(feedback_count=100, reviewer_shares=[1.0]),
        ValidationEvidence(), ReliabilityEvidence(), get_base_task(), get_base_caps()
    )
    
    def get_hhi_risk(res):
        r = next((r for r in res.risk_factors if r.name == "reviewer_concentration"), None)
        return r.severity if r else 0.0
        
    print(f"\\nHHI Case A Risk: {get_hhi_risk(res_a)}")
    print(f"HHI Case B Risk: {get_hhi_risk(res_b)}")
    print(f"HHI Case C Risk: {get_hhi_risk(res_c)}")

# 12. TASK-FIT AUDIT
def test_task_fit(engine):
    task_perf = TaskEvidence(requested_task="x", required_capabilities=["A", "B"], domain="sec")
    
    # Perfect
    res_perf = engine.evaluate(IdentityEvidence(), ReputationEvidence(), ValidationEvidence(), ReliabilityEvidence(), task_perf, AgentCapabilities(capabilities=["A", "B", "C"], domain="sec"))
    assert res_perf.task_fit_score == 100.0
    
    # Zero
    res_zero = engine.evaluate(IdentityEvidence(), ReputationEvidence(), ValidationEvidence(), ReliabilityEvidence(), task_perf, AgentCapabilities(capabilities=["X", "Y"], domain="web"))
    assert res_zero.task_fit_score == 0.0

# 14. CRITICAL-RISK AUDIT
def test_critical_risk_boundary(engine):
    # High trust, but risk severity 50 vs 51
    id_ev = IdentityEvidence(agent_exists=True, metadata_completeness=100.0, wallet_verified=True, endpoint_verified=True, registration_age_days=365)
    rep_ev = ReputationEvidence(feedback_count=100, average_feedback_score=5.0)
    val_ev = ValidationEvidence(validation_count=100, successful_validation_count=100)
    rel_ev = ReliabilityEvidence(task_count=100, completed_task_count=100)
    
    # Let's trigger a risk via unverified endpoint (100 severity)
    id_ev_risk = IdentityEvidence(agent_exists=True, metadata_completeness=100.0, wallet_verified=True, endpoint_verified=False, registration_age_days=365)
    
    res_no_risk = engine.evaluate(id_ev, rep_ev, val_ev, rel_ev, get_base_task(), get_base_caps())
    res_risk = engine.evaluate(id_ev_risk, rep_ev, val_ev, rel_ev, get_base_task(), get_base_caps())
    
    assert res_no_risk.recommendation == Recommendation.HIRE
    assert res_risk.recommendation != Recommendation.HIRE

# 15. CONFIDENCE AUDIT
def test_confidence_logic(engine):
    # Attack A: 100% reputation but only 1 reviewer
    res_attack_a = engine.evaluate(
        IdentityEvidence(),
        ReputationEvidence(feedback_count=1, unique_reviewer_count=1, average_feedback_score=5.0),
        ValidationEvidence(), ReliabilityEvidence(), get_base_task(), get_base_caps()
    )
    
    res_strong = engine.evaluate(
        IdentityEvidence(agent_exists=True),
        ReputationEvidence(feedback_count=100, unique_reviewer_count=50, average_feedback_score=5.0),
        ValidationEvidence(validation_count=100, unique_validator_count=50, successful_validation_count=100),
        ReliabilityEvidence(task_count=100), get_base_task(), get_base_caps()
    )
    
    assert res_attack_a.confidence < res_strong.confidence
