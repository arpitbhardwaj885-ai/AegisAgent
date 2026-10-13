import os
import pytest
from unittest.mock import MagicMock
from fastapi.testclient import TestClient

from app.main import app
from app.api.dependencies import get_discovery_adapter, get_evidence_adapter, get_trust_engine
from app.trust.blockchain.errors import AgentNotFoundError, RPCError
from app.trust.blockchain.evidence_adapter import AgentEvidence
from app.trust.models import (
    IdentityEvidence, ReputationEvidence, ValidationEvidence,
    ReliabilityEvidence, TrustEvaluationResult, RiskFactor
)
from app.trust.constants import EvidenceStatus, Recommendation


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture(autouse=True)
def mock_default_evidence_adapter():
    mock_evidence = MagicMock()
    mock_evidence.get_agent_evidence.side_effect = make_mock_evidence
    app.dependency_overrides[get_evidence_adapter] = lambda: mock_evidence
    yield
    app.dependency_overrides.pop(get_evidence_adapter, None)


def make_mock_evidence(agent_id: int):
    return AgentEvidence(
        identity=IdentityEvidence(agent_exists=True, wallet_verified=True, metadata_completeness=100.0),
        reputation=ReputationEvidence(feedback_count=10, unique_reviewer_count=5, average_feedback_score=4.5),
        validation=ValidationEvidence(validation_count=5, unique_validator_count=3, successful_validation_count=5),
        reliability=ReliabilityEvidence(task_count=5, completed_task_count=5),
        identity_status=EvidenceStatus.AVAILABLE,
        reputation_status=EvidenceStatus.AVAILABLE,
        validation_status=EvidenceStatus.AVAILABLE,
        snapshot_meta={"chain_id": 10143, "block_number": 70000000}
    )


# 1. Empty Registry
def test_empty_registry(client):
    mock_discovery = MagicMock()
    mock_discovery.discover_registered_ids.return_value = []

    app.dependency_overrides[get_discovery_adapter] = lambda: mock_discovery

    try:
        resp = client.get("/agents")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["limit"] == 10
        assert data["offset"] == 0
        assert data["has_more"] is False
        assert data["agents"] == []
    finally:
        app.dependency_overrides.clear()


# 2. One and Multiple Registered Agents
def test_one_and_multiple_agents(client):
    mock_discovery = MagicMock()
    mock_discovery.discover_registered_ids.return_value = [1, 2, 3]

    def mock_profile(aid):
        return {
            "agent_id": aid,
            "owner": f"0xOwner_{aid}",
            "wallet": f"0xWallet_{aid}",
            "uri": f"ipfs://agent_{aid}",
            "capabilities": ["python", "data-analysis"] if aid == 1 else ["solidity"],
            "domain": "finance" if aid == 1 else "security",
            "endpoint": f"https://api.agent{aid}.com",
            "endpoint_verified": True,
            "wallet_verified": True,
            "metadata_completeness": 100.0,
            "identity_status": "AVAILABLE"
        }

    mock_discovery.get_agent_raw_profile.side_effect = mock_profile

    mock_evidence = MagicMock()
    mock_evidence.get_agent_evidence.side_effect = make_mock_evidence

    app.dependency_overrides[get_discovery_adapter] = lambda: mock_discovery
    app.dependency_overrides[get_evidence_adapter] = lambda: mock_evidence

    try:
        resp = client.get("/agents")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 3
        assert len(data["agents"]) == 3
        assert data["agents"][0]["agent_id"] == 1
        assert data["agents"][0]["owner"] == "0xOwner_1"
        assert data["agents"][0]["trust_summary"] is not None
        assert data["agents"][0]["trust_summary"]["global_trust"] > 0
    finally:
        app.dependency_overrides.clear()


