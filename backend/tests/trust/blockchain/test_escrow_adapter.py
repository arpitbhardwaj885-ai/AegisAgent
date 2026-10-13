import pytest
from unittest.mock import MagicMock
from web3 import Web3

from app.trust.blockchain.escrow_adapter import (
    EscrowAdapter,
    JOB_STATUS_MAP,
    TERMINAL_STATUSES
)
from app.trust.blockchain.errors import (
    EscrowNotConfiguredError,
    JobNotFoundError,
    InvalidDataError,
    RPCError,
    ContractError
)
from app.trust.blockchain.provider import Web3Provider


DUMMY_ESCROW_ADDRESS = "0x1234567890123456789012345678901234567890"
ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"
SAMPLE_JOB_ID_HEX = "0x" + "aa" * 32
SAMPLE_TASK_HASH_HEX = "0x" + "bb" * 32
SAMPLE_PREHIRE_HASH_HEX = "0x" + "cc" * 32
SAMPLE_SUB_HASH_HEX = "0x" + "dd" * 32
SAMPLE_REQ_HASH_HEX = "0x" + "ee" * 32


def create_mock_job_tuple(
    status_code: int = 1,
    settled: bool = False,
    job_id_bytes: bytes = b"\xaa" * 32,
    reward_wei: int = 10**18,
    validator_fee_bps: int = 500
):
    return (
        job_id_bytes,
        1,  # clientAgentId
        "0x1111111111111111111111111111111111111111",  # client
        2,  # providerAgentId
        "0x2222222222222222222222222222222222222222",  # validatorAddress
        reward_wei,  # rewardAmount
        validator_fee_bps,  # validatorFeeBps
        75,  # minAcceptanceScore
        1800000000,  # acceptanceDeadline
        1800003600,  # submissionDeadline
        1800007200,  # validationDeadline
        b"\xbb" * 32,  # taskHash
        b"\xcc" * 32,  # prehireTrustSnapshotHash
        status_code,  # status
        settled,  # settled
        b"\xdd" * 32,  # submissionHash
        "ipfs://sample-submission",  # submissionURI
        1800001000,  # submissionTimestamp
        b"\xee" * 32,  # validationRequestHash
        0,  # failureTimestamp
        0,  # challengeDeadline
        0,  # disputeTimestamp
        "0x9999999999999999999999999999999999999999"  # designatedArbiter
    )


def test_escrow_adapter_unconfigured(monkeypatch):
    monkeypatch.setattr("app.trust.blockchain.escrow_adapter.HIRING_ESCROW_ADDRESS", "")
    provider = MagicMock(spec=Web3Provider)
    adapter = EscrowAdapter(provider, address=None)
    assert not adapter.is_configured()

    with pytest.raises(EscrowNotConfiguredError):
        adapter.get_job(SAMPLE_JOB_ID_HEX)

    with pytest.raises(EscrowNotConfiguredError):
        adapter.get_pending_validator_fees("0x2222222222222222222222222222222222222222")

    with pytest.raises(EscrowNotConfiguredError):
        adapter.get_total_pending_validator_fees()

    # Also test explicit empty string address
    adapter_empty = EscrowAdapter(provider, address="")
    assert not adapter_empty.is_configured()


def test_escrow_adapter_configured_from_env():
    provider = MagicMock(spec=Web3Provider)
    mock_contract = MagicMock()
    provider.get_contract.return_value = mock_contract
    adapter = EscrowAdapter(provider)
    # When HIRING_ESCROW_ADDRESS is set in environment, adapter is configured
    assert adapter.is_configured()
    assert adapter.address == "0x28243a3EA0c93CD5FbA6614EAff8980B4A8b0f29"


def test_escrow_adapter_invalid_address():
    provider = MagicMock(spec=Web3Provider)
    with pytest.raises(ContractError):
        EscrowAdapter(provider, address="not-an-eth-address")


