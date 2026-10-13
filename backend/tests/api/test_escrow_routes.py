import time
import pytest
from unittest.mock import MagicMock
from fastapi.testclient import TestClient
from web3 import Web3

from app.main import app
from app.api.dependencies import (
    get_escrow_adapter,
    get_evidence_adapter,
    get_trust_engine,
    get_identity_adapter
)
from app.trust.blockchain.escrow_adapter import EscrowAdapter
from app.trust.blockchain.identity_adapter import IdentityAdapter
from app.trust.blockchain.evidence_adapter import UnifiedEvidenceAdapter, AgentEvidence
from app.trust.blockchain.errors import (
    EscrowNotConfiguredError,
    JobNotFoundError,
    InvalidDataError,
    AgentNotFoundError,
    RPCError,
    ContractError
)
from app.trust.engine import TrustEngine

client = TestClient(app)

DUMMY_ESCROW_ADDRESS = "0x1234567890123456789012345678901234567890"
SAMPLE_JOB_ID = "0x" + "aa" * 32
SAMPLE_VALIDATOR = "0x2222222222222222222222222222222222222222"


def sample_job_dict(status: str = "CREATED", status_code: int = 1, settled: bool = False, is_terminal: bool = False):
    return {
        "job_id": SAMPLE_JOB_ID.lower(),
        "client_agent_id": 1,
        "client": "0x1111111111111111111111111111111111111111",
        "provider_agent_id": 2,
        "validator_address": SAMPLE_VALIDATOR,
        "reward_amount_wei": str(10**18),
        "reward_amount_mon": 1.0,
        "validator_fee_bps": 500,
        "validator_fee_percent": 5.0,
        "min_acceptance_score": 75,
        "acceptance_deadline": 1800000000,
        "submission_deadline": 1800003600,
        "validation_deadline": 1800007200,
        "task_hash": "0x" + "bb" * 32,
        "prehire_trust_snapshot_hash": "0x" + "cc" * 32,
        "status": status,
        "status_code": status_code,
        "is_terminal": is_terminal,
        "settled": settled,
        "submission_hash": "0x" + "dd" * 32,
        "submission_uri": "ipfs://sample",
        "submission_timestamp": 1800001000,
        "validation_request_hash": "0x" + "ee" * 32,
        "failure_timestamp": 0,
        "challenge_deadline": 0,
        "dispute_timestamp": 0,
        "designated_arbiter": "0x9999999999999999999999999999999999999999"
    }


# =====================================================================
# GET /escrow/jobs/{job_id} Tests
# =====================================================================

def test_get_escrow_job_success():
    mock_adapter = MagicMock(spec=EscrowAdapter)
    mock_adapter.get_job.return_value = sample_job_dict("CREATED", 1, False, False)
    app.dependency_overrides[get_escrow_adapter] = lambda: mock_adapter

    try:
        response = client.get(f"/escrow/jobs/{SAMPLE_JOB_ID}")
        assert response.status_code == 200
        data = response.json()
        assert data["job_id"] == SAMPLE_JOB_ID.lower()
        assert data["client_agent_id"] == 1
        assert data["status"] == "CREATED"
        assert data["status_code"] == 1
        assert data["is_terminal"] is False
        assert data["settled"] is False
        assert data["reward_amount_mon"] == 1.0
    finally:
        app.dependency_overrides.pop(get_escrow_adapter, None)


def test_get_escrow_job_refunded_terminal_state():
    mock_adapter = MagicMock(spec=EscrowAdapter)
    mock_adapter.get_job.return_value = sample_job_dict("REFUNDED", 12, True, True)
    app.dependency_overrides[get_escrow_adapter] = lambda: mock_adapter

    try:
        response = client.get(f"/escrow/jobs/{SAMPLE_JOB_ID}")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "REFUNDED"
        assert data["status_code"] == 12
        assert data["is_terminal"] is True
        assert data["settled"] is True
    finally:
        app.dependency_overrides.pop(get_escrow_adapter, None)


