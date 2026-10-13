from typing import Tuple, Optional
from app.trust.models import (
    IdentityEvidence, ReputationEvidence, ValidationEvidence, ReliabilityEvidence
)
from app.trust.normalization import clamp, safe_divide

def score_identity(evidence: IdentityEvidence) -> Tuple[float, bool]:
    """
    Returns (score (0-100), has_evidence)
    """
    if not evidence.agent_exists:
        return 0.0, False
        
    score = 20.0 # Agent exists
    
    if evidence.wallet_verified:
        score += 20.0
        
    if evidence.endpoint_verified:
        score += 10.0
        
    if evidence.metadata_completeness is not None:
        score += 20.0 * (clamp(evidence.metadata_completeness) / 100.0)
        
    if evidence.registration_age_days is not None:
        age_score = clamp(evidence.registration_age_days, 0, 365)
        score += 30.0 * (age_score / 365.0)
        
    return clamp(score), True

def score_reputation(evidence: ReputationEvidence) -> Tuple[float, bool]:
    """
    Returns (score (0-100), has_evidence)
    """
    if evidence.feedback_count == 0 or evidence.average_feedback_score is None:
        return 0.0, False
        
    # Map 1-5 to 0-100
    avg_score = clamp(evidence.average_feedback_score, 1.0, 5.0)
    normalized = (avg_score - 1.0) * 25.0
    
    return clamp(normalized), True

def score_validation(evidence: ValidationEvidence) -> Tuple[float, bool]:
    """
    Returns (score (0-100), has_evidence)
    """
    if evidence.validation_count == 0:
        return 0.0, False
        
    success_rate = safe_divide(evidence.successful_validation_count, evidence.validation_count)
    score = success_rate * 100.0
    
    return clamp(score), True

def score_reliability(evidence: ReliabilityEvidence) -> Tuple[float, bool]:
    """
    Returns (score (0-100), has_evidence)
    """
    if evidence.task_count == 0:
        return 0.0, False
        
    completion_rate = safe_divide(evidence.completed_task_count, evidence.task_count)
    score = completion_rate * 100.0
    
    return clamp(score), True