def test_escrow_adapter_get_job_success():
    provider = MagicMock(spec=Web3Provider)
    contract_mock = MagicMock()
    provider.get_contract.return_value = contract_mock

    # Mock getJob returning CREATED status (1)
    contract_mock.functions.getJob.return_value.call.return_value = create_mock_job_tuple(
        status_code=1,
        settled=False
    )

    adapter = EscrowAdapter(provider, address=DUMMY_ESCROW_ADDRESS)
    job = adapter.get_job(SAMPLE_JOB_ID_HEX)

    assert job["job_id"] == SAMPLE_JOB_ID_HEX.lower()
    assert job["client_agent_id"] == 1
    assert job["provider_agent_id"] == 2
    assert job["status"] == "CREATED"
    assert job["status_code"] == 1
    assert job["settled"] is False
    assert job["is_terminal"] is False
    assert job["reward_amount_wei"] == str(10**18)
    assert job["reward_amount_mon"] == 1.0
    assert job["validator_fee_bps"] == 500
    assert job["validator_fee_percent"] == 5.0
    # Confirm contract call() was used, never transact()
    contract_mock.functions.getJob.return_value.call.assert_called_once()
    assert not hasattr(contract_mock.functions.getJob.return_value, "transact") or not contract_mock.functions.getJob.return_value.transact.called


@pytest.mark.parametrize("status_code,expected_status,expected_terminal", [
    (0, "UNINITIALIZED", False),
    (1, "CREATED", False),
    (2, "ACCEPTED", False),
    (3, "SUBMITTED", False),
    (4, "VALIDATING", False),
    (5, "COMPLETED", True),
    (6, "REJECTED", True),
    (7, "CANCELLED", True),
    (8, "EXPIRED", True),
    (9, "EXPIRED_UNSUBMITTED", True),
    (10, "FAILED_VALIDATION", False),
    (11, "DISPUTED", False),
    (12, "REFUNDED", True),
])
def test_escrow_adapter_all_job_statuses(status_code, expected_status, expected_terminal):
    provider = MagicMock(spec=Web3Provider)
    contract_mock = MagicMock()
    provider.get_contract.return_value = contract_mock

    contract_mock.functions.getJob.return_value.call.return_value = create_mock_job_tuple(
        status_code=status_code,
        settled=expected_terminal
    )

    adapter = EscrowAdapter(provider, address=DUMMY_ESCROW_ADDRESS)

    if status_code == 0:
        with pytest.raises(JobNotFoundError):
            adapter.get_job(SAMPLE_JOB_ID_HEX)
    else:
        job = adapter.get_job(SAMPLE_JOB_ID_HEX)
        assert job["status"] == expected_status
        assert job["status_code"] == status_code
        assert job["is_terminal"] == expected_terminal
        assert job["settled"] == expected_terminal


def test_escrow_adapter_refunded_terminal_state():
    provider = MagicMock(spec=Web3Provider)
    contract_mock = MagicMock()
    provider.get_contract.return_value = contract_mock

    # Status 12 is REFUNDED
    contract_mock.functions.getJob.return_value.call.return_value = create_mock_job_tuple(
        status_code=12,
        settled=True
    )

    adapter = EscrowAdapter(provider, address=DUMMY_ESCROW_ADDRESS)
    job = adapter.get_job(SAMPLE_JOB_ID_HEX)

    assert job["status"] == "REFUNDED"
    assert job["status_code"] == 12
    assert job["is_terminal"] is True
    assert job["settled"] is True


def test_escrow_adapter_job_not_found_empty_bytes():
    provider = MagicMock(spec=Web3Provider)
    contract_mock = MagicMock()
    provider.get_contract.return_value = contract_mock

    # Return empty jobId
    contract_mock.functions.getJob.return_value.call.return_value = create_mock_job_tuple(
        status_code=0,
        job_id_bytes=b"\x00" * 32
    )

    adapter = EscrowAdapter(provider, address=DUMMY_ESCROW_ADDRESS)
    with pytest.raises(JobNotFoundError):
        adapter.get_job(SAMPLE_JOB_ID_HEX)


