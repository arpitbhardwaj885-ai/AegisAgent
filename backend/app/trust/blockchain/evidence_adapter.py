import time
from typing import Dict, Any
from pydantic import BaseModel
from app.trust.models import IdentityEvidence, ReputationEvidence, ValidationEvidence, ReliabilityEvidence
from app.trust.constants import EvidenceStatus
from app.trust.blockchain.provider import Web3Provider
from app.trust.blockchain.identity_adapter import IdentityAdapter
from app.trust.blockchain.reputation_adapter import ReputationAdapter
from app.trust.blockchain.validation_adapter import ValidationAdapter
from app.trust.blockchain.errors import AgentNotFoundError

class AgentEvidence(BaseModel):
    identity: IdentityEvidence
    reputation: ReputationEvidence
    validation: ValidationEvidence
    reliability: ReliabilityEvidence
    identity_status: EvidenceStatus
    reputation_status: EvidenceStatus
    validation_status: EvidenceStatus
    snapshot_meta: Dict[str, Any]

class UnifiedEvidenceAdapter:
    def __init__(self, provider: Web3Provider):
        self.provider = provider
        self.identity_adapter = IdentityAdapter(provider)
        self.reputation_adapter = ReputationAdapter(provider)
        self.validation_adapter = ValidationAdapter(provider)
        
    def get_agent_evidence(self, agent_id: int) -> AgentEvidence:
        self.provider.check_connection()
        
        snapshot_meta = {
            "chain_id": self.provider.chain_id,
            "block_number": self.provider.get_latest_block(),
            "timestamp": int(time.time()),
            "agent_id": agent_id
        }
        
        # Identity
        identity_status = EvidenceStatus.AVAILABLE
        try:
            identity_evidence = self.identity_adapter.get_identity_evidence(agent_id)
        except AgentNotFoundError as e:
            identity_status = EvidenceStatus.MISSING
            identity_evidence = IdentityEvidence()
            snapshot_meta["identity_error"] = str(e)
        except Exception as e:
            identity_status = EvidenceStatus.INVALID
            identity_evidence = IdentityEvidence()
            snapshot_meta["identity_error"] = str(e)
            
        # Reputation
        reputation_status = EvidenceStatus.AVAILABLE
        try:
            reputation_evidence = self.reputation_adapter.get_reputation_evidence(agent_id)
            if reputation_evidence.feedback_count == 0:
                reputation_status = EvidenceStatus.MISSING
        except Exception as e:
            reputation_status = EvidenceStatus.INVALID
            reputation_evidence = ReputationEvidence()
            snapshot_meta["reputation_error"] = str(e)
            
        # Validation
        validation_status = EvidenceStatus.AVAILABLE
        try:
            validation_evidence = self.validation_adapter.get_validation_evidence(agent_id)
            if validation_evidence.validation_count == 0:
                validation_status = EvidenceStatus.MISSING
        except Exception as e:
            validation_status = EvidenceStatus.INVALID
            validation_evidence = ValidationEvidence()
            snapshot_meta["validation_error"] = str(e)
            
        # Reliability (stub since there's no on-chain task registry yet)
        reliability_evidence = ReliabilityEvidence()
        
        return AgentEvidence(
            identity=identity_evidence,
            reputation=reputation_evidence,
            validation=validation_evidence,
            reliability=reliability_evidence,
            identity_status=identity_status,
            reputation_status=reputation_status,
            validation_status=validation_status,
            snapshot_meta=snapshot_meta
        )
