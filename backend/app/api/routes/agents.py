from typing import Optional, List
from fastapi import APIRouter, Depends, Path, Query

from app.api.dependencies import (
    get_discovery_adapter,
    get_evidence_adapter,
    get_trust_engine
)
from app.trust.blockchain.discovery_adapter import DiscoveryAdapter
from app.trust.blockchain.evidence_adapter import UnifiedEvidenceAdapter
from app.trust.blockchain.errors import (
    AgentNotFoundError as BlockchainAgentNotFoundError,
    RPCError as BlockchainRPCError,
    ContractError as BlockchainContractError
)
from app.trust.engine import TrustEngine
from app.trust.models import TaskEvidence, AgentCapabilities

from app.api.schemas import (
    AgentProfileResponse,
    AgentListResponse,
    AgentTrustSummary
)
from app.api.errors import (
    AgentNotFoundError,
    RPCException,
    ContractException,
    InvalidRequestException,
    TrustEvaluationException
)

router = APIRouter(tags=["Agent Discovery & Marketplace"])


def compute_trust_summary(
    agent_id: int,
    capabilities: List[str],
    domain: Optional[str],
    evidence_adapter: UnifiedEvidenceAdapter,
    trust_engine: TrustEngine
) -> Optional[AgentTrustSummary]:
    """Computes authoritative trust and risk summary for an agent profile if evidence is available."""
    try:
        evidence = evidence_adapter.get_agent_evidence(agent_id)
        task = TaskEvidence(
            requested_task="Marketplace Discovery",
            required_capabilities=capabilities,
            domain=domain
        )
        caps = AgentCapabilities(capabilities=capabilities, domain=domain)
        result = trust_engine.evaluate(
            identity=evidence.identity,
            reputation=evidence.reputation,
            validation=evidence.validation,
            reliability=evidence.reliability,
            task=task,
            agent_caps=caps
        )
        return AgentTrustSummary(
            global_trust=round(result.global_trust_score, 2),
            risk=round(result.risk_score, 2),
            task_fit=round(result.task_fit_score, 2),
            confidence=round(result.confidence, 2),
            recommendation=result.recommendation.value
        )
    except Exception:
        return None


@router.get(
    "/agents",
    response_model=AgentListResponse,
    summary="List Registered Agents",
    description="Discovers and lists registered agents with bounded pagination, optional case-insensitive capability and domain filters, and deterministic sorting."
)
def list_agents(
    limit: int = Query(default=10, ge=1, le=50, description="Maximum number of agents to return (1-50)"),
    offset: int = Query(default=0, ge=0, description="Number of agents to skip (offset >= 0)"),
    capability: Optional[str] = Query(default=None, max_length=100, description="Optional case-insensitive capability filter"),
    domain: Optional[str] = Query(default=None, max_length=100, description="Optional case-insensitive domain filter"),
    discovery_adapter: DiscoveryAdapter = Depends(get_discovery_adapter),
    evidence_adapter: UnifiedEvidenceAdapter = Depends(get_evidence_adapter),
    trust_engine: TrustEngine = Depends(get_trust_engine)
) -> AgentListResponse:
    # 1. Discover all registered agent IDs using bounded scan
    try:
        agent_ids = discovery_adapter.discover_registered_ids()
    except BlockchainRPCError as e:
        raise RPCException(f"RPC connection error during agent discovery: {e}")
    except BlockchainContractError as e:
        raise ContractException(f"Smart contract error during agent discovery: {e}")
    except Exception as e:
        err_msg = str(e)
        if "RPC" in err_msg or "connect" in err_msg.lower() or "timeout" in err_msg.lower():
            raise RPCException("Blockchain RPC connection failed during agent discovery.")
        raise TrustEvaluationException("Unexpected error during agent discovery.")

    # Sanitize filter strings
    cap_filter = capability.strip().lower() if capability and capability.strip() else None
    dom_filter = domain.strip().lower() if domain and domain.strip() else None

    matching_agents: List[AgentProfileResponse] = []

    # 2. Inspect candidate profiles and apply deterministic filters
    for aid in agent_ids:
        try:
            raw_profile = discovery_adapter.get_agent_raw_profile(aid)
        except BlockchainAgentNotFoundError:
            continue
        except BlockchainRPCError as e:
            raise RPCException(f"RPC failure while reading agent {aid}: {e}")
        except Exception:
            continue

        # Filter by capability (case-insensitive match against declared capabilities)
        if cap_filter:
            agent_caps_lower = [c.lower() for c in raw_profile.get("capabilities", [])]
            if cap_filter not in agent_caps_lower:
                continue

        # Filter by domain (case-insensitive match)
        if dom_filter:
            agent_domain = raw_profile.get("domain")
            if not agent_domain or agent_domain.lower() != dom_filter:
                continue

        # Cleanly integrate trust summary
        trust_summary = compute_trust_summary(
            aid,
            raw_profile.get("capabilities", []),
            raw_profile.get("domain"),
            evidence_adapter,
            trust_engine
        )

        matching_agents.append(
            AgentProfileResponse(
                agent_id=raw_profile["agent_id"],
                owner=raw_profile["owner"],
                wallet=raw_profile["wallet"],
                uri=raw_profile["uri"],
                capabilities=raw_profile["capabilities"],
                domain=raw_profile["domain"],
                endpoint=raw_profile["endpoint"],
                endpoint_verified=raw_profile["endpoint_verified"],
                wallet_verified=raw_profile["wallet_verified"],
                metadata_completeness=raw_profile["metadata_completeness"],
                identity_status=raw_profile["identity_status"],
                trust_summary=trust_summary
            )
        )

    # 3. Deterministic ordering: strictly by agent_id ascending
    matching_agents.sort(key=lambda a: a.agent_id)

    # 4. Bounded pagination slice
    total = len(matching_agents)
    paged = matching_agents[offset : offset + limit]
    has_more = (offset + limit) < total

    scan_limit = getattr(discovery_adapter, "max_scan_limit", 50)
    may_be_incomplete = getattr(discovery_adapter, "may_be_incomplete", True)

    return AgentListResponse(
        total=total,
        limit=limit,
        offset=offset,
        has_more=has_more,
        agents=paged,
        scan_limit=scan_limit,
        may_be_incomplete=may_be_incomplete
    )