def test_escrow_adapter_invalid_job_id_format():
    provider = MagicMock(spec=Web3Provider)
    contract_mock = MagicMock()
    provider.get_contract.return_value = contract_mock

    adapter = EscrowAdapter(provider, address=DUMMY_ESCROW_ADDRESS)

    # Too short
    with pytest.raises(InvalidDataError):
        adapter.get_job("0x1234")

    # Non-hex characters
    with pytest.raises(InvalidDataError):
        adapter.get_job("0x" + "zz" * 32)


def test_escrow_adapter_malformed_tuple():
    provider = MagicMock(spec=Web3Provider)
    contract_mock = MagicMock()
    provider.get_contract.return_value = contract_mock

    # Return only 5 elements instead of 23
    contract_mock.functions.getJob.return_value.call.return_value = (b"\xaa" * 32, 1, ZERO_ADDRESS, 2, ZERO_ADDRESS)

    adapter = EscrowAdapter(provider, address=DUMMY_ESCROW_ADDRESS)
    with pytest.raises(InvalidDataError):
        adapter.get_job(SAMPLE_JOB_ID_HEX)


def test_escrow_adapter_rpc_error():
    provider = MagicMock(spec=Web3Provider)
    contract_mock = MagicMock()
    provider.get_contract.return_value = contract_mock

    contract_mock.functions.getJob.return_value.call.side_effect = Exception("RPC timeout connection reset")

    adapter = EscrowAdapter(provider, address=DUMMY_ESCROW_ADDRESS)
    with pytest.raises(RPCError):
        adapter.get_job(SAMPLE_JOB_ID_HEX)


def test_escrow_adapter_contract_revert():
    provider = MagicMock(spec=Web3Provider)
    contract_mock = MagicMock()
    provider.get_contract.return_value = contract_mock

    contract_mock.functions.getJob.return_value.call.side_effect = Exception("execution reverted: internal error")

    adapter = EscrowAdapter(provider, address=DUMMY_ESCROW_ADDRESS)
    with pytest.raises(ContractError):
        adapter.get_job(SAMPLE_JOB_ID_HEX)


def test_escrow_adapter_pending_validator_fees():
    provider = MagicMock(spec=Web3Provider)
    contract_mock = MagicMock()
    provider.get_contract.return_value = contract_mock

    val_addr = "0x2222222222222222222222222222222222222222"
    contract_mock.functions.pendingValidatorFees.return_value.call.return_value = 50000000000000000  # 0.05 MON
    contract_mock.functions.totalPendingValidatorFees.return_value.call.return_value = 150000000000000000  # 0.15 MON

    adapter = EscrowAdapter(provider, address=DUMMY_ESCROW_ADDRESS)

    pending = adapter.get_pending_validator_fees(val_addr)
    assert pending == 50000000000000000

    total = adapter.get_total_pending_validator_fees()
    assert total == 150000000000000000

    # Test invalid address
    with pytest.raises(InvalidDataError):
        adapter.get_pending_validator_fees("invalid-address")


def test_escrow_adapter_derive_validation_request_hash():
    provider = MagicMock(spec=Web3Provider)
    adapter = EscrowAdapter(provider, address=None)  # hash derivation is pure / offline

    val_addr = "0x2222222222222222222222222222222222222222"
    req_hash = adapter.derive_validation_request_hash(
        job_id=SAMPLE_JOB_ID_HEX,
        provider_agent_id=2,
        validator_address=val_addr,
        submission_hash=SAMPLE_SUB_HASH_HEX
    )

    assert req_hash.startswith("0x")
    assert len(req_hash) == 66

    # Invariant: deterministic calculation
    req_hash_2 = adapter.derive_validation_request_hash(
        job_id=SAMPLE_JOB_ID_HEX,
        provider_agent_id=2,
        validator_address=val_addr,
        submission_hash=SAMPLE_SUB_HASH_HEX
    )
    assert req_hash == req_hash_2


