from typing import List, Optional, Dict
from pydantic import BaseModel, Field

from app.trust.constants import EvidenceStatus, Recommendation

class IdentityEvidence(BaseModel):
    agent_exists: bool = False
    registration_age_days: Optional[int] = None
    metadata_completeness: Optional[float] = None
    wallet_verified: bool = False
    endpoint_verified: bool = False
    capability_count: int = 0

class ReputationEvidence(BaseModel):
    feedback_count: int = 0
    unique_reviewer_count: int = 0
    average_feedback_score: Optional[float] = None
    positive_feedback_count: int = 0
    negative_feedback_count: int = 0
    reviewer_shares: List[float] = Field(default_factory=list)
    recent_feedback_count: int = 0
    days_since_last_feedback: Optional[int] = None

class ValidationEvidence(BaseModel):
    validation_count: int = 0
    unique_validator_count: int = 0
    successful_validation_count: int = 0
    failed_validation_count: int = 0
    validator_shares: List[float] = Field(default_factory=list)
    recent_validation_count: int = 0
    days_since_last_validation: Optional[int] = None

class ReliabilityEvidence(BaseModel):
    task_count: int = 0
    completed_task_count: int = 0
    failed_task_count: int = 0
    timeout_count: int = 0
    average_response_time_ms: Optional[float] = None
    recent_task_count: int = 0

class AgentCapabilities(BaseModel):
    capabilities: List[str] = Field(default_factory=list)
    domain: Optional[str] = None

class TaskEvidence(BaseModel):
    requested_task: str
    required_capabilities: List[str] = Field(default_factory=list)
    task_complexity: int = 1
    domain: Optional[str] = None

class RiskFactor(BaseModel):
    name: str
    severity: float = 0.0
    triggered: bool
    explanation: str

class TrustEvaluationResult(BaseModel):
    global_trust_score: float = 0.0
    task_fit_score: float = 0.0
    risk_score: float = 0.0
    confidence: float = 0.0
    recommendation: Recommendation
    evidence_status: EvidenceStatus
    score_breakdown: Dict[str, float]
    risk_factors: List[RiskFactor]
    positive_factors: List[str]
