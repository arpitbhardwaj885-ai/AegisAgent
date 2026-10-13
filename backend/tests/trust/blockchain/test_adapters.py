import pytest
import json
from unittest.mock import MagicMock
from app.trust.blockchain.identity_adapter import IdentityAdapter
from app.trust.blockchain.reputation_adapter import ReputationAdapter
from app.trust.blockchain.validation_adapter import ValidationAdapter
from app.trust.blockchain.errors import AgentNotFoundError, RPCError
from app.trust.models import IdentityEvidence, ReputationEvidence, ValidationEvidence

@pytest.fixture
def mock_provider():
    provider = MagicMock()
    return provider

def test_identity_adapter_nonexistent(mock_provider):
    mock_contract = MagicMock()
    mock_provider.get_contract.return_value = mock_contract
    mock_contract.functions.ownerOf.return_value.call.side_effect = Exception("execution reverted: ERC721NonexistentToken")
    
    adapter = IdentityAdapter(mock_provider)
    with pytest.raises(AgentNotFoundError):
        adapter.get_identity_evidence(999)

def test_identity_adapter_valid(mock_provider):
    mock_contract = MagicMock()
    mock_provider.get_contract.return_value = mock_contract
    
    mock_contract.functions.ownerOf.return_value.call.return_value = "0x123"
    mock_contract.functions.getAgentWallet.return_value.call.return_value = "0x456"
    mock_contract.functions.tokenURI.return_value.call.return_value = "ipfs://abc"
    
    def get_metadata_side_effect(agent_id, key):
        mock_call = MagicMock()
        if key == "capabilities":
            mock_call.call.return_value = json.dumps(["solidity", "audit"]).encode('utf-8')
        elif key == "endpoint":
            mock_call.call.return_value = b"https://api.agent.com"
        else:
            mock_call.call.return_value = b""
        return mock_call
        
    mock_contract.functions.getMetadata.side_effect = get_metadata_side_effect
    
    adapter = IdentityAdapter(mock_provider)
    ev = adapter.get_identity_evidence(1)
    assert ev.agent_exists
    assert ev.wallet_verified
    assert ev.endpoint_verified
    assert ev.capability_count == 2
    assert ev.metadata_completeness == 100.0

def test_reputation_empty(mock_provider):
    mock_contract = MagicMock()
    mock_provider.get_contract.return_value = mock_contract
    mock_contract.functions.getClients.return_value.call.return_value = []
    
    adapter = ReputationAdapter(mock_provider)
    ev = adapter.get_reputation_evidence(1)
    assert ev.feedback_count == 0

def test_reputation_valid(mock_provider):
    mock_contract = MagicMock()
    mock_provider.get_contract.return_value = mock_contract
    
    mock_contract.functions.getClients.return_value.call.return_value = ["0xA", "0xB"]
    
    # clients, feedbackIndexes, values, valueDecimals, tag1s, tag2s, revokedStatuses
    mock_contract.functions.readAllFeedback.return_value.call.return_value = (
        ["0xA", "0xA", "0xB", "0xB"],
        [1, 2, 1, 2],
        [50, 400, 20, 100], # values
        [1, 2, 1, 2],       # decimals (5, 4, 2, 1)
        ["", "", "", ""],
        ["", "", "", ""],
        [False, False, False, True] # Last one revoked
    )
    
    adapter = ReputationAdapter(mock_provider)
    ev = adapter.get_reputation_evidence(1)
    
    assert ev.feedback_count == 3
    assert ev.unique_reviewer_count == 2
    assert ev.positive_feedback_count == 2 # 5 and 4
    assert ev.negative_feedback_count == 1 # 2
    assert len(ev.reviewer_shares) == 2
    # 0xA has 2 reviews, 0xB has 1 review (since 1 is revoked)
    assert 2/3 in ev.reviewer_shares
    assert 1/3 in ev.reviewer_shares

def test_validation_empty(mock_provider):
    mock_contract = MagicMock()
    mock_provider.get_contract.return_value = mock_contract
    mock_contract.functions.getAgentValidations.return_value.call.return_value = []
    
    adapter = ValidationAdapter(mock_provider)
    ev = adapter.get_validation_evidence(1)
    assert ev.validation_count == 0

def test_validation_valid(mock_provider):
    mock_contract = MagicMock()
    mock_provider.get_contract.return_value = mock_contract
    
    mock_contract.functions.getAgentValidations.return_value.call.return_value = [b"hash1", b"hash2"]
    
    def status_side_effect(req_hash):
        mock_call = MagicMock()
        # validator, response, hasResponse, responseHash, tag, lastUpdate
        if req_hash == b"hash1":
            mock_call.call.return_value = ("0xV1", 1, 100, b"resp_hash1", "", 1000)
        else:
            mock_call.call.return_value = ("0xV2", 1, 0, b"resp_hash2", "", 2000) # Response 0 is valid failure
        return mock_call
        
    mock_contract.functions.getValidationStatus.side_effect = status_side_effect
    
    adapter = ValidationAdapter(mock_provider)
    ev = adapter.get_validation_evidence(1)
    assert ev.validation_count == 2
    assert ev.unique_validator_count == 2
    assert ev.successful_validation_count == 1
    assert ev.failed_validation_count == 1
    assert len(ev.validator_shares) == 2