def test_get_escrow_job_completed_terminal_state():
    mock_adapter = MagicMock(spec=EscrowAdapter)
    mock_adapter.get_job.return_value = sample_job_dict("COMPLETED", 5, True, True)
    app.dependency_overrides[get_escrow_adapter] = lambda: mock_adapter

    try:
        response = client.get(f"/escrow/jobs/{SAMPLE_JOB_ID}")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "COMPLETED"
        assert data["status_code"] == 5
        assert data["is_terminal"] is True
        assert data["settled"] is True
    finally:
        app.dependency_overrides.pop(get_escrow_adapter, None)


def test_get_escrow_job_failed_validation_non_terminal():
    mock_adapter = MagicMock(spec=EscrowAdapter)
    mock_adapter.get_job.return_value = sample_job_dict("FAILED_VALIDATION", 10, False, False)
    app.dependency_overrides[get_escrow_adapter] = lambda: mock_adapter

    try:
        response = client.get(f"/escrow/jobs/{SAMPLE_JOB_ID}")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "FAILED_VALIDATION"
        assert data["status_code"] == 10
        assert data["is_terminal"] is False
        assert data["settled"] is False
    finally:
        app.dependency_overrides.pop(get_escrow_adapter, None)


def test_get_escrow_job_not_found():
    mock_adapter = MagicMock(spec=EscrowAdapter)
    mock_adapter.get_job.side_effect = JobNotFoundError("Job not found")
    app.dependency_overrides[get_escrow_adapter] = lambda: mock_adapter

    try:
        response = client.get(f"/escrow/jobs/{SAMPLE_JOB_ID}")
        assert response.status_code == 404
        data = response.json()
        assert data["error"]["code"] == "JOB_NOT_FOUND"
    finally:
        app.dependency_overrides.pop(get_escrow_adapter, None)


def test_get_escrow_job_unconfigured():
    mock_adapter = MagicMock(spec=EscrowAdapter)
    mock_adapter.get_job.side_effect = EscrowNotConfiguredError("Escrow contract not configured")
    app.dependency_overrides[get_escrow_adapter] = lambda: mock_adapter

    try:
        response = client.get(f"/escrow/jobs/{SAMPLE_JOB_ID}")
        assert response.status_code == 503
        data = response.json()
        assert data["error"]["code"] == "ESCROW_NOT_CONFIGURED"
    finally:
        app.dependency_overrides.pop(get_escrow_adapter, None)


def test_get_escrow_job_rpc_error():
    mock_adapter = MagicMock(spec=EscrowAdapter)
    mock_adapter.get_job.side_effect = RPCError("RPC node timeout")
    app.dependency_overrides[get_escrow_adapter] = lambda: mock_adapter

    try:
        response = client.get(f"/escrow/jobs/{SAMPLE_JOB_ID}")
        assert response.status_code == 502
        data = response.json()
        assert data["error"]["code"] == "RPC_ERROR"
    finally:
        app.dependency_overrides.pop(get_escrow_adapter, None)


def test_get_escrow_job_contract_error():
    mock_adapter = MagicMock(spec=EscrowAdapter)
    mock_adapter.get_job.side_effect = ContractError("Execution reverted")
    app.dependency_overrides[get_escrow_adapter] = lambda: mock_adapter

    try:
        response = client.get(f"/escrow/jobs/{SAMPLE_JOB_ID}")
        assert response.status_code == 502
        data = response.json()
        assert data["error"]["code"] == "CONTRACT_ERROR"
    finally:
        app.dependency_overrides.pop(get_escrow_adapter, None)


def test_get_escrow_job_invalid_id():
    mock_adapter = MagicMock(spec=EscrowAdapter)
    mock_adapter.get_job.side_effect = InvalidDataError("Job ID must be 32 bytes")
    app.dependency_overrides[get_escrow_adapter] = lambda: mock_adapter

    try:
        response = client.get("/escrow/jobs/0xinvalid123")
        assert response.status_code == 400
        data = response.json()
        assert data["error"]["code"] == "INVALID_REQUEST"
    finally:
        app.dependency_overrides.pop(get_escrow_adapter, None)


# =====================================================================
# GET /escrow/validators/{validator_address}/fees Tests
# =====================================================================

