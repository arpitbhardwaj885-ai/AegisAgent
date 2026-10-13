import time
import json
from datetime import datetime, timezone
from typing import List, Dict, Any

from fastapi import APIRouter, Depends, Path
from app.trust.blockchain.evidence_adapter import UnifiedEvidenceAdapter, AgentEvidence
from app.trust.blockchain.errors import (
    AgentNotFoundError as BlockchainAgentNotFoundError,
    RPCError as BlockchainRPCError,
    ContractError as BlockchainContractError,
    InvalidDataError as BlockchainInvalidDataError
)
from app.trust.constants import EvidenceStatus
from app.trust.engine import TrustEngine
from app.trust.models import TaskEvidence, AgentCapabilities, TrustEvaluationResult
from app.trust.ai.reasoner import AITrustReasoner
from app.trust.ai.schemas import AIStatus

from app.api.dependencies import (
    get_evidence_adapter,
    get_trust_engine,
    get_ai_reasoner
)
from app.api.schemas import (
    TrustEvaluationRequest,
    TrustEvaluationResponse,
    RiskResponse,
    CompareRequest,
    CompareResponse,
    AgentCompareItem,
    AgentScores,
    RiskFactorResponse,
    EvidenceSummary,
    IdentityEvidenceSummary,
    ReputationEvidenceSummary,
    ValidationEvidenceSummary,
    SnapshotResponse,
    AIReasoningResponse
)
from app.api.errors import (
    AgentNotFoundError,
    RPCException,
    ContractException,
    InvalidBlockchainDataException,
    InvalidRequestException,
    TrustEvaluationException
)

router = APIRouter(tags=["Trust & Risk Evaluation"])


# =====================================================================
# HELPER FUNCTIONS
# =====================================================================

def fetch_and_validate_evidence(
    adapter: UnifiedEvidenceAdapter,
    agent_id: int
) -> AgentEvidence:
    """
    Fetches evidence from the blockchain adapter with structured error handling.
    Differentiates between missing records, invalid data, RPC outages, and contract reverts.
    """
    try:
        evidence = adapter.get_agent_evidence(agent_id)
    except BlockchainRPCError as e:
        raise RPCException(f"RPC connection error while querying agent {agent_id}: {e}")
    except BlockchainContractError as e:
        raise ContractException(f"Contract call error while querying agent {agent_id}: {e}")
    except BlockchainAgentNotFoundError:
        raise AgentNotFoundError(agent_id)
    except BlockchainInvalidDataError as e:
        raise InvalidBlockchainDataException(f"Corrupted blockchain response for agent {agent_id}: {e}")
    except Exception as e:
        err_msg = str(e)
        if "RPC" in err_msg or "connect" in err_msg.lower() or "timeout" in err_msg.lower():
            raise RPCException("Blockchain RPC connection failed.")
        raise TrustEvaluationException("Unexpected adapter failure.")

    # Check for underlying RPC failure recorded in snapshot_meta
    identity_error = evidence.snapshot_meta.get("identity_error", "")
    if evidence.identity_status == EvidenceStatus.INVALID:
        if "RPC" in identity_error or "connect" in identity_error.lower():
            raise RPCException(f"RPC error during identity resolution: {identity_error}")
        if "contract" in identity_error.lower():
            raise ContractException(f"Contract error during identity resolution: {identity_error}")

    # Semantics: If agent does not exist in Identity Registry -> 404 AGENT_NOT_FOUND
    if not evidence.identity.agent_exists:
        raise AgentNotFoundError(agent_id)

    return evidence


def extract_agent_capabilities(
    adapter: UnifiedEvidenceAdapter,
    agent_id: int
) -> AgentCapabilities:
    """Extracts capability and domain strings from on-chain identity metadata if present."""
    caps: List[str] = []
    domain: str | None = None

    try:
        if hasattr(adapter, "identity_adapter") and adapter.identity_adapter is not None:
            raw_caps = adapter.identity_adapter.contract.functions.getMetadata(agent_id, "capabilities").call()
            if raw_caps:
                caps_str = raw_caps.decode("utf-8")
                parsed = json.loads(caps_str)
                if isinstance(parsed, list):
                    caps = [str(c) for c in parsed]
                elif isinstance(parsed, dict):
                    caps = [str(c) for c in parsed.keys()]
    except Exception:
        pass

    try:
        if hasattr(adapter, "identity_adapter") and adapter.identity_adapter is not None:
            raw_dom = adapter.identity_adapter.contract.functions.getMetadata(agent_id, "domain").call()
            if raw_dom:
                dom_str = raw_dom.decode("utf-8").strip()
                if dom_str:
                    domain = dom_str
    except Exception:
        pass

    return AgentCapabilities(capabilities=caps, domain=domain)


