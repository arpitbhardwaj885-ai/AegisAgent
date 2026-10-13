from typing import List
from app.trust.models import (
    IdentityEvidence, ReputationEvidence, ValidationEvidence, 
    ReliabilityEvidence, TaskEvidence, AgentCapabilities,
    TrustEvaluationResult, RiskFactor
)
from app.trust.constants import (
    WEIGHT_REPUTATION, WEIGHT_VALIDATION, WEIGHT_IDENTITY,
    WEIGHT_RELIABILITY, WEIGHT_BEHAVIORAL_RISK,
    HIRE_MIN_TRUST, HIRE_MIN_TASK_FIT,
    REVIEW_MIN_TRUST, REVIEW_MIN_TASK_FIT,
    EvidenceStatus, Recommendation
)
from app.trust.scoring import (
    score_identity, score_reputation, score_validation, score_reliability
)
from app.trust.risk import evaluate_risk
from app.trust.task_fit import calculate_task_fit
from app.trust.normalization import clamp, safe_divide

class TrustEngine:
    def evaluate(
        self,
        identity: IdentityEvidence,
        reputation: ReputationEvidence,
        validation: ValidationEvidence,
        reliability: ReliabilityEvidence,
        task: TaskEvidence,
        agent_caps: AgentCapabilities
    ) -> TrustEvaluationResult:
        
        # Base scores
        id_score, id_has_ev = score_identity(identity)
        rep_score, rep_has_ev = score_reputation(reputation)
        val_score, val_has_ev = score_validation(validation)
        rel_score, rel_has_ev = score_reliability(reliability)
        
        # Risk evaluation
        risk_factors = evaluate_risk(
            identity=identity,
            reputation=reputation,
            validation=validation,
            reliability=reliability,
            reputation_score=rep_score,
            validation_score=val_score
        )
        
        triggered_risks = [r for r in risk_factors if r.triggered]
        
        # Aggregate Risk Score (e.g. max severity or sum up to 100)
        risk_score = 0.0
        if triggered_risks:
            risk_score = clamp(sum(r.severity for r in triggered_risks))
            
        # Global Trust Calculation
        # The risk score acts as a penalty
        raw_base_score = (
            rep_score * WEIGHT_REPUTATION +
            val_score * WEIGHT_VALIDATION +
            id_score * WEIGHT_IDENTITY +
            rel_score * WEIGHT_RELIABILITY
        )
        
        # Scale the base score so max is 100 before risk penalty
        total_positive_weight = WEIGHT_REPUTATION + WEIGHT_VALIDATION + WEIGHT_IDENTITY + WEIGHT_RELIABILITY
        base_score = safe_divide(raw_base_score, total_positive_weight)
        
        risk_penalty = risk_score * WEIGHT_BEHAVIORAL_RISK
        
        global_trust_score = clamp(base_score - risk_penalty)
        
        # Task Fit
        task_fit_score = calculate_task_fit(task, agent_caps)
        
        # Confidence
        confidence = self._calculate_confidence(
            id_has_ev, rep_has_ev, val_has_ev, rel_has_ev,
            reputation.feedback_count, validation.validation_count,
            reputation.unique_reviewer_count, validation.unique_validator_count
        )
        
        # Evidence Status
        ev_count = sum([id_has_ev, rep_has_ev, val_has_ev, rel_has_ev])
        if ev_count == 4:
            evidence_status = EvidenceStatus.AVAILABLE
        elif ev_count > 0:
            evidence_status = EvidenceStatus.PARTIAL
        else:
            evidence_status = EvidenceStatus.MISSING
            
        # Recommendation
        has_critical_risk = any(r.severity >= 50.0 for r in triggered_risks)
        
        if global_trust_score >= HIRE_MIN_TRUST and task_fit_score >= HIRE_MIN_TASK_FIT and not has_critical_risk:
            recommendation = Recommendation.HIRE
        elif global_trust_score >= REVIEW_MIN_TRUST and task_fit_score >= REVIEW_MIN_TASK_FIT:
            recommendation = Recommendation.REVIEW
        else:
            recommendation = Recommendation.DO_NOT_HIRE
            
        # Positive Factors
        positive_factors = []
        if val_score >= 80.0 and val_has_ev:
            positive_factors.append("High validation success rate")
        if rep_score >= 80.0 and rep_has_ev:
            positive_factors.append("Strong reputation feedback")
        if not any(r.name == "reviewer_concentration" and r.triggered for r in triggered_risks) and rep_has_ev and reputation.unique_reviewer_count > 3:
            positive_factors.append("Strong reviewer diversity")
        if rel_score >= 80.0 and rel_has_ev:
            positive_factors.append("High historical task completion")
            
        return TrustEvaluationResult(
            global_trust_score=global_trust_score,
            task_fit_score=task_fit_score,
            risk_score=risk_score,
            confidence=confidence,
            recommendation=recommendation,
            evidence_status=evidence_status,
            score_breakdown={
                "identity": id_score,
                "reputation": rep_score,
                "validation": val_score,
                "reliability": rel_score,
                "risk_penalty": risk_penalty
            },
            risk_factors=triggered_risks,
            positive_factors=positive_factors
        )
        
    def _calculate_confidence(
        self,
        id_has_ev: bool, rep_has_ev: bool, val_has_ev: bool, rel_has_ev: bool,
        rep_count: int, val_count: int,
        rep_unique: int, val_unique: int
    ) -> float:
        conf = 0.0
        
        if id_has_ev: conf += 15.0
        if rel_has_ev: conf += 15.0
        
        if rep_has_ev:
            vol_score = clamp((rep_count / 10.0) * 15.0, max_val=15.0)
            div_score = clamp((rep_unique / 5.0) * 20.0, max_val=20.0)
            conf += vol_score + div_score
            
        if val_has_ev:
            vol_score = clamp((val_count / 5.0) * 15.0, max_val=15.0)
            div_score = clamp((val_unique / 3.0) * 20.0, max_val=20.0)
            conf += vol_score + div_score
            
        return clamp(conf)
