import logging
import time
from typing import Optional
from fastapi import APIRouter, Depends, Path
from web3 import Web3

from app.api.dependencies import (
    get_escrow_adapter,
    get_evidence_adapter,
    get_identity_adapter,
    get_trust_engine
)
from app.trust.blockchain.escrow_adapter import EscrowAdapter
from app.trust.blockchain.evidence_adapter import UnifiedEvidenceAdapter
from app.trust.blockchain.identity_adapter import IdentityAdapter
from app.trust.blockchain.errors import (
    EscrowNotConfiguredError,
    JobNotFoundError,
    AgentNotFoundError,
    InvalidDataError,
    RPCError,
    ContractError
)

from app.trust.engine import TrustEngine
from app.trust.models import TaskEvidence, AgentCapabilities
from app.api.schemas import (
    EscrowJobResponse,
    ValidatorFeeLiabilityResponse,
    JobPrepareRequest,
    JobPrepareResponse,
    AgentTrustSummary
)
from app.api.errors import (
    EscrowNotConfiguredException,
    JobNotFoundException,
    InvalidRequestException,
    RPCException,
    ContractException
)

logger = logging.getLogger("aegisagent.escrow")

router = APIRouter(prefix="/escrow", tags=["Hiring Escrow"])


@router.get(
    "/jobs/{job_id}",
    response_model=EscrowJobResponse,
    summary="Get Escrow Job State",
    description="Reads on-chain state and terms of a hiring escrow job by jobId. Decodes all 23 struct fields and terminal flags."
)
def get_escrow_job(
    job_id: str = Path(..., description="32-byte hexadecimal job ID (with or without 0x prefix)."),
    escrow_adapter: EscrowAdapter = Depends(get_escrow_adapter)
) -> EscrowJobResponse:
    """Reads job state from AegisHiringEscrow contract."""
    try:
        job_data = escrow_adapter.get_job(job_id)
        return EscrowJobResponse(**job_data)
    except EscrowNotConfiguredError as e:
        raise EscrowNotConfiguredException(str(e))
    except JobNotFoundError:
        raise JobNotFoundException(job_id)
    except InvalidDataError as e:
        raise InvalidRequestException(str(e))
    except RPCError as e:
        raise RPCException(str(e))
    except ContractError as e:
        raise ContractException(str(e))


@router.get(
    "/validators/{validator_address}/fees",
    response_model=ValidatorFeeLiabilityResponse,
    summary="Get Validator Fee Liabilities",
    description="Reads pending accrued validator fee liabilities for a given validator and total pending liabilities across all validators."
)
def get_validator_fee_liabilities(
    validator_address: str = Path(..., description="Ethereum address of the validator."),
    escrow_adapter: EscrowAdapter = Depends(get_escrow_adapter)
) -> ValidatorFeeLiabilityResponse:
    """Reads validator fee liabilities from AegisHiringEscrow contract."""
    if not Web3.is_address(validator_address):
        raise InvalidRequestException(f"Invalid Ethereum address format for validator: {validator_address}")

    try:
        pending_fee = escrow_adapter.get_pending_validator_fees(validator_address)
        total_pending = escrow_adapter.get_total_pending_validator_fees()

        return ValidatorFeeLiabilityResponse(
            validator_address=Web3.to_checksum_address(validator_address),
            pending_fee_wei=str(pending_fee),
            pending_fee_mon=float(pending_fee) / 10**18,
            total_pending_fee_wei=str(total_pending),
            total_pending_fee_mon=float(total_pending) / 10**18
        )
    except EscrowNotConfiguredError as e:
        raise EscrowNotConfiguredException(str(e))
    except InvalidDataError as e:
        raise InvalidRequestException(str(e))
    except RPCError as e:
        raise RPCException(str(e))
    except ContractError as e:
        raise ContractException(str(e))