def build_evidence_summary(evidence: AgentEvidence) -> EvidenceSummary:
    """Builds sanitized evidence summary without leaking raw blockchain structures."""
    id_ev = evidence.identity
    rep_ev = evidence.reputation
    val_ev = evidence.validation

    return EvidenceSummary(
        identity=IdentityEvidenceSummary(
            status=evidence.identity_status.value,
            exists=id_ev.agent_exists,
            metadata_completeness=round(id_ev.metadata_completeness or 0.0, 2),
            wallet_verified=id_ev.wallet_verified,
            endpoint_verified=id_ev.endpoint_verified,
            capability_count=id_ev.capability_count
        ),
        reputation=ReputationEvidenceSummary(
            status=evidence.reputation_status.value,
            feedback_count=rep_ev.feedback_count,
            reviewer_count=rep_ev.unique_reviewer_count,
            positive_feedback_count=rep_ev.positive_feedback_count,
            negative_feedback_count=rep_ev.negative_feedback_count,
            average_score=round(rep_ev.average_feedback_score, 2) if rep_ev.average_feedback_score is not None else None
        ),
        validation=ValidationEvidenceSummary(
            status=evidence.validation_status.value,
            validation_count=val_ev.validation_count,
            validator_count=val_ev.unique_validator_count,
            successful_validation_count=val_ev.successful_validation_count,
            failed_validation_count=val_ev.failed_validation_count,
            days_since_last_validation=val_ev.days_since_last_validation
        )
    )


def build_snapshot_response(snapshot_meta: Dict[str, Any]) -> SnapshotResponse:
    """Builds verifiable blockchain snapshot response model."""
    chain_id = int(snapshot_meta.get("chain_id", 0))
    block_number = int(snapshot_meta.get("block_number", 0))
    ts = snapshot_meta.get("timestamp", int(time.time()))
    retrieved_at = datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()

    return SnapshotResponse(
        chain_id=chain_id,
        block_number=block_number,
        retrieved_at=retrieved_at
    )


def build_ai_reasoning_response(
    ai_reasoner: AITrustReasoner,
    agent_id: int,
    eval_result: TrustEvaluationResult,
    include_ai: bool = True
) -> AIReasoningResponse:
    """
    Safely executes AI reasoning layer with complete fallback resilience.
    If AI fails, times out, or produces invalid output, fallback explanation is returned.
    The deterministic scores are NEVER altered.
    """
    if not include_ai:
        return AIReasoningResponse(
            status="UNAVAILABLE",
            summary="AI reasoning was not requested. Deterministic trust assessment remains authoritative.",
            strengths=eval_result.positive_factors,
            concerns=[rf.explanation for rf in eval_result.risk_factors if rf.triggered],
            risk_explanation=[{"risk": rf.name, "severity": rf.severity, "explanation": rf.explanation} for rf in eval_result.risk_factors if rf.triggered],
            task_fit_explanation="",
            recommendation_explanation="",
            confidence_explanation="",
            suggested_next_checks=[]
        )

    try:
        final_agent = ai_reasoner.generate_reasoning(agent_id, eval_result)
        reasoning = final_agent.reasoning
        risk_explanations = [
            {"risk": rx.risk, "severity": rx.severity, "explanation": rx.explanation}
            for rx in reasoning.risk_explanation
        ]
        return AIReasoningResponse(
            status=reasoning.ai_status.value if hasattr(reasoning.ai_status, "value") else str(reasoning.ai_status),
            summary=reasoning.summary,
            strengths=reasoning.strengths,
            concerns=reasoning.concerns,
            risk_explanation=risk_explanations,
            task_fit_explanation=reasoning.task_fit_explanation,
            recommendation_explanation=reasoning.recommendation_explanation,
            confidence_explanation=reasoning.confidence_explanation,
            suggested_next_checks=reasoning.suggested_next_checks
        )
    except Exception:
        # AI failure must NEVER bring down the endpoint
        return AIReasoningResponse(
            status=AIStatus.UNAVAILABLE.value,
            summary="AI reasoning is currently unavailable. Deterministic trust assessment remains authoritative.",
            strengths=eval_result.positive_factors,
            concerns=[rf.explanation for rf in eval_result.risk_factors if rf.triggered],
            risk_explanation=[{"risk": rf.name, "severity": rf.severity, "explanation": rf.explanation} for rf in eval_result.risk_factors if rf.triggered],
            task_fit_explanation="",
            recommendation_explanation="",
            confidence_explanation="",
            suggested_next_checks=[]
        )


# =====================================================================
# ENDPOINTS
# =====================================================================

