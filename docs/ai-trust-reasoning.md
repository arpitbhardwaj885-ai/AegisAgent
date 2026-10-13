# AegisAgent AI Trust Reasoning Layer

## Architecture
The AI Trust Reasoning Layer is built explicitly as an explanatory overlay. It processes deterministic evidence and numerical outcomes to generate structured, human-readable qualitative interpretations.

```text
Deterministic Trust Engine
            │
      [TrustEvaluationResult]
            │
            ▼
       AI Reasoner
      (Validates & Explains)
            │
            ▼
    [FinalEvaluatedAgent]
```

## Deterministic Authority Boundary
**CRITICAL RULE:** The AI may explain the trust decision but is strictly prohibited from recalculating or mutating the numerical scores. 

The `AITrustReasoner` executes a hard override before returning the final payload:
```python
return FinalEvaluatedAgent(
    global_trust_score=deterministic_result.global_trust_score,
    risk_score=deterministic_result.risk_score,
    task_fit_score=deterministic_result.task_fit_score,
    recommendation=deterministic_result.recommendation,
    reasoning=explanation
)
```
Any attempt by the AI to inject fields like `"trust_score": 99` will immediately cause a `ValidationError` in `validator.py`, failing gracefully to the deterministic fallback.

## Provider Abstraction
The system utilizes an `AIProvider` Protocol.
- **MockProvider:** Used internally for unit tests to bypass external network requirements.
- **GeminiProvider:** A drop-in class for real inference utilizing `generativelanguage.googleapis.com`. It relies on the environment variable `AI_API_KEY`. 
No API keys are hardcoded.

## Hallucination Protection
`validator.py` cross-references the AI's explanation against the deterministic engine.
If the AI attempts to explain a risk (e.g., `fraud_detected`) that did not exist in the deterministic payload, the output is structurally rejected. 
The system prompt strictly commands the AI to announce "Evidence unavailable" rather than guessing.

## Prompt Injection Protection
- **No Unbounded Fields:** Arbitrary on-chain strings like textual reviews are intentionally stripped from the payload payload to prevent adversarial instructions from manipulating the LLM's reasoning engine.
- **Delimitation:** System instructions firmly declare all payload content as untrusted DATA, not instructions.
- **Hard Fallback:** If an injection somehow breaks the output schema, Pydantic validation catches the malformed JSON and defaults to safe deterministic reasoning.

## Secret Protection
The AI Provider handles API headers strictly within `provider.py`. The payload building function (`prompt.py`) is completely disconnected from configuration secrets. The prompt only serializes float scores and categorical enum tags. No `.env`, wallet, or private metadata enters the serialization cycle.

## Fallback Behavior
The pipeline gracefully reverts to `fallback.py` under the following conditions:
- `AI_API_KEY` missing
- Request Timeout
- Invalid JSON or Pydantic `ValidationError`
- Configuration error
The application preserves absolute stability, returning `AIStatus.UNAVAILABLE` alongside the uncorrupted deterministic engine scores.
