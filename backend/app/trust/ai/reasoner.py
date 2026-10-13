import logging
import requests
from app.trust.models import TrustEvaluationResult
from app.trust.ai.schemas import FinalEvaluatedAgent, AIStatus
from app.trust.ai.provider import get_provider
from app.trust.ai.prompt import build_prompt
from app.trust.ai.validator import validate_ai_output
from app.trust.ai.fallback import get_fallback_explanation

class AITrustReasoner:
    def __init__(self, provider=None):
        self.provider = provider or get_provider()

    def generate_reasoning(self, agent_id: int, deterministic_result: TrustEvaluationResult) -> FinalEvaluatedAgent:
        prompt = build_prompt(deterministic_result)
        
        try:
            # We strip markdown tags if the AI ignores instructions
            raw_response = self.provider.generate_reasoning(prompt).strip()
            if raw_response.startswith("```json"):
                raw_response = raw_response[7:]
            if raw_response.startswith("```"):
                raw_response = raw_response[3:]
            if raw_response.endswith("```"):
                raw_response = raw_response[:-3]
            raw_response = raw_response.strip()
                
            explanation = validate_ai_output(raw_response, deterministic_result)
        except requests.exceptions.Timeout:
            explanation = get_fallback_explanation(AIStatus.TIMEOUT)
        except ValueError as e:
            explanation = get_fallback_explanation(AIStatus.VALIDATION_FAILED)
        except Exception as e:
            explanation = get_fallback_explanation(AIStatus.UNAVAILABLE)

        # -----------------------------------------------------
        # ENFORCE DETERMINISTIC AUTHORITY
        # No matter what the AI did or said, we explicitly wire
        # the numerical fields from the deterministic_result!
        # -----------------------------------------------------
        return FinalEvaluatedAgent(
            agent_id=agent_id,
            global_trust_score=deterministic_result.global_trust_score,
            risk_score=deterministic_result.risk_score,
            task_fit_score=deterministic_result.task_fit_score,
            confidence=deterministic_result.confidence,
            recommendation=deterministic_result.recommendation.value,
            reasoning=explanation
        )