@router.get(
    "/agents/{agent_id}/trust",
    response_model=TrustEvaluationResponse,
    summary="Get Agent Trust Assessment",
    description="Returns the authoritative deterministic trust assessment, verifiable blockchain evidence snapshot, and explanatory AI reasoning for an agent."
)
def get_agent_trust(
    agent_id: int = Path(..., gt=0, le=10**12, description="Target Agent ID on-chain"),
    adapter: UnifiedEvidenceAdapter = Depends(get_evidence_adapter),
    engine: TrustEngine = Depends(get_trust_engine),
    reasoner: AITrustReasoner = Depends(get_ai_reasoner)
) -> TrustEvaluationResponse:
    # 1. Fetch verifiable evidence
    evidence = fetch_and_validate_evidence(adapter, agent_id)

    # 2. General baseline evaluation (no specific task requested)
    task = TaskEvidence(
        requested_task="General Trust Assessment",
        required_capabilities=["__unspecified_task__"],
        domain="__unspecified_task__"
    )
    caps = extract_agent_capabilities(adapter, agent_id)

    # 3. Authoritative deterministic evaluation
    try:
        eval_result = engine.evaluate(
            identity=evidence.identity,
            reputation=evidence.reputation,
            validation=evidence.validation,
            reliability=evidence.reliability,
            task=task,
            agent_caps=caps
        )
    except Exception:
        raise TrustEvaluationException("Deterministic engine evaluation failed.")

    # 4. AI reasoning layer (explanatory only)
    ai_response = build_ai_reasoning_response(reasoner, agent_id, eval_result, include_ai=True)

    # 5. Assemble response — deterministic scores remain authoritative
    return TrustEvaluationResponse(
        agent_id=agent_id,
        scores=AgentScores(
            global_trust=round(eval_result.global_trust_score, 2),
            risk=round(eval_result.risk_score, 2),
            task_fit=round(eval_result.task_fit_score, 2),
            confidence=round(eval_result.confidence, 2)
        ),
        recommendation=eval_result.recommendation.value,
        evidence=build_evidence_summary(evidence),
        risks=[
            RiskFactorResponse(name=rf.name, severity=rf.severity, description=rf.explanation)
            for rf in eval_result.risk_factors
            if rf.triggered
        ],
        ai_reasoning=ai_response,
        snapshot=build_snapshot_response(evidence.snapshot_meta)
    )


@router.get(
    "/agents/{agent_id}/risk",
    response_model=RiskResponse,
    summary="Get Agent Risk Profile",
    description="Returns risk-focused assessment, risk tier level, and active risk factors without requiring a task evaluation."
)
def get_agent_risk(
    agent_id: int = Path(..., gt=0, le=10**12, description="Target Agent ID on-chain"),
    adapter: UnifiedEvidenceAdapter = Depends(get_evidence_adapter),
    engine: TrustEngine = Depends(get_trust_engine)
) -> RiskResponse:
    # 1. Fetch verifiable evidence
    evidence = fetch_and_validate_evidence(adapter, agent_id)

    # 2. Baseline evaluation to extract risk factors and confidence
    task = TaskEvidence(requested_task="Risk Profile Assessment")
    caps = AgentCapabilities()

    try:
        eval_result = engine.evaluate(
            identity=evidence.identity,
            reputation=evidence.reputation,
            validation=evidence.validation,
            reliability=evidence.reliability,
            task=task,
            agent_caps=caps
        )
    except Exception:
        raise TrustEvaluationException("Deterministic engine risk evaluation failed.")

    # 3. Presentation tier mapping (API presentation layer only; does NOT modify underlying score)
    risk_score = eval_result.risk_score
    if risk_score < 25.0:
        risk_level = "LOW"
    elif risk_score < 60.0:
        risk_level = "MEDIUM"
    elif risk_score < 85.0:
        risk_level = "HIGH"
    else:
        risk_level = "CRITICAL"

    active_factors = [
        RiskFactorResponse(name=rf.name, severity=rf.severity, description=rf.explanation)
        for rf in eval_result.risk_factors
        if rf.triggered
    ]

    return RiskResponse(
        agent_id=agent_id,
        risk_score=round(risk_score, 2),
        risk_level=risk_level,
        factors=active_factors,
        confidence=round(eval_result.confidence, 2)
    )


