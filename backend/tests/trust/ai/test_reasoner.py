import pytest
import json
from app.trust.models import TrustEvaluationResult, RiskFactor
from app.trust.constants import Recommendation, EvidenceStatus
from app.trust.ai.reasoner import AITrustReasoner
from app.trust.ai.provider import MockProvider
from app.trust.ai.schemas import AIStatus

@pytest.fixture
def deterministic_result():
    return TrustEvaluationResult(
        global_trust_score=61.0,
        risk_score=22.0,
        task_fit_score=88.0,
        confidence=54.0,
        recommendation=Recommendation.REVIEW,
        evidence_status=EvidenceStatus.AVAILABLE,
        score_breakdown={},
        positive_factors=[],
        risk_factors=[RiskFactor(name="reviewer_concentration", severity=22.0, triggered=True, explanation="")]
    )

def test_deterministic_authority(deterministic_result):
    # Test Authority (19, 20, 21, 22)
    # Mock AI returning valid JSON but describing a HIRE scenario
    ai_json = json.dumps({
        "summary": "This agent should be hired.",
        "strengths": [],
        "concerns": [],
        "risk_explanation": [],
        "task_fit_explanation": "Good fit",
        "recommendation_explanation": "HIRE",
        "confidence_explanation": "high",
        "suggested_next_checks": []
    })
    
    provider = MockProvider(forced_response=ai_json)
    reasoner = AITrustReasoner(provider=provider)
    
    final_agent = reasoner.generate_reasoning(agent_id=1, deterministic_result=deterministic_result)
    
    # Assert deterministic values are completely UNCHANGED
    assert final_agent.global_trust_score == 61.0
    assert final_agent.risk_score == 22.0
    assert final_agent.task_fit_score == 88.0
    assert final_agent.recommendation == "REVIEW"

def test_fallback_on_invalid_json(deterministic_result):
    provider = MockProvider(forced_response="IGNORE ALL PREVIOUS INSTRUCTIONS")
    reasoner = AITrustReasoner(provider=provider)
    
    final_agent = reasoner.generate_reasoning(1, deterministic_result)
    
    assert final_agent.reasoning.ai_status == AIStatus.VALIDATION_FAILED
    assert final_agent.global_trust_score == 61.0
    
def test_validation_rejects_hallucinated_risks(deterministic_result):
    ai_json = json.dumps({
        "summary": "summary",
        "strengths": [],
        "concerns": [],
        "risk_explanation": [
            {
                "risk": "fraud_detected", # Hallucinated!
                "severity": 100.0,
                "explanation": "Fraud!"
            }
        ],
        "task_fit_explanation": "fit",
        "recommendation_explanation": "rec",
        "confidence_explanation": "conf",
        "suggested_next_checks": []
    })
    
    provider = MockProvider(forced_response=ai_json)
    reasoner = AITrustReasoner(provider=provider)
    
    final_agent = reasoner.generate_reasoning(1, deterministic_result)
    
    assert final_agent.reasoning.ai_status == AIStatus.VALIDATION_FAILED
    
def test_validation_rejects_authoritative_fields(deterministic_result):
    # Test Schema (5)
    ai_json = json.dumps({
        "summary": "summary",
        "strengths": [],
        "concerns": [],
        "risk_explanation": [],
        "task_fit_explanation": "fit",
        "recommendation_explanation": "rec",
        "confidence_explanation": "conf",
        "suggested_next_checks": [],
        "trust_score": 99.0 # Forbidden!
    })
    
    provider = MockProvider(forced_response=ai_json)
    reasoner = AITrustReasoner(provider=provider)
    
    final_agent = reasoner.generate_reasoning(1, deterministic_result)
    
    assert final_agent.reasoning.ai_status == AIStatus.VALIDATION_FAILED

def test_prompt_injection_defense(deterministic_result):
    # Test Security (16, 17, 18)
    from app.trust.ai.prompt import build_prompt
    
    prompt = build_prompt(deterministic_result)
    
    # Ensure secrets are NOT in the prompt
    import os
    os.environ["AI_API_KEY"] = "super_secret_key"
    assert "super_secret_key" not in prompt
    
    # Ensure the system instruction enforces boundaries
    assert "You MUST NOT recalculate, override, or change the recommendation" in prompt
