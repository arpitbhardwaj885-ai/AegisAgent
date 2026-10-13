import json
import pytest
from unittest.mock import MagicMock

from app.trust.blockchain.discovery_adapter import DiscoveryAdapter
from app.trust.blockchain.errors import AgentNotFoundError, RPCError


@pytest.fixture
def mock_provider():
    p = MagicMock()
    p.check_connection.return_value = None
    return p


@pytest.fixture
def mock_identity_adapter():
    ia = MagicMock()
    return ia


def test_discovery_adapter_caching(mock_provider, mock_identity_adapter):
    mock_contract = MagicMock()
    mock_identity_adapter.contract = mock_contract

    # ID 1 exists, ID 2 nonexistent, ID 3 nonexistent -> stops
    def owner_side_effect(aid):
        call_mock = MagicMock()
        if aid == 1:
            call_mock.call.return_value = "0xOwner1"
        else:
            call_mock.call.side_effect = Exception("execution reverted: ERC721NonexistentToken")
        return call_mock

    mock_contract.functions.ownerOf.side_effect = owner_side_effect

    adapter = DiscoveryAdapter(mock_provider, mock_identity_adapter, cache_ttl=10.0, max_consecutive_misses=2)

    # First discovery call
    ids_1 = adapter.discover_registered_ids()
    assert ids_1 == [1]
    initial_call_count = mock_contract.functions.ownerOf.call_count

    # Second discovery call should hit cache without new RPC calls
    ids_2 = adapter.discover_registered_ids()
    assert ids_2 == [1]
    assert mock_contract.functions.ownerOf.call_count == initial_call_count

    # Force refresh must bypass cache
    ids_3 = adapter.discover_registered_ids(force_refresh=True)
    assert ids_3 == [1]
    assert mock_contract.functions.ownerOf.call_count > initial_call_count


def test_discovery_adapter_burned_token_gap(mock_provider, mock_identity_adapter):
    mock_contract = MagicMock()
    mock_identity_adapter.contract = mock_contract

    # ID 1 exists, ID 2 missing (burned), ID 3 exists, ID 4 & 5 missing
    def owner_side_effect(aid):
        call_mock = MagicMock()
        if aid in (1, 3):
            call_mock.call.return_value = f"0xOwner_{aid}"
        else:
            call_mock.call.side_effect = Exception("execution reverted: 7e273289")
        return call_mock

    mock_contract.functions.ownerOf.side_effect = owner_side_effect

    adapter = DiscoveryAdapter(mock_provider, mock_identity_adapter, max_consecutive_misses=2)
    discovered = adapter.discover_registered_ids()
    assert discovered == [1, 3]


def test_discovery_adapter_raw_profile_parsing(mock_provider, mock_identity_adapter):
    mock_contract = MagicMock()
    mock_identity_adapter.contract = mock_contract

    mock_contract.functions.ownerOf.return_value.call.return_value = "0xOwner"
    mock_contract.functions.getAgentWallet.return_value.call.return_value = "0xWallet"
    mock_contract.functions.tokenURI.return_value.call.return_value = "ipfs://test-agent-uri"

    def metadata_side_effect(aid, key):
        call_mock = MagicMock()
        if key == "capabilities":
            call_mock.call.return_value = json.dumps(["solidity", "audit", "security"]).encode("utf-8")
        elif key == "endpoint":
            call_mock.call.return_value = b"https://agent.example.com"
        elif key == "domain":
            call_mock.call.return_value = b"security"
        else:
            call_mock.call.return_value = b""
        return call_mock

    mock_contract.functions.getMetadata.side_effect = metadata_side_effect

    adapter = DiscoveryAdapter(mock_provider, mock_identity_adapter)
    profile = adapter.get_agent_raw_profile(1)

    assert profile["agent_id"] == 1
    assert profile["owner"] == "0xOwner"
    assert profile["wallet"] == "0xWallet"
    assert profile["wallet_verified"] is True
    assert profile["endpoint_verified"] is True
    assert profile["capabilities"] == ["solidity", "audit", "security"]
    assert profile["domain"] == "security"
    assert profile["metadata_completeness"] == 100.0


def test_discovery_adapter_malformed_metadata(mock_provider, mock_identity_adapter):
    mock_contract = MagicMock()
    mock_identity_adapter.contract = mock_contract

    mock_contract.functions.ownerOf.return_value.call.return_value = "0xOwner"
    mock_contract.functions.getAgentWallet.return_value.call.return_value = "0x0000000000000000000000000000000000000000"
    mock_contract.functions.tokenURI.return_value.call.return_value = ""

    def metadata_side_effect(aid, key):
        call_mock = MagicMock()
        if key == "capabilities":
            # Invalid JSON string
            call_mock.call.return_value = b"not-a-valid-json-string{"
        else:
            call_mock.call.return_value = b""
        return call_mock

    mock_contract.functions.getMetadata.side_effect = metadata_side_effect

    adapter = DiscoveryAdapter(mock_provider, mock_identity_adapter)
    profile = adapter.get_agent_raw_profile(1)

    assert profile["capabilities"] == []
    assert profile["wallet"] is None
    assert profile["wallet_verified"] is False
    assert profile["endpoint_verified"] is False


def test_discovery_adapter_rpc_failure(mock_provider, mock_identity_adapter):
    mock_contract = MagicMock()
    mock_identity_adapter.contract = mock_contract

    mock_contract.functions.ownerOf.return_value.call.side_effect = Exception("Monad RPC connection timed out")

    adapter = DiscoveryAdapter(mock_provider, mock_identity_adapter)
    with pytest.raises(RPCError):
        adapter.discover_registered_ids()