@router.post(
    "/jobs/prepare",
    response_model=JobPrepareResponse,
    summary="Prepare and Validate Job Parameters",
    description="Validates proposed job terms, computes cryptographic hashes, and constructs unsigned transaction parameters without broadcasting."
)
def prepare_job_parameters(
    request: JobPrepareRequest,
    escrow_adapter: EscrowAdapter = Depends(get_escrow_adapter),
    evidence_adapter: UnifiedEvidenceAdapter = Depends(get_evidence_adapter),
    identity_adapter: IdentityAdapter = Depends(get_identity_adapter),
    trust_engine: TrustEngine = Depends(get_trust_engine)
) -> JobPrepareResponse:
    """
    Validates job parameters and prepares transaction payload.
    Strictly read-only: does not broadcast transactions or spend funds.
    """
    from decimal import Decimal

    # 1. Counterparty validation
    if request.client_agent_id == request.provider_agent_id:
        raise InvalidRequestException("Client agent cannot hire self (clientAgentId == providerAgentId).")

    if not Web3.is_address(request.validator_address):
        raise InvalidRequestException(f"Invalid validator address: {request.validator_address}")

    validator_checksum = Web3.to_checksum_address(request.validator_address)
    if validator_checksum == "0x0000000000000000000000000000000000000000":
        raise InvalidRequestException("Validator cannot be zero address.")

    # 2. Reward and fee validation
    try:
        reward_wei_int = int(request.reward_amount_wei)
        if reward_wei_int <= 0:
            raise ValueError()
    except ValueError:
        raise InvalidRequestException("Reward amount must be a positive integer in wei.")

    if request.validator_fee_bps < 0 or request.validator_fee_bps > 5000:
        raise InvalidRequestException("Validator fee must be between 0 and 5000 basis points (max 50%).")

    if request.min_acceptance_score < 1 or request.min_acceptance_score > 100:
        raise InvalidRequestException("Minimum acceptance score must be between 1 and 100.")

    # 3. Deadline ordering validation
    now_ts = int(time.time())
    if request.acceptance_deadline <= now_ts:
        raise InvalidRequestException(
            f"Acceptance deadline ({request.acceptance_deadline}) must be in the future (current: {now_ts})."
        )
    if request.submission_deadline <= request.acceptance_deadline:
        raise InvalidRequestException("Submission deadline must follow acceptance deadline.")
    if request.validation_deadline <= request.submission_deadline:
        raise InvalidRequestException("Validation deadline must follow submission deadline.")

    # 4. Optional pre-flight identity existence check if RPC is available
    preflight_identity_verified: Optional[bool] = None
    if identity_adapter and hasattr(identity_adapter, "get_agent_owner"):
        try:
            identity_adapter.get_agent_owner(request.client_agent_id)
            identity_adapter.get_agent_owner(request.provider_agent_id)
            preflight_identity_verified = True
        except AgentNotFoundError as e:
            raise InvalidRequestException(str(e))
        except (RPCError, Exception) as e:
            logger.warning("Identity pre-flight check skipped due to RPC unavailability: %s", e)
            preflight_identity_verified = None

    # 4. Task hash computation
    if request.task_hash:
        try:
            task_hash_clean = request.task_hash.strip()
            if task_hash_clean.startswith("0x") or task_hash_clean.startswith("0X"):
                task_hash_clean = task_hash_clean[2:]
            if len(task_hash_clean) != 64:
                raise ValueError("Task hash must be 32 bytes (64 hex characters).")
            task_hash_bytes = bytes.fromhex(task_hash_clean)
            task_hash_str = "0x" + task_hash_bytes.hex()
        except ValueError as e:
            raise InvalidRequestException(f"Invalid task_hash format: {e}")
    elif request.task_description:
        task_hash_str = "0x" + Web3.keccak(text=request.task_description).hex()
    else:
        raise InvalidRequestException("Either task_description or task_hash must be provided.")

    # 5. Prehire trust evaluation & snapshot hash (advisory)
    prehire_trust_summary: Optional[AgentTrustSummary] = None
    prehire_snapshot_hash: str = request.prehire_trust_snapshot_hash or ""

    try:
        provider_evidence = evidence_adapter.get_agent_evidence(request.provider_agent_id)
        task_evidence = TaskEvidence(
            requested_task=request.task_description or "Job Proposal Verification",
            required_capabilities=[],
            domain=None
        )
        caps = AgentCapabilities(capabilities=[], domain=None)
        eval_result = trust_engine.evaluate(
            identity=provider_evidence.identity,
            reputation=provider_evidence.reputation,
            validation=provider_evidence.validation,
            reliability=provider_evidence.reliability,
            task=task_evidence,
            agent_caps=caps
        )
        prehire_trust_summary = AgentTrustSummary(
            global_trust=round(eval_result.global_trust_score, 2),
            risk=round(eval_result.risk_score, 2),
            task_fit=round(eval_result.task_fit_score, 2),
            confidence=round(eval_result.confidence, 2),
            recommendation=eval_result.recommendation.value
        )
        if not prehire_snapshot_hash:
            # Deterministic snapshot hash of pre-hire evaluation
            prehire_snapshot_hash = "0x" + Web3.keccak(
                text=f"{request.provider_agent_id}:{eval_result.global_trust_score}:{eval_result.risk_score}:{now_ts}"
            ).hex()
    except Exception:
        # Prehire trust evaluation failure does not block parameter preparation; fallback snapshot hash
        if not prehire_snapshot_hash:
            prehire_snapshot_hash = "0x" + Web3.keccak(
                text=f"{request.provider_agent_id}:snapshot:{now_ts}"
            ).hex()

    # 6. Generate canonical Job ID
    if request.job_id:
        try:
            clean_id = request.job_id.strip()
            if clean_id.startswith("0x") or clean_id.startswith("0X"):
                clean_id = clean_id[2:]
            if len(clean_id) != 64:
                raise ValueError("Explicit job_id must be 32 bytes (64 hex characters).")
            job_id_bytes = bytes.fromhex(clean_id)
            job_id_str = "0x" + job_id_bytes.hex()
        except ValueError as e:
            raise InvalidRequestException(f"Invalid explicit job_id format: {e}")
    elif request.nonce is not None:
        # Nonce-augmented derivation for repeat job uniqueness
        job_id_bytes = Web3.solidity_keccak(
            ["uint256", "uint256", "bytes32", "uint64", "uint256"],
            [
                request.client_agent_id,
                request.provider_agent_id,
                bytes.fromhex(task_hash_str[2:]),
                request.acceptance_deadline,
                request.nonce
            ]
        )
        job_id_str = "0x" + job_id_bytes.hex()
    else:
        # Standard canonical derivation
        job_id_bytes = Web3.solidity_keccak(
            ["uint256", "uint256", "bytes32", "uint64"],
            [
                request.client_agent_id,
                request.provider_agent_id,
                bytes.fromhex(task_hash_str[2:]),
                request.acceptance_deadline
            ]
        )
        job_id_str = "0x" + job_id_bytes.hex()

    # 7. Arbiter resolution
    designated_arbiter = (
        Web3.to_checksum_address(request.arbiter_override)
        if request.arbiter_override and Web3.is_address(request.arbiter_override)
        else "0x0000000000000000000000000000000000000000"
    )

    # 8. Unsigned transaction construction
    tx_params = {
        "function": "createJob",
        "contract": escrow_adapter.address,
        "value": str(reward_wei_int),
        "args": {
            "jobId": job_id_str,
            "clientAgentId": request.client_agent_id,
            "providerAgentId": request.provider_agent_id,
            "validatorAddress": validator_checksum,
            "validatorFeeBps": request.validator_fee_bps,
            "minAcceptanceScore": request.min_acceptance_score,
            "acceptanceDeadline": request.acceptance_deadline,
            "submissionDeadline": request.submission_deadline,
            "validationDeadline": request.validation_deadline,
            "taskHash": task_hash_str,
            "prehireTrustSnapshotHash": prehire_snapshot_hash,
            "arbiterOverride": designated_arbiter
        }
    }

    reward_mon = float(Decimal(reward_wei_int) / Decimal(10**18))
    fee_percent = float(Decimal(request.validator_fee_bps) / Decimal(100))

    instructions_text = (
        "Transaction parameters prepared successfully. Sign and broadcast this call "
        "directly from your client wallet (e.g. MetaMask). The AegisAgent backend does "
        "not sign transactions or custody private keys."
    )
    if preflight_identity_verified is None:
        instructions_text += " Note: Blockchain RPC was unavailable during pre-flight identity check; on-chain createJob will authoritatively verify identity existence."

    return JobPrepareResponse(
        job_id=job_id_str,
        client_agent_id=request.client_agent_id,
        provider_agent_id=request.provider_agent_id,
        validator_address=validator_checksum,
        reward_amount_wei=str(reward_wei_int),
        reward_amount_mon=reward_mon,
        validator_fee_bps=request.validator_fee_bps,
        validator_fee_percent=fee_percent,
        min_acceptance_score=request.min_acceptance_score,
        acceptance_deadline=request.acceptance_deadline,
        submission_deadline=request.submission_deadline,
        validation_deadline=request.validation_deadline,
        task_hash=task_hash_str,
        prehire_trust_snapshot_hash=prehire_snapshot_hash,
        designated_arbiter=designated_arbiter,
        escrow_contract_address=escrow_adapter.address,
        nonce=request.nonce,
        preflight_identity_verified=preflight_identity_verified,
        prehire_trust_summary=prehire_trust_summary,
        transaction_parameters=tx_params,
        broadcast=False,
        instructions=instructions_text
    )

