import pytest
from app.trust.blockchain.provider import Web3Provider
from app.trust.blockchain.evidence_adapter import UnifiedEvidenceAdapter
from app.trust.engine import TrustEngine
from app.trust.models import TaskEvidence, AgentCapabilities

def test_real_monad_smoke():
    provider = Web3Provider()
    try:
        provider.check_connection()
    except Exception as e:
        pytest.skip(f"Cannot connect to Monad RPC. Skipping smoke test: {e}")
        
    adapter = UnifiedEvidenceAdapter(provider)
    
    # Agent 1
    evidence = adapter.get_agent_evidence(1)
    
    print("\n--- SMOKE TEST AGENT 1 ---")
    print(f"Identity Status: {evidence.identity_status}")
    print(f"Identity Exists: {evidence.identity.agent_exists}")
    print(f"Reputation Status: {evidence.reputation_status}")
    print(f"Reputation Count: {evidence.reputation.feedback_count}")
    print(f"Validation Status: {evidence.validation_status}")
    print(f"Validation Count: {evidence.validation.validation_count}")
    print(f"Snapshot Meta: {evidence.snapshot_meta}")
    
    engine = TrustEngine()
    task = TaskEvidence(requested_task="test")
    caps = AgentCapabilities()
    
    result = engine.evaluate(
        identity=evidence.identity,
        reputation=evidence.reputation,
        validation=evidence.validation,
        reliability=evidence.reliability,
        task=task,
        agent_caps=caps
    )
    
    print(f"Trust Engine Result:")
    print(f"Global Trust: {result.global_trust_score}")
    print(f"Risk Score: {result.risk_score}")
    print(f"Confidence: {result.confidence}")
    print(f"Recommendation: {result.recommendation.value}")
    
    # We just want to ensure it doesn't crash and returns valid schemas
    assert result.global_trust_score >= 0.0
