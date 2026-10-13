from app.trust.ai.schemas import AIReasoningOutput, AIStatus

def get_fallback_explanation(status: AIStatus) -> AIReasoningOutput:
    return AIReasoningOutput(
        summary=f"AI reasoning unavailable. Deterministic trust assessment remains authoritative.",
        strengths=[],
        concerns=[],
        risk_explanation=[],
        task_fit_explanation="",
        recommendation_explanation="",
        confidence_explanation="",
        suggested_next_checks=[],
        ai_status=status
    )
