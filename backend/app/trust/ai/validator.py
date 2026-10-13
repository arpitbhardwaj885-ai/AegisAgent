import json
from pydantic import ValidationError
from app.trust.ai.schemas import AIReasoningOutput
from app.trust.models import TrustEvaluationResult

def validate_ai_output(raw_json: str, deterministic_result: TrustEvaluationResult) -> AIReasoningOutput:
    try:
        data = json.loads(raw_json)
    except json.JSONDecodeError:
        raise ValueError("Invalid JSON format")

    # Check for forbidden authoritative fields
    forbidden_keys = ["trust_score", "risk_score", "task_fit_score", "confidence", "recommendation", "global_trust_score"]
    for key in forbidden_keys:
        if key in data:
            raise ValueError(f"Forbidden field '{key}' found in AI response")

    # Validate schema
    try:
        output = AIReasoningOutput(**data)
    except ValidationError as e:
        raise ValueError(f"Schema validation failed: {e}")

    # Cross-check risks - AI must not invent risks that didn't fire
    allowed_risks = {r.name for r in deterministic_result.risk_factors}
    for re in output.risk_explanation:
        if re.risk not in allowed_risks:
            raise ValueError(f"AI hallucinated unsupported risk: {re.risk}")

    return output