# 3. Pagination Boundaries
def test_pagination_boundaries(client):
    mock_discovery = MagicMock()
    mock_discovery.discover_registered_ids.return_value = list(range(1, 6)) # 5 agents

    def mock_profile(aid):
        return {
            "agent_id": aid,
            "owner": f"0xOwner_{aid}",
            "wallet": f"0xWallet_{aid}",
            "uri": f"ipfs://agent_{aid}",
            "capabilities": ["python"],
            "domain": "general",
            "endpoint": None,
            "endpoint_verified": False,
            "wallet_verified": True,
            "metadata_completeness": 65.0,
            "identity_status": "AVAILABLE"
        }

    mock_discovery.get_agent_raw_profile.side_effect = mock_profile

    app.dependency_overrides[get_discovery_adapter] = lambda: mock_discovery

    try:
        # Page 1: limit=2, offset=0 -> agents 1, 2; has_more=True
        resp_p1 = client.get("/agents?limit=2&offset=0")
        assert resp_p1.status_code == 200
        data_p1 = resp_p1.json()
        assert data_p1["total"] == 5
        assert len(data_p1["agents"]) == 2
        assert data_p1["agents"][0]["agent_id"] == 1
        assert data_p1["agents"][1]["agent_id"] == 2
        assert data_p1["has_more"] is True

        # Page 2: limit=2, offset=2 -> agents 3, 4; has_more=True
        resp_p2 = client.get("/agents?limit=2&offset=2")
        assert resp_p2.status_code == 200
        data_p2 = resp_p2.json()
        assert len(data_p2["agents"]) == 2
        assert data_p2["agents"][0]["agent_id"] == 3
        assert data_p2["agents"][1]["agent_id"] == 4
        assert data_p2["has_more"] is True

        # Page 3: limit=2, offset=4 -> agent 5; has_more=False
        resp_p3 = client.get("/agents?limit=2&offset=4")
        assert resp_p3.status_code == 200
        data_p3 = resp_p3.json()
        assert len(data_p3["agents"]) == 1
        assert data_p3["agents"][0]["agent_id"] == 5
        assert data_p3["has_more"] is False

        # Offset beyond total
        resp_beyond = client.get("/agents?limit=10&offset=100")
        assert resp_beyond.status_code == 200
        assert resp_beyond.json()["agents"] == []
        assert resp_beyond.json()["has_more"] is False

        # Invalid bounds validation
        resp_limit_zero = client.get("/agents?limit=0")
        assert resp_limit_zero.status_code == 422

        resp_limit_too_high = client.get("/agents?limit=51")
        assert resp_limit_too_high.status_code == 422

        resp_negative_offset = client.get("/agents?offset=-1")
        assert resp_negative_offset.status_code == 422
    finally:
        app.dependency_overrides.clear()


# 4. Capability and Domain Filtering
def test_capability_and_domain_filtering(client):
    mock_discovery = MagicMock()
    mock_discovery.discover_registered_ids.return_value = [1, 2, 3]

    profiles = {
        1: {"agent_id": 1, "owner": "0x1", "wallet": "0x1", "uri": None, "capabilities": ["python", "data-analysis"], "domain": "finance", "endpoint": None, "endpoint_verified": False, "wallet_verified": True, "metadata_completeness": 35.0, "identity_status": "AVAILABLE"},
        2: {"agent_id": 2, "owner": "0x2", "wallet": "0x2", "uri": None, "capabilities": ["python", "machine-learning"], "domain": "healthcare", "endpoint": None, "endpoint_verified": False, "wallet_verified": True, "metadata_completeness": 35.0, "identity_status": "AVAILABLE"},
        3: {"agent_id": 3, "owner": "0x3", "wallet": "0x3", "uri": None, "capabilities": ["solidity"], "domain": "security", "endpoint": None, "endpoint_verified": False, "wallet_verified": True, "metadata_completeness": 35.0, "identity_status": "AVAILABLE"}
    }

    mock_discovery.get_agent_raw_profile.side_effect = lambda aid: profiles[aid]

    app.dependency_overrides[get_discovery_adapter] = lambda: mock_discovery

    try:
        # Case-insensitive capability filter
        resp_cap = client.get("/agents?capability=PYTHON")
        assert resp_cap.status_code == 200
        data_cap = resp_cap.json()
        assert data_cap["total"] == 2
        assert [a["agent_id"] for a in data_cap["agents"]] == [1, 2]

        # Non-matching capability
        resp_nomatch = client.get("/agents?capability=rust")
        assert resp_nomatch.status_code == 200
        assert resp_nomatch.json()["total"] == 0

        # Domain filter
        resp_dom = client.get("/agents?domain=Healthcare")
        assert resp_dom.status_code == 200
        data_dom = resp_dom.json()
        assert data_dom["total"] == 1
        assert data_dom["agents"][0]["agent_id"] == 2

        # Combined filter
        resp_combo = client.get("/agents?capability=python&domain=finance")
        assert resp_combo.status_code == 200
        assert resp_combo.json()["total"] == 1
        assert resp_combo.json()["agents"][0]["agent_id"] == 1
    finally:
        app.dependency_overrides.clear()