@pytest.mark.parametrize("invalid_id", [
    -1,
    0,
    True,
    False,
    "2",
    2**256,
    2**256 + 10
])
def test_derive_validation_request_hash_invalid_provider_agent_id(invalid_id):
    provider = MagicMock(spec=Web3Provider)
    adapter = EscrowAdapter(provider, address=None)
    val_addr = "0x2222222222222222222222222222222222222222"

    with pytest.raises(InvalidDataError):
        adapter.derive_validation_request_hash(
            job_id=SAMPLE_JOB_ID_HEX,
            provider_agent_id=invalid_id,
            validator_address=val_addr,
            submission_hash=SAMPLE_SUB_HASH_HEX
        )


@pytest.mark.parametrize("invalid_addr", [
    ZERO_ADDRESS,
    "not-an-address",
    "0x123",
    "0x" + "gg" * 20
])
def test_derive_validation_request_hash_invalid_validator_address(invalid_addr):
    provider = MagicMock(spec=Web3Provider)
    adapter = EscrowAdapter(provider, address=None)

    with pytest.raises(InvalidDataError):
        adapter.derive_validation_request_hash(
            job_id=SAMPLE_JOB_ID_HEX,
            provider_agent_id=2,
            validator_address=invalid_addr,
            submission_hash=SAMPLE_SUB_HASH_HEX
        )


@pytest.mark.parametrize("invalid_hash", [
    "0x1234",
    "not-a-hash",
    "0x" + "zz" * 32,
    "0x" + "aa" * 31  # 31 bytes instead of 32
])
def test_derive_validation_request_hash_malformed_hashes(invalid_hash):
    provider = MagicMock(spec=Web3Provider)
    adapter = EscrowAdapter(provider, address=None)
    val_addr = "0x2222222222222222222222222222222222222222"

    # Malformed job_id
    with pytest.raises(InvalidDataError):
        adapter.derive_validation_request_hash(
            job_id=invalid_hash,
            provider_agent_id=2,
            validator_address=val_addr,
            submission_hash=SAMPLE_SUB_HASH_HEX
        )

    # Malformed submission_hash
    with pytest.raises(InvalidDataError):
        adapter.derive_validation_request_hash(
            job_id=SAMPLE_JOB_ID_HEX,
            provider_agent_id=2,
            validator_address=val_addr,
            submission_hash=invalid_hash
        )


def test_monetary_precision_one_mon_plus_one_wei():
    """
    Demonstrates that authoritative accounting uses exact stringified integer wei,
    preventing IEEE-754 53-bit mantissa truncation where 1 MON + 1 wei is truncated to 1.0.
    """
    provider = MagicMock(spec=Web3Provider)
    contract_mock = MagicMock()
    provider.get_contract.return_value = contract_mock

    one_mon_plus_one_wei = 10**18 + 1  # 1000000000000000001 wei
    contract_mock.functions.getJob.return_value.call.return_value = create_mock_job_tuple(
        status_code=1,
        settled=False,
        reward_wei=one_mon_plus_one_wei
    )

    adapter = EscrowAdapter(provider, address=DUMMY_ESCROW_ADDRESS)
    job = adapter.get_job(SAMPLE_JOB_ID_HEX)

    # In IEEE-754 64-bit float, 1 MON + 1 wei loses precision:
    assert float(one_mon_plus_one_wei) / 10**18 == 1.0

    # In AegisAgent EscrowAdapter, authoritative reward_amount_wei remains exact string:
    assert job["reward_amount_wei"] == "1000000000000000001"
    assert int(job["reward_amount_wei"]) == 1000000000000000001
    assert int(job["reward_amount_wei"]) == one_mon_plus_one_wei
    assert job["reward_amount_mon"] == 1.0  # approximate display-only MON

