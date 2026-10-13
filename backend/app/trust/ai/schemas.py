from typing import List
from pydantic import BaseModel, Field
from enum import Enum

class AIStatus(str, Enum):
    AVAILABLE = "AVAILABLE"
    UNAVAILABLE = "UNAVAILABLE"
    TIMEOUT = "TIMEOUT"
    INVALID_RESPONSE = "INVALID_RESPONSE"
    VALIDATION_FAILED = "VALIDATION_FAILED"
    CONFIGURATION_ERROR = "CONFIGURATION_ERROR"

class RiskExplanation(BaseModel):
    risk: str = Field(..., description="The name of the risk")
    severity: float = Field(..., description="The deterministic severity score")
    explanation: str = Field(..., max_length=500)

class AIReasoningOutput(BaseModel):
    summary: str = Field(..., max_length=1000)
    strengths: List[str] = Field(default_factory=list, max_length=10) # pydantic max_length for lists limits items
    concerns: List[str] = Field(default_factory=list, max_length=10)
    risk_explanation: List[RiskExplanation] = Field(default_factory=list, max_length=20)
    task_fit_explanation: str = Field(..., max_length=1000)
    recommendation_explanation: str = Field(..., max_length=1000)
    confidence_explanation: str = Field(..., max_length=1000)
    suggested_next_checks: List[str] = Field(default_factory=list, max_length=10)
    ai_status: AIStatus = Field(default=AIStatus.AVAILABLE)

class FinalEvaluatedAgent(BaseModel):
    agent_id: int
    global_trust_score: float
    risk_score: float
    task_fit_score: float
    confidence: float
    recommendation: str
    reasoning: AIReasoningOutput