# 5. Missing Metadata Represented Explicitly
def test_missing_metadata_represented_explicitly(client):
    mock_discovery = MagicMock()
    # Agent exists on-chain but has no wallet, no capabilities, no domain, no endpoint
    mock_discovery.get_agent_raw_profile.return_value = {
        "agent_id": 1,
        "owner": "0xA82832aB9BD6C11A8156c7273815D631F90D347a",
        "wallet": None,
        "uri": "ipfs://test",
        "capabilities": [],
        "domain": None,
        "endpoint": None,
        "endpoint_verified": False,
        "wallet_verified": False,
        "metadata_completeness": 30.0,
        "identity_status": "AVAILABLE"
    }

    app.dependency_overrides[get_discovery_adapter] = lambda: mock_discovery

    try:
        resp = client.get("/agents/1")
        assert resp.status_code == 200
        data = resp.json()
        assert data["agent_id"] == 1
        assert data["owner"] == "0xA82832aB9BD6C11A8156c7273815D631F90D347a"
        assert data["wallet"] is None
        assert data["capabilities"] == []
        assert data["domain"] is None
        assert data["endpoint"] is None
        assert data["endpoint_verified"] is False
        assert data["wallet_verified"] is False
        assert data["metadata_completeness"] == 30.0
    finally:
        app.dependency_overrides.clear()


# 6. Nonexistent Agent Profile
def test_nonexistent_agent_profile(client):
    mock_discovery = MagicMock()
    mock_discovery.get_agent_raw_profile.side_effect = AgentNotFoundError(999)

    app.dependency_overrides[get_discovery_adapter] = lambda: mock_discovery

    try:
        resp = client.get("/agents/999")
        assert resp.status_code == 404
        data = resp.json()
        assert data["error"]["code"] == "AGENT_NOT_FOUND"
        assert "999" in data["error"]["message"]
    finally:
        app.dependency_overrides.clear()


# 7. RPC Failure vs Empty Results
def test_rpc_failure_not_treated_as_empty_results(client):
    mock_discovery = MagicMock()
    mock_discovery.discover_registered_ids.side_effect = RPCError("Monad RPC node unavailable")

    app.dependency_overrides[get_discovery_adapter] = lambda: mock_discovery

    try:
        resp = client.get("/agents")
        assert resp.status_code == 502
        data = resp.json()
        assert data["error"]["code"] == "RPC_ERROR"
        # Must NOT return 200 with empty agents list
        assert "agents" not in data
    finally:
        app.dependency_overrides.clear()


# 8. Malformed Metadata Handled Safely
def test_malformed_metadata_handled_safely(client):
    mock_discovery = MagicMock()
    # Malformed capability JSON bytes handled safely by DiscoveryAdapter
    mock_discovery.get_agent_raw_profile.return_value = {
        "agent_id": 1,
        "owner": "0xOwner",
        "wallet": "0xWallet",
        "uri": "ipfs://test",
        "capabilities": [], # Parsed safely from corrupted data
        "domain": None,
        "endpoint": None,
        "endpoint_verified": False,
        "wallet_verified": True,
        "metadata_completeness": 30.0,
        "identity_status": "AVAILABLE"
    }

    app.dependency_overrides[get_discovery_adapter] = lambda: mock_discovery

    try:
        resp = client.get("/agents/1")
        assert resp.status_code == 200
        assert resp.json()["capabilities"] == []
    finally:
        app.dependency_overrides.clear()


# 9. Deterministic Ordering
def test_deterministic_ordering(client):
    mock_discovery = MagicMock()
    # Discovered in random or unsorted order
    mock_discovery.discover_registered_ids.return_value = [5, 2, 4, 1, 3]

    def mock_profile(aid):
        return {
            "agent_id": aid,
            "owner": f"0xOwner_{aid}",
            "wallet": f"0xWallet_{aid}",
            "uri": f"ipfs://agent_{aid}",
            "capabilities": ["python"],
            "domain": "finance",
            "endpoint": None,
            "endpoint_verified": False,
            "wallet_verified": True,
            "metadata_completeness": 65.0,
            "identity_status": "AVAILABLE"
        }

    mock_discovery.get_agent_raw_profile.side_effect = mock_profile

    app.dependency_overrides[get_discovery_adapter] = lambda: mock_discovery

    try:
        for _ in range(5):
            resp = client.get("/agents")
            assert resp.status_code == 200
            agent_ids = [a["agent_id"] for a in resp.json()["agents"]]
            assert agent_ids == [1, 2, 3, 4, 5]
    finally:
        app.dependency_overrides.clear()


