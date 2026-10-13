from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, field_validator, AliasChoices, ConfigDict

from app.core.config import (
    MAX_TASK_DESCRIPTION_LENGTH,
    MAX_CAPABILITIES_COUNT,
    MAX_CAPABILITY_LENGTH,
    MAX_DOMAIN_LENGTH,
    MAX_COMPARE_AGENTS
)


# =====================================================================
# REQUEST SCHEMAS
# =====================================================================

class TaskRequest(BaseModel):
    description: str = Field(
        ...,
        description="Clear description of the task to be performed by the agent."
    )
    required_capabilities: List[str] = Field(
        default_factory=list,
        description="List of capabilities required for the task."
    )
    domain: Optional[str] = Field(
        default=None,
        description="Target task domain (e.g., finance, security, devops)."
    )

    @field_validator("description")
    @classmethod
    def validate_description(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("Task description cannot be empty or whitespace only.")
        if len(stripped) > MAX_TASK_DESCRIPTION_LENGTH:
            raise ValueError(
                f"Task description length ({len(stripped)}) exceeds maximum {MAX_TASK_DESCRIPTION_LENGTH} characters."
            )
        return stripped

    @field_validator("required_capabilities")
    @classmethod
    def validate_capabilities(cls, v: List[str]) -> List[str]:
        if len(v) > MAX_CAPABILITIES_COUNT:
            raise ValueError(
                f"Number of required capabilities ({len(v)}) exceeds limit of {MAX_CAPABILITIES_COUNT}."
            )
        sanitized = []
        for cap in v:
            cap_str = cap.strip()
            if not cap_str:
                raise ValueError("Capability cannot be empty or whitespace only.")
            if len(cap_str) > MAX_CAPABILITY_LENGTH:
                raise ValueError(
                    f"Capability '{cap_str[:20]}...' exceeds {MAX_CAPABILITY_LENGTH} characters."
                )
            sanitized.append(cap_str)
        return sanitized

    @field_validator("domain")
    @classmethod
    def validate_domain(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        stripped = v.strip()
        if not stripped:
            return None
        if len(stripped) > MAX_DOMAIN_LENGTH:
            raise ValueError(f"Domain length exceeds limit of {MAX_DOMAIN_LENGTH} characters.")
        return stripped


class TrustEvaluationRequest(BaseModel):
    agent_id: int = Field(..., gt=0, le=10**12, description="Target Agent ID on-chain.")
    task: TaskRequest = Field(..., description="Task requirements for contextual evaluation.")
    include_ai: bool = Field(default=True, description="Whether to include AI explanatory reasoning.")


class CompareRequest(BaseModel):
    agent_ids: List[int] = Field(
        ...,
        min_length=1,
        max_length=MAX_COMPARE_AGENTS,
        description=f"List of 1 to {MAX_COMPARE_AGENTS} distinct positive Agent IDs."
    )
    task: TaskRequest = Field(..., description="Task requirements to compare agents against.")

    @field_validator("agent_ids")
    @classmethod
    def validate_agent_ids(cls, v: List[int]) -> List[int]:
        if not v:
            raise ValueError("agent_ids list cannot be empty.")
        if len(v) > MAX_COMPARE_AGENTS:
            raise ValueError(f"Cannot compare more than {MAX_COMPARE_AGENTS} agents simultaneously.")
        if len(v) != len(set(v)):
            raise ValueError("Duplicate agent IDs are not allowed in compare request.")
        for aid in v:
            if aid <= 0:
                raise ValueError(f"Invalid agent ID {aid}. Agent IDs must be positive integers.")
            if aid > 10**12:
                raise ValueError(f"Agent ID {aid} exceeds maximum permitted value.")
        return v


# =====================================================================
# RESPONSE SCHEMAS
# =====================================================================

class AgentScores(BaseModel):
    global_trust: float = Field(..., description="Authoritative deterministic global trust score (0-100).")
    risk: float = Field(..., description="Authoritative deterministic risk score (0-100).")
    task_fit: float = Field(..., description="Contextual capability/domain match score (0-100).")
    confidence: float = Field(..., description="Evaluation confidence based on evidence volume and diversity (0-100).")


class RiskFactorResponse(BaseModel):
    name: str = Field(..., description="Identifier of the risk factor.")
    severity: float = Field(..., description="Severity weight assigned to the risk factor.")
    description: str = Field(..., description="Human-readable explanation of why this risk was triggered.")


class IdentityEvidenceSummary(BaseModel):
    status: str = Field(..., description="Evidence status: AVAILABLE, PARTIAL, or MISSING.")
    exists: bool = Field(..., description="Whether the agent exists in Identity Registry.")
    metadata_completeness: float = Field(..., description="Completeness of registered on-chain metadata (0-100).")
    wallet_verified: bool = Field(..., description="Whether agent has a verified non-zero wallet address.")
    endpoint_verified: bool = Field(..., description="Whether agent has configured an endpoint URI.")
    capability_count: int = Field(..., description="Number of declared capabilities on-chain.")


class ReputationEvidenceSummary(BaseModel):
    status: str = Field(..., description="Evidence status: AVAILABLE, PARTIAL, or MISSING.")
    feedback_count: int = Field(..., description="Total non-revoked feedback submissions.")
    reviewer_count: int = Field(..., description="Number of distinct client reviewers.")
    positive_feedback_count: int = Field(..., description="Count of positive reviews (>= 4.0 / 5.0).")
    negative_feedback_count: int = Field(..., description="Count of negative reviews (<= 2.0 / 5.0).")
    average_score: Optional[float] = Field(None, description="Average feedback score on normalized scale.")


class ValidationEvidenceSummary(BaseModel):
    status: str = Field(..., description="Evidence status: AVAILABLE, PARTIAL, or MISSING.")
    validation_count: int = Field(..., description="Total completed validation checks.")
    validator_count: int = Field(..., description="Number of unique independent validators.")
    successful_validation_count: int = Field(..., description="Count of passed validations.")
    failed_validation_count: int = Field(..., description="Count of failed validations.")
    days_since_last_validation: Optional[int] = Field(None, description="Days elapsed since most recent validation.")


class EvidenceSummary(BaseModel):
    identity: IdentityEvidenceSummary
    reputation: ReputationEvidenceSummary
    validation: ValidationEvidenceSummary


class AIReasoningResponse(BaseModel):
    status: str = Field(..., description="AI layer status: AVAILABLE, UNAVAILABLE, TIMEOUT, etc.")
    summary: str = Field(..., description="High-level narrative synthesis of deterministic assessment.")
    strengths: List[str] = Field(default_factory=list, description="Key deterministic strengths identified.")
    concerns: List[str] = Field(default_factory=list, description="Key deterministic concerns identified.")
    risk_explanation: List[Dict[str, Any]] = Field(default_factory=list, description="Explanations of triggered risks.")
    task_fit_explanation: Optional[str] = Field("", description="Explanation of capability alignment with requested task.")
    recommendation_explanation: Optional[str] = Field("", description="Explanation supporting deterministic recommendation.")
    confidence_explanation: Optional[str] = Field("", description="Explanation of confidence rating based on evidence depth.")
    suggested_next_checks: List[str] = Field(default_factory=list, description="Actionable verification steps before hiring.")


class SnapshotResponse(BaseModel):
    chain_id: int = Field(..., description="Blockchain network chain ID.")
    block_number: int = Field(..., description="Latest block number at snapshot capture.")
    retrieved_at: str = Field(..., description="ISO 8601 UTC timestamp of evidence retrieval.")


class TrustEvaluationResponse(BaseModel):
    agent_id: int = Field(..., description="Evaluated Agent ID.")
    scores: AgentScores = Field(..., description="Authoritative deterministic scores.")
    recommendation: str = Field(..., description="Deterministic recommendation: HIRE, REVIEW, or DO_NOT_HIRE.")
    evidence: EvidenceSummary = Field(..., description="Sanitized blockchain evidence summary.")
    risks: List[RiskFactorResponse] = Field(default_factory=list, description="Triggered deterministic risk factors.")
    ai_reasoning: AIReasoningResponse = Field(..., description="Explanatory AI synthesis layer.")
    snapshot: SnapshotResponse = Field(..., description="Verifiable blockchain evidence snapshot metadata.")


class RiskResponse(BaseModel):
    agent_id: int = Field(..., description="Evaluated Agent ID.")
    risk_score: float = Field(..., description="Authoritative deterministic aggregate risk score (0-100).")
    risk_level: str = Field(..., description="Presentation risk tier: LOW, MEDIUM, HIGH, or CRITICAL.")
    factors: List[RiskFactorResponse] = Field(default_factory=list, description="List of triggered risk factors.")
    confidence: float = Field(..., description="Confidence rating for risk assessment (0-100).")


class AgentCompareItem(BaseModel):
    agent_id: int = Field(..., description="Agent ID.")
    global_trust: float = Field(..., description="Deterministic global trust score.")
    task_fit: float = Field(..., description="Contextual task fit score.")
    risk: float = Field(..., description="Deterministic risk score.")
    confidence: float = Field(..., description="Confidence rating.")
    recommendation: str = Field(..., description="Recommendation tier: HIRE, REVIEW, or DO_NOT_HIRE.")


class CompareResponse(BaseModel):
    task: Dict[str, Any] = Field(..., description="The benchmark task used for comparison.")
    agents: List[AgentCompareItem] = Field(..., description="Individual agent score cards.")
    ranking: List[int] = Field(..., description="Deterministic ranking order of agent IDs (best to worst).")


class HealthResponse(BaseModel):
    status: str = Field(default="ok", description="Service health status.")


class ErrorDetail(BaseModel):
    code: str = Field(..., description="Machine-readable error code.")
    message: str = Field(..., description="Human-readable error explanation.")
    details: Optional[Any] = Field(None, description="Optional structured error details.")


class ErrorResponse(BaseModel):
    error: ErrorDetail = Field(..., description="Structured API error payload.")


# =====================================================================
# AGENT DISCOVERY & MARKETPLACE SCHEMAS (Phase 5.2)
# =====================================================================

class AgentTrustSummary(BaseModel):
    global_trust: float = Field(..., description="Authoritative deterministic global trust score (0-100).")
    risk: float = Field(..., description="Authoritative deterministic risk score (0-100).")
    task_fit: Optional[float] = Field(None, description="Contextual task fit score if task evaluated.")
    confidence: float = Field(..., description="Evidence volume and diversity confidence (0-100).")
    recommendation: str = Field(..., description="Deterministic recommendation tier: HIRE, REVIEW, or DO_NOT_HIRE.")


class AgentProfileResponse(BaseModel):
    agent_id: int = Field(..., description="Registered on-chain token ID.")
    owner: str = Field(..., description="Owner address holding the Agent NFT identity.")
    wallet: Optional[str] = Field(None, description="Agent operational wallet address if registered.")
    uri: Optional[str] = Field(None, description="Agent metadata registration URI.")
    capabilities: List[str] = Field(default_factory=list, description="List of declared capabilities.")
    domain: Optional[str] = Field(None, description="Specialized domain if declared on-chain.")
    endpoint: Optional[str] = Field(None, description="Agent communication endpoint if declared.")
    endpoint_verified: bool = Field(False, description="Whether endpoint URL is present on-chain.")
    wallet_verified: bool = Field(False, description="Whether operational wallet is non-zero address.")
    metadata_completeness: float = Field(0.0, description="Completeness of on-chain metadata (0-100).")
    identity_status: str = Field("AVAILABLE", description="Identity evidence status.")
    trust_summary: Optional[AgentTrustSummary] = Field(None, description="Integrated trust and risk assessment summary.")


class AgentListResponse(BaseModel):
    total: int = Field(..., description="Total number of matching registered agents.")
    limit: int = Field(..., description="Maximum page size requested.")
    offset: int = Field(..., description="Number of items skipped.")
    has_more: bool = Field(..., description="Whether additional items exist beyond this page.")
    agents: List[AgentProfileResponse] = Field(..., description="List of agent profile items.")
    scan_limit: int = Field(default=50, description="Upper bound of token IDs probed during discovery.")
    may_be_incomplete: bool = Field(
        default=True,
        description="Explicit flag indicating discovery is bounded and may be incomplete without an off-chain indexer."
    )


# =====================================================================
# HIRING ESCROW SCHEMAS (Phase 5.3.2.2)
# =====================================================================

class EscrowJobResponse(BaseModel):
    job_id: str = Field(..., description="Unique 32-byte hexadecimal job identifier (0x...).")
    client_agent_id: int = Field(..., description="Client agent NFT token ID.")
    client: str = Field(..., description="Client Ethereum wallet address that funded escrow.")
    provider_agent_id: int = Field(..., description="Provider agent NFT token ID.")
    validator_address: str = Field(..., description="Designated independent validator address.")
    reward_amount_wei: str = Field(..., description="Authoritative native MON reward escrowed in exact integer wei string.")
    reward_amount_mon: float = Field(..., description="Approximate display-only native MON reward formatted in MON tokens. For exact monetary logic and accounting, always use reward_amount_wei.")
    validator_fee_bps: int = Field(..., description="Authoritative validator fee in basis points (0-5000 bps).")
    validator_fee_percent: float = Field(..., description="Approximate display-only validator fee formatted as percentage (0-50%).")
    min_acceptance_score: int = Field(..., description="Minimum passing validation response score (1-100).")
    acceptance_deadline: int = Field(..., description="Unix timestamp by which provider must accept.")
    submission_deadline: int = Field(..., description="Unix timestamp by which provider must submit work.")
    validation_deadline: int = Field(..., description="Unix timestamp by which validator must attest.")
    task_hash: str = Field(..., description="Cryptographic Keccak-256 hash of task requirements.")
    prehire_trust_snapshot_hash: str = Field(
        ...,
        validation_alias=AliasChoices("prehire_trust_snapshot_hash", "prehire_trust_snapshotHash", "prehireTrustSnapshotHash"),
        description="Keccak-256 hash of deterministic trust score snapshot."
    )
    status: str = Field(..., description="Current job lifecycle status (e.g., CREATED, COMPLETED, REFUNDED).")
    status_code: int = Field(..., description="Numeric enum status code (0-12).")
    is_terminal: bool = Field(..., description="Whether job has reached a terminal immutable state.")
    settled: bool = Field(..., description="Contract settled flag preventing double-payout/double-refund.")
    submission_hash: str = Field(..., description="Cryptographic hash of uncompressed deliverable.")
    submission_uri: str = Field(..., description="URI where deliverable can be retrieved by validator.")
    submission_timestamp: int = Field(..., description="Unix timestamp when work was submitted.")
    validation_request_hash: str = Field(..., description="Canonical validation request hash bound to job.")
    failure_timestamp: int = Field(..., description="Unix timestamp when validation failure was recorded.")
    challenge_deadline: int = Field(..., description="Unix timestamp expiring the 24-hour challenge window.")
    dispute_timestamp: int = Field(..., description="Unix timestamp when dispute was escalated.")
    designated_arbiter: str = Field(..., description="Designated arbiter address authorized to resolve disputes.")

    model_config = {"populate_by_name": True}


class ValidatorFeeLiabilityResponse(BaseModel):
    validator_address: str = Field(..., description="Validator address queried.")
    pending_fee_wei: str = Field(..., description="Authoritative accrued pending fee liability for this validator in exact integer wei string.")
    pending_fee_mon: float = Field(..., description="Approximate display-only accrued pending fee liability in MON tokens. Use pending_fee_wei for exact accounting.")
    total_pending_fee_wei: str = Field(..., description="Authoritative global accrued pending validator liabilities across all validators in exact integer wei string.")
    total_pending_fee_mon: float = Field(..., description="Approximate display-only global accrued pending validator liabilities in MON tokens. Use total_pending_fee_wei for exact accounting.")


UINT256_MAX = 2**256 - 1


class JobPrepareRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    client_agent_id: int = Field(..., gt=0, le=UINT256_MAX, description="Hiring client agent ID (uint256, > 0).")
    provider_agent_id: int = Field(..., gt=0, le=UINT256_MAX, description="Provider agent ID to hire (uint256, > 0).")
    validator_address: str = Field(..., description="Designated validator address.")
    reward_amount_wei: str = Field(..., description="Authoritative reward amount in exact integer wei string.")
    validator_fee_bps: int = Field(default=500, ge=0, le=5000, description="Validator fee in bps (0-5000, max 50%).")
    min_acceptance_score: int = Field(default=70, ge=1, le=100, description="Minimum validation score (1-100).")
    acceptance_deadline: int = Field(..., gt=0, description="Acceptance deadline Unix timestamp.")
    submission_deadline: int = Field(..., gt=0, description="Submission deadline Unix timestamp.")
    validation_deadline: int = Field(..., gt=0, description="Validation deadline Unix timestamp.")
    task_description: Optional[str] = Field(None, max_length=2000, description="Clear description to compute task_hash.")
    task_hash: Optional[str] = Field(None, description="Explicit 32-byte hex task hash if pre-computed.")
    prehire_trust_snapshot_hash: Optional[str] = Field(
        None,
        validation_alias=AliasChoices(
            "prehire_trust_snapshot_hash",
            "prehire_trust_snapshotHash",
            "prehireTrustSnapshotHash"
        ),
        description="Optional prehire trust snapshot hash."
    )
    arbiter_override: Optional[str] = Field(None, description="Optional designated arbiter override address.")
    nonce: Optional[int] = Field(None, ge=0, le=UINT256_MAX, description="Optional caller nonce to ensure job_id uniqueness across repeat jobs with identical terms.")
    job_id: Optional[str] = Field(None, description="Optional caller-supplied 32-byte hex job ID override.")


class JobPrepareResponse(BaseModel):
    job_id: str = Field(..., description="Deterministic or assigned 32-byte hex job ID.")
    client_agent_id: int
    provider_agent_id: int
    validator_address: str
    reward_amount_wei: str = Field(..., description="Authoritative native MON reward in exact integer wei string.")
    reward_amount_mon: float = Field(..., description="Approximate display-only native MON reward formatted in MON tokens. Use reward_amount_wei for exact accounting.")
    validator_fee_bps: int = Field(..., description="Authoritative validator fee in basis points (0-5000 bps).")
    validator_fee_percent: float = Field(..., description="Approximate display-only validator fee formatted as percentage.")
    min_acceptance_score: int
    acceptance_deadline: int
    submission_deadline: int
    validation_deadline: int
    task_hash: str
    prehire_trust_snapshot_hash: str
    designated_arbiter: str
    escrow_contract_address: Optional[str]
    nonce: Optional[int] = Field(None, description="Caller nonce included in job_id derivation, if provided.")
    preflight_identity_verified: Optional[bool] = Field(None, description="Whether counterparty identities were verified via RPC pre-flight. Null if RPC was unavailable.")
    prehire_trust_summary: Optional[AgentTrustSummary] = None
    transaction_parameters: Dict[str, Any] = Field(..., description="Prepared transaction parameters for client-side wallet signing.")
    broadcast: bool = Field(False, description="Always False: backend never broadcasts transactions.")
    instructions: str = Field(..., description="Instructions for executing this transaction in user wallet.")