def test_get_validator_fees_success():
    mock_adapter = MagicMock(spec=EscrowAdapter)
    mock_adapter.get_pending_validator_fees.return_value = 50000000000000000  # 0.05 MON
    mock_adapter.get_total_pending_validator_fees.return_value = 200000000000000000  # 0.2 MON
    app.dependency_overrides[get_escrow_adapter] = lambda: mock_adapter

    try:
        response = client.get(f"/escrow/validators/{SAMPLE_VALIDATOR}/fees")
        assert response.status_code == 200
        data = response.json()
        assert data["validator_address"] == Web3.to_checksum_address(SAMPLE_VALIDATOR)
        assert data["pending_fee_wei"] == "50000000000000000"
        assert data["pending_fee_mon"] == 0.05
        assert data["total_pending_fee_wei"] == "200000000000000000"
        assert data["total_pending_fee_mon"] == 0.2
    finally:
        app.dependency_overrides.pop(get_escrow_adapter, None)


def test_get_validator_fees_invalid_address():
    mock_adapter = MagicMock(spec=EscrowAdapter)
    app.dependency_overrides[get_escrow_adapter] = lambda: mock_adapter

    try:
        response = client.get("/escrow/validators/not-an-address/fees")
        assert response.status_code == 400
        data = response.json()
        assert data["error"]["code"] == "INVALID_REQUEST"
    finally:
        app.dependency_overrides.pop(get_escrow_adapter, None)


def test_get_validator_fees_unconfigured():
    mock_adapter = MagicMock(spec=EscrowAdapter)
    mock_adapter.get_pending_validator_fees.side_effect = EscrowNotConfiguredError("Escrow not configured")
    app.dependency_overrides[get_escrow_adapter] = lambda: mock_adapter

    try:
        response = client.get(f"/escrow/validators/{SAMPLE_VALIDATOR}/fees")
        assert response.status_code == 503
        data = response.json()
        assert data["error"]["code"] == "ESCROW_NOT_CONFIGURED"
    finally:
        app.dependency_overrides.pop(get_escrow_adapter, None)


# =====================================================================
# POST /escrow/jobs/prepare Tests
# =====================================================================

def test_prepare_job_parameters_success():
    mock_adapter = MagicMock(spec=EscrowAdapter)
    mock_adapter.address = DUMMY_ESCROW_ADDRESS
    app.dependency_overrides[get_escrow_adapter] = lambda: mock_adapter

    mock_identity = MagicMock(spec=IdentityAdapter)
    mock_identity.get_agent_owner.return_value = "0x1111111111111111111111111111111111111111"
    app.dependency_overrides[get_identity_adapter] = lambda: mock_identity

    now = int(time.time())
    payload = {
        "client_agent_id": 1,
        "provider_agent_id": 2,
        "validator_address": SAMPLE_VALIDATOR,
        "reward_amount_wei": "1000000000000000000",
        "validator_fee_bps": 500,
        "min_acceptance_score": 75,
        "acceptance_deadline": now + 3600,
        "submission_deadline": now + 7200,
        "validation_deadline": now + 10800,
        "task_description": "Smart contract security audit of ERC-20 token.",
        "prehire_trust_snapshot_hash": None,
        "arbiter_override": None
    }

    try:
        response = client.post("/escrow/jobs/prepare", json=payload)
        assert response.status_code == 200
        data = response.json()

        assert data["job_id"].startswith("0x")
        assert len(data["job_id"]) == 66
        assert data["client_agent_id"] == 1
        assert data["provider_agent_id"] == 2
        assert data["validator_address"] == Web3.to_checksum_address(SAMPLE_VALIDATOR)
        assert data["reward_amount_wei"] == "1000000000000000000"
        assert data["reward_amount_mon"] == 1.0
        assert data["validator_fee_bps"] == 500
        assert data["validator_fee_percent"] == 5.0
        assert data["task_hash"].startswith("0x")
        assert len(data["task_hash"]) == 66
        assert data["prehire_trust_snapshot_hash"].startswith("0x")

        # AUDIT-01: Exact serialized JSON key check
        assert "prehire_trust_snapshot_hash" in data
        assert "prehire_trust_snapshotHash" not in data
        assert "prehireTrustSnapshotHash" not in data

        # AUDIT-05: Identity preflight verified
        assert data["preflight_identity_verified"] is True

        # Invariant: backend NEVER broadcasts transactions
        assert data["broadcast"] is False
        assert "transaction_parameters" in data
        assert data["transaction_parameters"]["function"] == "createJob"
        assert data["transaction_parameters"]["value"] == "1000000000000000000"
    finally:
        app.dependency_overrides.pop(get_escrow_adapter, None)
        app.dependency_overrides.pop(get_identity_adapter, None)


