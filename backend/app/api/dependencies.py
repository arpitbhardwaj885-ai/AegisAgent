from fastapi import Depends
from app.trust.blockchain.provider import Web3Provider
from app.trust.blockchain.evidence_adapter import UnifiedEvidenceAdapter
from app.trust.engine import TrustEngine
from app.trust.ai.reasoner import AITrustReasoner


def get_web3_provider() -> Web3Provider:
    """Provides Web3 provider instance."""
    return Web3Provider()


def get_evidence_adapter(
    provider: Web3Provider = Depends(get_web3_provider)
) -> UnifiedEvidenceAdapter:
    """Provides Unified Blockchain Evidence Adapter instance."""
    return UnifiedEvidenceAdapter(provider)


def get_trust_engine() -> TrustEngine:
    """Provides authoritative deterministic Trust Engine instance."""
    return TrustEngine()


def get_ai_reasoner() -> AITrustReasoner:
    """Provides AI Trust Reasoning layer instance."""
    return AITrustReasoner()


def get_discovery_adapter(
    provider: Web3Provider = Depends(get_web3_provider)
):
    """Provides DiscoveryAdapter instance for marketplace agent discovery."""
    from app.trust.blockchain.discovery_adapter import DiscoveryAdapter
    return DiscoveryAdapter(provider)


def get_escrow_adapter(
    provider: Web3Provider = Depends(get_web3_provider)
):
    """Provides EscrowAdapter instance for reading job escrow state."""
    from app.trust.blockchain.escrow_adapter import EscrowAdapter
    return EscrowAdapter(provider)


def get_identity_adapter(
    provider: Web3Provider = Depends(get_web3_provider)
):
    """Provides IdentityAdapter instance for reading agent wallet & ownership."""
    from app.trust.blockchain.identity_adapter import IdentityAdapter
    return IdentityAdapter(provider)