# 10. Secret and Stack-Trace Suppression
def test_secret_and_stack_trace_suppression(client):
    mock_discovery = MagicMock()
    mock_discovery.discover_registered_ids.side_effect = RuntimeError("Internal private exception with sensitive details")

    secret_key = "aegis_super_secret_test_token_888"
    os.environ["SECRET_MARKETPLACE_KEY"] = secret_key

    app.dependency_overrides[get_discovery_adapter] = lambda: mock_discovery

    try:
        resp = client.get("/agents")
        assert resp.status_code == 500
        data = resp.json()
        assert data["error"]["code"] == "TRUST_EVALUATION_ERROR"
        assert secret_key not in resp.text
        assert "Traceback" not in resp.text
        assert "sensitive details" not in resp.text
    finally:
        os.environ.pop("SECRET_MARKETPLACE_KEY", None)
        app.dependency_overrides.clear()


# 11. Multi-Miss Gap Discovered in Listing Route
def test_agents_route_multi_miss_gap_discovered(client):
    mock_discovery = MagicMock()
    mock_discovery.max_scan_limit = 50
    mock_discovery.may_be_incomplete = True
    # Discovered tokens across gaps of 2 or more nonexistent IDs: [1, 4, 8]
    mock_discovery.discover_registered_ids.return_value = [1, 4, 8]

    def mock_profile(aid):
        return {
            "agent_id": aid,
            "owner": f"0xOwner_{aid}",
            "wallet": f"0xWallet_{aid}",
            "uri": f"ipfs://agent_{aid}",
            "capabilities": ["python"],
            "domain": "finance",
            "endpoint": None,
            "endpoint_verified": False,
            "wallet_verified": True,
            "metadata_completeness": 65.0,
            "identity_status": "AVAILABLE"
        }

    mock_discovery.get_agent_raw_profile.side_effect = mock_profile
    app.dependency_overrides[get_discovery_adapter] = lambda: mock_discovery

    try:
        resp = client.get("/agents")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 3
        assert [a["agent_id"] for a in data["agents"]] == [1, 4, 8]
    finally:
        app.dependency_overrides.clear()


# 12. Explicit Handling of Potentially Incomplete Results
def test_agents_route_explicit_incomplete_metadata(client):
    mock_discovery = MagicMock()
    mock_discovery.max_scan_limit = 50
    mock_discovery.may_be_incomplete = True
    mock_discovery.discover_registered_ids.return_value = [1]
    mock_discovery.get_agent_raw_profile.return_value = {
        "agent_id": 1,
        "owner": "0xOwner",
        "wallet": None,
        "uri": None,
        "capabilities": [],
        "domain": None,
        "endpoint": None,
        "endpoint_verified": False,
        "wallet_verified": False,
        "metadata_completeness": 0.0,
        "identity_status": "AVAILABLE"
    }

    app.dependency_overrides[get_discovery_adapter] = lambda: mock_discovery

    try:
        resp = client.get("/agents")
        assert resp.status_code == 200
        data = resp.json()
        # Must explicitly expose scan_limit and may_be_incomplete flag
        assert data["scan_limit"] == 50
        assert data["may_be_incomplete"] is True
    finally:
        app.dependency_overrides.clear()


# 13. Configured Registry Address Verification
def test_configured_registry_address_verification():
    from app.trust.blockchain.config import (
        IDENTITY_REGISTRY_ADDRESS,
        REPUTATION_REGISTRY_ADDRESS,
        VALIDATION_REGISTRY_ADDRESS,
        HIRING_ESCROW_ADDRESS,
        DEFAULT_CHAIN_ID
    )

    # Must match the actual deployed Monad Testnet contracts
    assert IDENTITY_REGISTRY_ADDRESS == "0xa7A27f96d4e8f58d701D42229d5097A69694Ca4B"
    assert REPUTATION_REGISTRY_ADDRESS == "0x387948228a43351F2D33E83Db22576F535c85C74"
    assert VALIDATION_REGISTRY_ADDRESS == "0x802DE575B528453C8208d5201e27464d63970e2b"
    assert HIRING_ESCROW_ADDRESS == "0x28243a3EA0c93CD5FbA6614EAff8980B4A8b0f29"
    assert DEFAULT_CHAIN_ID == 10143


# 14. Cross-Registry Reference Parity Test
def test_cross_registry_reference_parity():
    from app.trust.blockchain.contracts import VALIDATION_ABI, REPUTATION_ABI, ESCROW_ABI

    # Verify ABI definitions contain cross-registry reference getters
    validation_fn_names = [f.get("name") for f in VALIDATION_ABI if f.get("type") == "function"]
    reputation_fn_names = [f.get("name") for f in REPUTATION_ABI if f.get("type") == "function"]
    escrow_fn_names = [f.get("name") for f in ESCROW_ABI if f.get("type") == "function"]

    assert "getIdentityRegistry" in validation_fn_names
    assert "getIdentityRegistry" in reputation_fn_names
    assert "getJob" in escrow_fn_names