def test_prepare_job_rejects_self_hire():
    now = int(time.time())
    payload = {
        "client_agent_id": 1,
        "provider_agent_id": 1,  # Same agent ID
        "validator_address": SAMPLE_VALIDATOR,
        "reward_amount_wei": "1000000000000000000",
        "validator_fee_bps": 500,
        "min_acceptance_score": 75,
        "acceptance_deadline": now + 3600,
        "submission_deadline": now + 7200,
        "validation_deadline": now + 10800,
        "task_description": "Self-hiring test."
    }

    response = client.post("/escrow/jobs/prepare", json=payload)
    assert response.status_code == 400
    data = response.json()
    assert data["error"]["code"] == "INVALID_REQUEST"
    assert "cannot hire self" in data["error"]["message"].lower()


def test_prepare_job_rejects_fee_exceeding_5000_bps():
    now = int(time.time())
    payload = {
        "client_agent_id": 1,
        "provider_agent_id": 2,
        "validator_address": SAMPLE_VALIDATOR,
        "reward_amount_wei": "1000000000000000000",
        "validator_fee_bps": 5001,  # Exceeds 50% max fee
        "min_acceptance_score": 75,
        "acceptance_deadline": now + 3600,
        "submission_deadline": now + 7200,
        "validation_deadline": now + 10800,
        "task_description": "Exceeding fee test."
    }

    response = client.post("/escrow/jobs/prepare", json=payload)
    assert response.status_code in (400, 422)


def test_prepare_job_rejects_invalid_deadline_ordering():
    now = int(time.time())
    # Case: submission deadline before acceptance deadline
    payload = {
        "client_agent_id": 1,
        "provider_agent_id": 2,
        "validator_address": SAMPLE_VALIDATOR,
        "reward_amount_wei": "1000000000000000000",
        "validator_fee_bps": 500,
        "min_acceptance_score": 75,
        "acceptance_deadline": now + 7200,
        "submission_deadline": now + 3600,  # Invalid: earlier than acceptance
        "validation_deadline": now + 10800,
        "task_description": "Deadline test."
    }

    response = client.post("/escrow/jobs/prepare", json=payload)
    assert response.status_code == 400
    data = response.json()
    assert data["error"]["code"] == "INVALID_REQUEST"
    assert "submission deadline" in data["error"]["message"].lower()


def test_prepare_job_rejects_past_acceptance_deadline():
    now = int(time.time())
    payload = {
        "client_agent_id": 1,
        "provider_agent_id": 2,
        "validator_address": SAMPLE_VALIDATOR,
        "reward_amount_wei": "1000000000000000000",
        "validator_fee_bps": 500,
        "min_acceptance_score": 75,
        "acceptance_deadline": now - 3600,  # In the past
        "submission_deadline": now + 3600,
        "validation_deadline": now + 7200,
        "task_description": "Past deadline test."
    }

    response = client.post("/escrow/jobs/prepare", json=payload)
    assert response.status_code == 400
    data = response.json()
    assert data["error"]["code"] == "INVALID_REQUEST"
    assert "in the future" in data["error"]["message"].lower()


def test_prepare_job_rejects_zero_validator_address():
    now = int(time.time())
    payload = {
        "client_agent_id": 1,
        "provider_agent_id": 2,
        "validator_address": "0x0000000000000000000000000000000000000000",
        "reward_amount_wei": "1000000000000000000",
        "validator_fee_bps": 500,
        "min_acceptance_score": 75,
        "acceptance_deadline": now + 3600,
        "submission_deadline": now + 7200,
        "validation_deadline": now + 10800,
        "task_description": "Zero validator test."
    }

    response = client.post("/escrow/jobs/prepare", json=payload)
    assert response.status_code == 400
    data = response.json()
    assert data["error"]["code"] == "INVALID_REQUEST"