@router.get(
    "/agents/{agent_id}",
    response_model=AgentProfileResponse,
    summary="Get Agent Profile",
    description="Returns detailed on-chain identity profile, verified wallet, metadata, registration URI, and integrated trust summary for a single agent."
)
def get_agent_profile(
    agent_id: int = Path(..., gt=0, le=10**12, description="Target Agent ID on-chain"),
    discovery_adapter: DiscoveryAdapter = Depends(get_discovery_adapter),
    evidence_adapter: UnifiedEvidenceAdapter = Depends(get_evidence_adapter),
    trust_engine: TrustEngine = Depends(get_trust_engine)
) -> AgentProfileResponse:
    try:
        raw_profile = discovery_adapter.get_agent_raw_profile(agent_id)
    except BlockchainAgentNotFoundError:
        raise AgentNotFoundError(agent_id)
    except BlockchainRPCError as e:
        raise RPCException(f"RPC connection error reading agent {agent_id}: {e}")
    except BlockchainContractError as e:
        raise ContractException(f"Smart contract error reading agent {agent_id}: {e}")
    except Exception as e:
        err_msg = str(e)
        if "RPC" in err_msg or "connect" in err_msg.lower() or "timeout" in err_msg.lower():
            raise RPCException(f"Blockchain RPC connection failed reading agent {agent_id}.")
        raise TrustEvaluationException(f"Unexpected error reading agent {agent_id}.")

    trust_summary = compute_trust_summary(
        agent_id,
        raw_profile.get("capabilities", []),
        raw_profile.get("domain"),
        evidence_adapter,
        trust_engine
    )

    return AgentProfileResponse(
        agent_id=raw_profile["agent_id"],
        owner=raw_profile["owner"],
        wallet=raw_profile["wallet"],
        uri=raw_profile["uri"],
        capabilities=raw_profile["capabilities"],
        domain=raw_profile["domain"],
        endpoint=raw_profile["endpoint"],
        endpoint_verified=raw_profile["endpoint_verified"],
        wallet_verified=raw_profile["wallet_verified"],
        metadata_completeness=raw_profile["metadata_completeness"],
        identity_status=raw_profile["identity_status"],
        trust_summary=trust_summary
    )
