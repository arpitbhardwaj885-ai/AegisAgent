from typing import List, Optional
from app.trust.models import (
    IdentityEvidence, ReputationEvidence, ValidationEvidence, 
    ReliabilityEvidence, RiskFactor
)
from app.trust.normalization import calculate_hhi, normalize_hhi_to_risk, clamp, safe_divide
from app.trust.constants import STALE_EVIDENCE_DAYS_STALE, SUDDEN_GROWTH_MULTIPLIER

def evaluate_risk(
    identity: IdentityEvidence,
    reputation: ReputationEvidence,
    validation: ValidationEvidence,
    reliability: ReliabilityEvidence,
    reputation_score: float,
    validation_score: float
) -> List[RiskFactor]:
    factors: List[RiskFactor] = []

    # 1. Sybil/reviewer concentration
    hhi_rev = calculate_hhi(reputation.reviewer_shares)
    risk_rev_conc = normalize_hhi_to_risk(hhi_rev)
    factors.append(RiskFactor(
        name="reviewer_concentration",
        severity=risk_rev_conc,
        triggered=risk_rev_conc >= 25.0,
        explanation="High proportion of feedback originates from a small number of addresses." if risk_rev_conc >= 25.0 else ""
    ))

    # 2. Validator concentration
    hhi_val = calculate_hhi(validation.validator_shares)
    risk_val_conc = normalize_hhi_to_risk(hhi_val)
    factors.append(RiskFactor(
        name="validator_concentration",
        severity=risk_val_conc,
        triggered=risk_val_conc >= 25.0,
        explanation="Agent is primarily validated by a concentrated group of validators." if risk_val_conc >= 25.0 else ""
    ))

    # 3. High failure rate
    task_failure_rate = safe_divide(reliability.failed_task_count, reliability.task_count)
    val_failure_rate = safe_divide(validation.failed_validation_count, validation.validation_count)
    combined_failure_rate = max(task_failure_rate, val_failure_rate) * 100.0
    factors.append(RiskFactor(
        name="high_failure_rate",
        severity=combined_failure_rate,
        triggered=combined_failure_rate >= 30.0,
        explanation="Frequent task failures or validation rejections." if combined_failure_rate >= 30.0 else ""
    ))

    # 4. Stale evidence
    days_since_vals = [x for x in [reputation.days_since_last_feedback, validation.days_since_last_validation] if x is not None]
    days_since = min(days_since_vals) if days_since_vals else None
    
    stale_sev = 0.0
    triggered_stale = False
    if days_since is not None and days_since > STALE_EVIDENCE_DAYS_STALE:
        stale_sev = clamp((days_since - STALE_EVIDENCE_DAYS_STALE) / 365.0 * 100.0)
        triggered_stale = True
        
    factors.append(RiskFactor(
        name="stale_evidence",
        severity=stale_sev,
        triggered=triggered_stale,
        explanation=f"Evidence is aging; last activity was {days_since} days ago." if triggered_stale else ""
    ))

    # 5. Sudden reputation growth
    growth_sev = 0.0
    growth_trig = False
    if reputation.feedback_count > 10:
        ratio = safe_divide(reputation.recent_feedback_count, reputation.feedback_count)
        if ratio >= 0.8:
            growth_sev = ratio * 100.0
            growth_trig = True
    factors.append(RiskFactor(
        name="sudden_reputation_growth",
        severity=growth_sev,
        triggered=growth_trig,
        explanation="Anomalous spike in positive reviews indicating potential manipulation." if growth_trig else ""
    ))

    # 6. Reputation/validation conflict
    conflict_sev = 0.0
    conflict_trig = False
    if reputation.feedback_count > 0 and validation.validation_count > 0:
        diff = reputation_score - validation_score
        if diff >= 40.0:
            conflict_sev = clamp(diff)
            conflict_trig = True
    factors.append(RiskFactor(
        name="reputation_validation_conflict",
        severity=conflict_sev,
        triggered=conflict_trig,
        explanation="Agent receives positive reviews but fails objective validations." if conflict_trig else ""
    ))

    # 7. Agent inactivity
    inactivity_sev = 0.0
    inactivity_trig = False
    if days_since is not None and days_since > 180:
        inactivity_sev = clamp((days_since - 180) / 365.0 * 100.0)
        inactivity_trig = True
    factors.append(RiskFactor(
        name="agent_inactivity",
        severity=inactivity_sev,
        triggered=inactivity_trig,
        explanation="Agent profile is dormant." if inactivity_trig else ""
    ))

    # 8. Missing identity metadata
    missing_meta_sev = 0.0
    missing_meta_trig = False
    if identity.metadata_completeness is None or identity.metadata_completeness < 50.0:
        missing_meta_sev = clamp(100.0 - (identity.metadata_completeness or 0.0))
        missing_meta_trig = True
    factors.append(RiskFactor(
        name="missing_identity_metadata",
        severity=missing_meta_sev,
        triggered=missing_meta_trig,
        explanation="Incomplete profile information." if missing_meta_trig else ""
    ))

    # 9. Unverified endpoint
    unverified_ep_sev = 0.0
    unverified_ep_trig = False
    if identity.agent_exists and not identity.endpoint_verified:
        unverified_ep_sev = 100.0
        unverified_ep_trig = True
    factors.append(RiskFactor(
        name="unverified_endpoint",
        severity=unverified_ep_sev,
        triggered=unverified_ep_trig,
        explanation="Agent communication endpoints are unreachable or unverified." if unverified_ep_trig else ""
    ))

    # 10. Repeated negative validations
    repeated_neg_sev = 0.0
    repeated_neg_trig = False
    if validation.failed_validation_count >= 3:
        repeated_neg_sev = clamp(validation.failed_validation_count * 20.0)
        repeated_neg_trig = True
    factors.append(RiskFactor(
        name="repeated_negative_validations",
        severity=repeated_neg_sev,
        triggered=repeated_neg_trig,
        explanation="Consistent failure in meeting objective validation criteria." if repeated_neg_trig else ""
    ))

    return factors