# =====================================================================
# Regression Compatibility Tests
# =====================================================================

def test_regression_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_regression_agent_discovery():
    from app.api.dependencies import get_discovery_adapter
    mock_discovery = MagicMock()
    mock_discovery.discover_registered_ids.return_value = [1]
    raw_profile = {
        "agent_id": 1,
        "owner": "0x1111111111111111111111111111111111111111",
        "wallet": "0x1111111111111111111111111111111111111111",
        "uri": "ipfs://test",
        "capabilities": ["audit"],
        "domain": "security",
        "endpoint": "https://agent1.aegis",
        "endpoint_verified": True,
        "wallet_verified": True,
        "metadata_completeness": 100.0,
        "identity_status": "AVAILABLE"
    }
    mock_discovery.get_agent_raw_profile.return_value = raw_profile
    mock_discovery.get_agent_profile.return_value = raw_profile
    app.dependency_overrides[get_discovery_adapter] = lambda: mock_discovery


    try:
        response = client.get("/agents?limit=10&offset=0")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert len(data["agents"]) == 1
        assert data["agents"][0]["agent_id"] == 1
    finally:
        app.dependency_overrides.pop(get_discovery_adapter, None)


# =====================================================================
# Phase 5.3.2.2.2 Audit Hardening Regression Tests (AUDIT-01 to AUDIT-05)
# =====================================================================