def test_gap_and_multiple_consecutive_nonexistent_ids_followed_by_valid_token(mock_provider, mock_identity_adapter):
    """
    Tests that a gap of 2 or more consecutive nonexistent IDs does NOT abort enumeration early.
    Valid tokens after multi-token gaps must be discovered.
    """
    mock_contract = MagicMock()
    mock_identity_adapter.contract = mock_contract

    # Token 1 exists
    # Tokens 2, 3 missing (gap of 2 nonexistent IDs)
    # Token 4 exists
    # Tokens 5, 6, 7 missing (gap of 3 nonexistent IDs)
    # Token 8 exists
    valid_ids = {1, 4, 8}

    def owner_side_effect(aid):
        call_mock = MagicMock()
        if aid in valid_ids:
            call_mock.call.return_value = f"0xOwner_{aid}"
        else:
            call_mock.call.side_effect = Exception("execution reverted: ERC721NonexistentToken")
        return call_mock

    mock_contract.functions.ownerOf.side_effect = owner_side_effect

    # Scan with limit=10 (no premature stop after 2 misses)
    adapter = DiscoveryAdapter(mock_provider, mock_identity_adapter, max_scan_limit=10)
    discovered = adapter.discover_registered_ids()
    assert discovered == [1, 4, 8]


def test_scan_limit_behavior(mock_provider, mock_identity_adapter):
    """
    Tests that scanning strictly stops at max_scan_limit and marks results as potentially incomplete.
    """
    mock_contract = MagicMock()
    mock_identity_adapter.contract = mock_contract

    # Tokens 1..10 all exist
    mock_contract.functions.ownerOf.return_value.call.return_value = "0xOwner"

    adapter = DiscoveryAdapter(mock_provider, mock_identity_adapter, max_scan_limit=5)
    assert adapter.max_scan_limit == 5
    assert adapter.may_be_incomplete is True

    discovered = adapter.discover_registered_ids()
    assert discovered == [1, 2, 3, 4, 5]
    assert mock_contract.functions.ownerOf.call_count == 5


def test_cache_expiration(monkeypatch, mock_provider, mock_identity_adapter):
    """
    Tests that cached results expire after cache_ttl and a new scan is executed.
    """
    mock_contract = MagicMock()
    mock_identity_adapter.contract = mock_contract

    tokens_available = [1]

    def owner_side_effect(aid):
        call_mock = MagicMock()
        if aid in tokens_available:
            call_mock.call.return_value = f"0xOwner_{aid}"
        else:
            call_mock.call.side_effect = Exception("execution reverted: ERC721NonexistentToken")
        return call_mock

    mock_contract.functions.ownerOf.side_effect = owner_side_effect

    simulated_time = [1000.0]
    import time
    monkeypatch.setattr(time, "time", lambda: simulated_time[0])

    adapter = DiscoveryAdapter(mock_provider, mock_identity_adapter, cache_ttl=30.0, max_scan_limit=5)

    # Initial scan at t=1000.0
    ids_1 = adapter.discover_registered_ids()
    assert ids_1 == [1]
    initial_calls = mock_contract.functions.ownerOf.call_count

    # Advance time to t=1015.0 (within 30s TTL) -> hits cache
    simulated_time[0] = 1015.0
    ids_2 = adapter.discover_registered_ids()
    assert ids_2 == [1]
    assert mock_contract.functions.ownerOf.call_count == initial_calls

    # Add new token 2 and advance time to t=1035.0 (exceeds 30s TTL) -> expires, rescans
    tokens_available.append(2)
    simulated_time[0] = 1035.0
    ids_3 = adapter.discover_registered_ids()
    assert ids_3 == [1, 2]
    assert mock_contract.functions.ownerOf.call_count > initial_calls


def test_empty_registry_vs_rpc_failure(mock_provider, mock_identity_adapter):
    """
    Tests that a genuinely empty registry returns [] while an RPC failure raises RPCError.
    """
    mock_contract = MagicMock()
    mock_identity_adapter.contract = mock_contract

    # 1. Genuinely empty registry: all tokens revert with NonexistentToken
    mock_contract.functions.ownerOf.return_value.call.side_effect = Exception(
        "execution reverted: ERC721NonexistentToken(1)"
    )
    adapter = DiscoveryAdapter(mock_provider, mock_identity_adapter, max_scan_limit=5)
    assert adapter.discover_registered_ids() == []

    # 2. RPC Failure: raises RPCError, never confused with empty registry
    mock_contract.functions.ownerOf.return_value.call.side_effect = Exception(
        "503 Service Unavailable: Failed to connect to Monad testnet node"
    )
    with pytest.raises(RPCError):
        adapter.discover_registered_ids(force_refresh=True)


def test_configured_registry_addresses_and_chain_id():
    """
    Verifies that all adapters consistently use the intended deployed addresses
    and Monad Testnet Chain ID 10143.
    """
    from app.trust.blockchain.config import (
        IDENTITY_REGISTRY_ADDRESS,
        REPUTATION_REGISTRY_ADDRESS,
        VALIDATION_REGISTRY_ADDRESS,
        DEFAULT_CHAIN_ID
    )

    # Deployed contract on Monad Testnet
    assert IDENTITY_REGISTRY_ADDRESS == "0xa7A27f96d4e8f58d701D42229d5097A69694Ca4B"
    assert REPUTATION_REGISTRY_ADDRESS == "0x387948228a43351F2D33E83Db22576F535c85C74"
    assert VALIDATION_REGISTRY_ADDRESS == "0x802DE575B528453C8208d5201e27464d63970e2b"
    assert DEFAULT_CHAIN_ID == 10143