@router.post(
    "/trust/evaluate",
    response_model=TrustEvaluationResponse,
    summary="Evaluate Agent Trust for Specific Task",
    description="Primary evaluation pipeline: gathers verifiable evidence, computes deterministic trust, risk, task fit, confidence, and generates explanatory AI reasoning."
)
def evaluate_agent_trust(
    request: TrustEvaluationRequest,
    adapter: UnifiedEvidenceAdapter = Depends(get_evidence_adapter),
    engine: TrustEngine = Depends(get_trust_engine),
    reasoner: AITrustReasoner = Depends(get_ai_reasoner)
) -> TrustEvaluationResponse:
    # 1. Fetch verifiable evidence
    evidence = fetch_and_validate_evidence(adapter, request.agent_id)

    # 2. Extract capabilities from on-chain identity metadata
    caps = extract_agent_capabilities(adapter, request.agent_id)

    # 3. Construct task evidence
    task = TaskEvidence(
        requested_task=request.task.description,
        required_capabilities=request.task.required_capabilities,
        domain=request.task.domain
    )

    # 4. Authoritative deterministic evaluation
    try:
        eval_result = engine.evaluate(
            identity=evidence.identity,
            reputation=evidence.reputation,
            validation=evidence.validation,
            reliability=evidence.reliability,
            task=task,
            agent_caps=caps
        )
    except Exception:
        raise TrustEvaluationException("Deterministic engine evaluation failed.")

    # 5. Explanatory AI reasoning
    ai_response = build_ai_reasoning_response(
        reasoner,
        request.agent_id,
        eval_result,
        include_ai=request.include_ai
    )

    # 6. Assemble response
    return TrustEvaluationResponse(
        agent_id=request.agent_id,
        scores=AgentScores(
            global_trust=round(eval_result.global_trust_score, 2),
            risk=round(eval_result.risk_score, 2),
            task_fit=round(eval_result.task_fit_score, 2),
            confidence=round(eval_result.confidence, 2)
        ),
        recommendation=eval_result.recommendation.value,
        evidence=build_evidence_summary(evidence),
        risks=[
            RiskFactorResponse(name=rf.name, severity=rf.severity, description=rf.explanation)
            for rf in eval_result.risk_factors
            if rf.triggered
        ],
        ai_reasoning=ai_response,
        snapshot=build_snapshot_response(evidence.snapshot_meta)
    )


@router.post(
    "/trust/compare",
    response_model=CompareResponse,
    summary="Compare Multiple Agents for a Task",
    description="Compares up to 10 candidate agents against the same task. Ranking is strictly deterministic and based on recommendation class, global trust, task fit, low risk, and confidence."
)
def compare_agents(
    request: CompareRequest,
    adapter: UnifiedEvidenceAdapter = Depends(get_evidence_adapter),
    engine: TrustEngine = Depends(get_trust_engine)
) -> CompareResponse:
    agent_items: List[AgentCompareItem] = []

    task = TaskEvidence(
        requested_task=request.task.description,
        required_capabilities=request.task.required_capabilities,
        domain=request.task.domain
    )

    for agent_id in request.agent_ids:
        # 1. Fetch verifiable evidence for candidate
        evidence = fetch_and_validate_evidence(adapter, agent_id)

        # 2. Extract capabilities
        caps = extract_agent_capabilities(adapter, agent_id)

        # 3. Deterministic evaluation
        try:
            eval_result = engine.evaluate(
                identity=evidence.identity,
                reputation=evidence.reputation,
                validation=evidence.validation,
                reliability=evidence.reliability,
                task=task,
                agent_caps=caps
            )
        except Exception:
            raise TrustEvaluationException(f"Evaluation failed for agent {agent_id}.")

        agent_items.append(
            AgentCompareItem(
                agent_id=agent_id,
                global_trust=round(eval_result.global_trust_score, 2),
                task_fit=round(eval_result.task_fit_score, 2),
                risk=round(eval_result.risk_score, 2),
                confidence=round(eval_result.confidence, 2),
                recommendation=eval_result.recommendation.value
            )
        )

    # 4. Deterministic Ranking Policy (Section 9)
    # Priority:
    # 1. Recommendation tier (HIRE: 3, REVIEW: 2, DO_NOT_HIRE: 1)
    # 2. Global Trust (higher first)
    # 3. Task Fit (higher first)
    # 4. Risk (lower first)
    # 5. Confidence (higher first)
    # 6. Agent ID (ascending stable tie-breaker)
    rec_weight = {"HIRE": 3, "REVIEW": 2, "DO_NOT_HIRE": 1}

    def ranking_key(item: AgentCompareItem):
        return (
            rec_weight.get(item.recommendation, 0),
            item.global_trust,
            item.task_fit,
            -item.risk,
            item.confidence,
            -item.agent_id  # Inverted so smaller agent_id wins under reverse=True
        )

    sorted_agents = sorted(agent_items, key=ranking_key, reverse=True)
    ranking = [a.agent_id for a in sorted_agents]

    return CompareResponse(
        task={
            "description": request.task.description,
            "required_capabilities": request.task.required_capabilities,
            "domain": request.task.domain
        },
        agents=agent_items,
        ranking=ranking
    )