def test_audit_01_schema_consistency_serialized_key():
    """
    AUDIT-01: Asserts exact serialized JSON key is 'prehire_trust_snapshot_hash'
    in both GET /escrow/jobs/{job_id} and POST /escrow/jobs/prepare.
    """
    mock_adapter = MagicMock(spec=EscrowAdapter)
    mock_adapter.get_job.return_value = sample_job_dict()
    app.dependency_overrides[get_escrow_adapter] = lambda: mock_adapter

    try:
        # 1. GET /escrow/jobs/{job_id}
        resp = client.get(f"/escrow/jobs/{SAMPLE_JOB_ID}")
        assert resp.status_code == 200
        data = resp.json()
        assert "prehire_trust_snapshot_hash" in data
        assert "prehire_trust_snapshotHash" not in data
        assert "prehireTrustSnapshotHash" not in data
        assert data["prehire_trust_snapshot_hash"] == "0x" + "cc" * 32
    finally:
        app.dependency_overrides.pop(get_escrow_adapter, None)

    # 2. POST /escrow/jobs/prepare accepts camelCase alias and serializes snake_case
    mock_escrow = MagicMock(spec=EscrowAdapter)
    mock_escrow.address = DUMMY_ESCROW_ADDRESS
    app.dependency_overrides[get_escrow_adapter] = lambda: mock_escrow

    mock_identity = MagicMock(spec=IdentityAdapter)
    mock_identity.get_agent_owner.return_value = "0x1111111111111111111111111111111111111111"
    app.dependency_overrides[get_identity_adapter] = lambda: mock_identity

    now = int(time.time())
    custom_hash = "0x" + "44" * 32
    payload = {
        "client_agent_id": 1,
        "provider_agent_id": 2,
        "validator_address": SAMPLE_VALIDATOR,
        "reward_amount_wei": "1000000000000000000",
        "validator_fee_bps": 500,
        "min_acceptance_score": 75,
        "acceptance_deadline": now + 3600,
        "submission_deadline": now + 7200,
        "validation_deadline": now + 10800,
        "task_description": "Audit testing payload.",
        "prehireTrustSnapshotHash": custom_hash
    }

    try:
        resp = client.post("/escrow/jobs/prepare", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert "prehire_trust_snapshot_hash" in data
        assert "prehire_trust_snapshotHash" not in data
        assert "prehireTrustSnapshotHash" not in data
        assert data["prehire_trust_snapshot_hash"] == custom_hash
    finally:
        app.dependency_overrides.pop(get_escrow_adapter, None)
        app.dependency_overrides.pop(get_identity_adapter, None)


def test_audit_02_monetary_precision_one_mon_plus_one_wei():
    """
    AUDIT-02: Asserts authoritative wei representation remains exact for 1 MON + 1 wei
    without IEEE-754 precision loss in transaction value.
    """
    mock_escrow = MagicMock(spec=EscrowAdapter)
    mock_escrow.address = DUMMY_ESCROW_ADDRESS
    app.dependency_overrides[get_escrow_adapter] = lambda: mock_escrow

    mock_identity = MagicMock(spec=IdentityAdapter)
    mock_identity.get_agent_owner.return_value = "0x1111111111111111111111111111111111111111"
    app.dependency_overrides[get_identity_adapter] = lambda: mock_identity

    now = int(time.time())
    one_mon_plus_one_wei = "1000000000000000001"
    payload = {
        "client_agent_id": 1,
        "provider_agent_id": 2,
        "validator_address": SAMPLE_VALIDATOR,
        "reward_amount_wei": one_mon_plus_one_wei,
        "validator_fee_bps": 500,
        "min_acceptance_score": 75,
        "acceptance_deadline": now + 3600,
        "submission_deadline": now + 7200,
        "validation_deadline": now + 10800,
        "task_description": "Monetary precision check."
    }

    try:
        resp = client.post("/escrow/jobs/prepare", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        # Authoritative wei string is exactly preserved
        assert data["reward_amount_wei"] == one_mon_plus_one_wei
        assert data["transaction_parameters"]["value"] == one_mon_plus_one_wei
        # Approximate display-only MON remains float
        assert data["reward_amount_mon"] == 1.0
    finally:
        app.dependency_overrides.pop(get_escrow_adapter, None)
        app.dependency_overrides.pop(get_identity_adapter, None)


@pytest.mark.parametrize("invalid_payload,expected_status", [
    ({"client_agent_id": -1}, 422),
    ({"client_agent_id": 2**256}, 422),
    ({"provider_agent_id": -1}, 422),
    ({"provider_agent_id": 2**256}, 422),
    ({"validator_address": "0x123"}, 400),
    ({"validator_address": "0x" + "gg" * 20}, 400),
    ({"task_hash": "0x1234"}, 400),
    ({"task_hash": "0x" + "zz" * 32}, 400),
    ({"job_id": "0xshort"}, 400),
    ({"job_id": "0x" + "zz" * 32}, 400),
])
def test_audit_03_structured_encoding_bounds_and_error_mapping(invalid_payload, expected_status):
    """
    AUDIT-03: Asserts out-of-range uint256 inputs, negative IDs, malformed hashes,
    and invalid addresses map to structured HTTP 400 or 422 responses.
    """
    mock_escrow = MagicMock(spec=EscrowAdapter)
    mock_escrow.address = DUMMY_ESCROW_ADDRESS
    app.dependency_overrides[get_escrow_adapter] = lambda: mock_escrow

    mock_identity = MagicMock(spec=IdentityAdapter)
    mock_identity.get_agent_owner.return_value = "0x1111111111111111111111111111111111111111"
    app.dependency_overrides[get_identity_adapter] = lambda: mock_identity

    now = int(time.time())
    base_payload = {
        "client_agent_id": 1,
        "provider_agent_id": 2,
        "validator_address": SAMPLE_VALIDATOR,
        "reward_amount_wei": "1000000000000000000",
        "validator_fee_bps": 500,
        "min_acceptance_score": 75,
        "acceptance_deadline": now + 3600,
        "submission_deadline": now + 7200,
        "validation_deadline": now + 10800,
        "task_description": "Bounds check."
    }
    base_payload.update(invalid_payload)

    try:
        resp = client.post("/escrow/jobs/prepare", json=base_payload)
        assert resp.status_code == expected_status
        data = resp.json()
        assert "error" in data or "detail" in data
    finally:
        app.dependency_overrides.pop(get_escrow_adapter, None)
        app.dependency_overrides.pop(get_identity_adapter, None)


def test_audit_04_job_id_uniqueness_and_repeat_jobs():
    """
    AUDIT-04: Proves repeated jobs with identical terms can be distinguished
    via nonce-augmented derivation or explicit job_id override without modifying
    the Solidity contract interface.
    """
    mock_escrow = MagicMock(spec=EscrowAdapter)
    mock_escrow.address = DUMMY_ESCROW_ADDRESS
    app.dependency_overrides[get_escrow_adapter] = lambda: mock_escrow

    mock_identity = MagicMock(spec=IdentityAdapter)
    mock_identity.get_agent_owner.return_value = "0x1111111111111111111111111111111111111111"
    app.dependency_overrides[get_identity_adapter] = lambda: mock_identity

    now = int(time.time())
    base_payload = {
        "client_agent_id": 1,
        "provider_agent_id": 2,
        "validator_address": SAMPLE_VALIDATOR,
        "reward_amount_wei": "1000000000000000000",
        "validator_fee_bps": 500,
        "min_acceptance_score": 75,
        "acceptance_deadline": now + 3600,
        "submission_deadline": now + 7200,
        "validation_deadline": now + 10800,
        "task_description": "Repeat job audit test."
    }

    try:
        # Call 1 with nonce=0
        payload_0 = dict(base_payload, nonce=0)
        resp_0 = client.post("/escrow/jobs/prepare", json=payload_0)
        assert resp_0.status_code == 200
        job_id_0 = resp_0.json()["job_id"]

        # Call 2 with nonce=1
        payload_1 = dict(base_payload, nonce=1)
        resp_1 = client.post("/escrow/jobs/prepare", json=payload_1)
        assert resp_1.status_code == 200
        job_id_1 = resp_1.json()["job_id"]

        # Deterministic distinction:
        assert job_id_0 != job_id_1
        assert resp_0.json()["nonce"] == 0
        assert resp_1.json()["nonce"] == 1

        # Re-calling nonce=0 yields identical job_id (deterministic):
        resp_0_repeat = client.post("/escrow/jobs/prepare", json=payload_0)
        assert resp_0_repeat.json()["job_id"] == job_id_0

        # Explicit job_id override
        explicit_id = "0x" + "88" * 32
        payload_explicit = dict(base_payload, job_id=explicit_id)
        resp_explicit = client.post("/escrow/jobs/prepare", json=payload_explicit)
        assert resp_explicit.status_code == 200
        assert resp_explicit.json()["job_id"] == explicit_id
        assert resp_explicit.json()["transaction_parameters"]["args"]["jobId"] == explicit_id
    finally:
        app.dependency_overrides.pop(get_escrow_adapter, None)
        app.dependency_overrides.pop(get_identity_adapter, None)


def test_audit_05_agent_identity_preflight_variations():
    """
    AUDIT-05: Tests agent identity preflight under all conditions:
    1. Agent not found in Identity Registry -> HTTP 400
    2. RPC outage -> HTTP 200 with preflight_identity_verified=None
    3. Both agents verified -> HTTP 200 with preflight_identity_verified=True
    """
    mock_escrow = MagicMock(spec=EscrowAdapter)
    mock_escrow.address = DUMMY_ESCROW_ADDRESS
    app.dependency_overrides[get_escrow_adapter] = lambda: mock_escrow

    now = int(time.time())
    payload = {
        "client_agent_id": 1,
        "provider_agent_id": 2,
        "validator_address": SAMPLE_VALIDATOR,
        "reward_amount_wei": "1000000000000000000",
        "validator_fee_bps": 500,
        "min_acceptance_score": 75,
        "acceptance_deadline": now + 3600,
        "submission_deadline": now + 7200,
        "validation_deadline": now + 10800,
        "task_description": "Identity preflight test."
    }

    try:
        # Case 1: Agent nonexistent in Identity Registry -> HTTP 400
        mock_identity_not_found = MagicMock(spec=IdentityAdapter)
        mock_identity_not_found.get_agent_owner.side_effect = AgentNotFoundError("Provider agent 2 does not exist in Identity Registry.")
        app.dependency_overrides[get_identity_adapter] = lambda: mock_identity_not_found

        resp_not_found = client.post("/escrow/jobs/prepare", json=payload)
        assert resp_not_found.status_code == 400
        data_not_found = resp_not_found.json()
        assert data_not_found["error"]["code"] == "INVALID_REQUEST"
        assert "does not exist in Identity Registry" in data_not_found["error"]["message"]

        # Case 2: RPC outage -> HTTP 200, preflight_identity_verified=None, does not block
        mock_identity_rpc_err = MagicMock(spec=IdentityAdapter)
        mock_identity_rpc_err.get_agent_owner.side_effect = RPCError("RPC connection timeout")
        app.dependency_overrides[get_identity_adapter] = lambda: mock_identity_rpc_err

        resp_rpc = client.post("/escrow/jobs/prepare", json=payload)
        assert resp_rpc.status_code == 200
        data_rpc = resp_rpc.json()
        assert data_rpc["preflight_identity_verified"] is None
        assert "Blockchain RPC was unavailable during pre-flight" in data_rpc["instructions"]

        # Case 3: Identity preflight succeeds -> HTTP 200, preflight_identity_verified=True
        mock_identity_ok = MagicMock(spec=IdentityAdapter)
        mock_identity_ok.get_agent_owner.return_value = "0x1111111111111111111111111111111111111111"
        app.dependency_overrides[get_identity_adapter] = lambda: mock_identity_ok

        resp_ok = client.post("/escrow/jobs/prepare", json=payload)
        assert resp_ok.status_code == 200
        data_ok = resp_ok.json()
        assert data_ok["preflight_identity_verified"] is True
    finally:
        app.dependency_overrides.pop(get_escrow_adapter, None)
        app.dependency_overrides.pop(get_identity_adapter, None)


def test_audit_cross_layer_job_id_derivation_parity():
    """
    Phase 5.3.2.3.1 Audit 1:
    Asserts exact test vector parity between backend Web3.solidity_keccak
    and frontend deriveJobId across canonical, nonce=0, and nonce=1 schemas.
    """
    mock_escrow = MagicMock(spec=EscrowAdapter)
    mock_escrow.address = DUMMY_ESCROW_ADDRESS
    app.dependency_overrides[get_escrow_adapter] = lambda: mock_escrow

    mock_identity = MagicMock(spec=IdentityAdapter)
    mock_identity.get_agent_owner.return_value = "0x1111111111111111111111111111111111111111"
    app.dependency_overrides[get_identity_adapter] = lambda: mock_identity

    task_hash = "0x" + "bb" * 32
    acceptance_deadline = 1800000000
    submission_deadline = 1800003600
    validation_deadline = 1800007200

    base_payload = {
        "client_agent_id": 1,
        "provider_agent_id": 2,
        "validator_address": SAMPLE_VALIDATOR,
        "reward_amount_wei": "1000000000000000000",
        "validator_fee_bps": 500,
        "min_acceptance_score": 75,
        "acceptance_deadline": acceptance_deadline,
        "submission_deadline": submission_deadline,
        "validation_deadline": validation_deadline,
        "task_hash": task_hash,
    }

    try:
        # Canonical without nonce
        resp_canonical = client.post("/escrow/jobs/prepare", json=base_payload)
        assert resp_canonical.status_code == 200
        assert resp_canonical.json()["job_id"] == "0x7966c0727a02c75f6c784fd2f48ba1607243bcc6c83d24ebeacd4d1f23aaa173"

        # Nonce = 0
        resp_nonce0 = client.post("/escrow/jobs/prepare", json=dict(base_payload, nonce=0))
        assert resp_nonce0.status_code == 200
        assert resp_nonce0.json()["job_id"] == "0x874e28a56e56555fa53cc2c056031ee6cb0689375d34f25329a05b63f35792d3"

        # Nonce = 1
        resp_nonce1 = client.post("/escrow/jobs/prepare", json=dict(base_payload, nonce=1))
        assert resp_nonce1.status_code == 200
        assert resp_nonce1.json()["job_id"] == "0xa72b432d4c159d82f29d5ba2f84123cbd7cabf1e683643faabe96865c457e2d6"
    finally:
        app.dependency_overrides.pop(get_escrow_adapter, None)
        app.dependency_overrides.pop(get_identity_adapter, None)
