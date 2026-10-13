from decimal import Decimal
from typing import Dict, Any, Optional, Union
from eth_abi import encode
from eth_abi.exceptions import EncodingError
from web3 import Web3


from app.trust.blockchain.config import HIRING_ESCROW_ADDRESS
from app.trust.blockchain.contracts import ESCROW_ABI
from app.trust.blockchain.errors import (
    RPCError,
    ContractError,
    EscrowNotConfiguredError,
    JobNotFoundError,
    InvalidDataError
)
from app.trust.blockchain.provider import Web3Provider


JOB_STATUS_MAP: Dict[int, str] = {
    0: "UNINITIALIZED",
    1: "CREATED",
    2: "ACCEPTED",
    3: "SUBMITTED",
    4: "VALIDATING",
    5: "COMPLETED",
    6: "REJECTED",
    7: "CANCELLED",
    8: "EXPIRED",
    9: "EXPIRED_UNSUBMITTED",
    10: "FAILED_VALIDATION",
    11: "DISPUTED",
    12: "REFUNDED"
}

TERMINAL_STATUSES = {
    "COMPLETED",
    "REJECTED",
    "CANCELLED",
    "EXPIRED",
    "EXPIRED_UNSUBMITTED",
    "REFUNDED"
}


class EscrowAdapter:
    """
    Read-only adapter for AegisHiringEscrow smart contract.
    Enforces zero-write constraints, decodes 23-field Job tuples,
    tracks pending validator fees, and computes canonical hashes offline.
    """

    def __init__(self, provider: Web3Provider, address: Optional[str] = None):
        self.provider = provider
        target_address = address if address is not None else HIRING_ESCROW_ADDRESS
        target_address = target_address.strip() if target_address else ""

        if not target_address:
            self.address = None
            self.contract = None
        else:
            if not Web3.is_address(target_address):
                raise ContractError(f"Invalid escrow contract address: {target_address}")
            self.address = Web3.to_checksum_address(target_address)
            self.contract = self.provider.get_contract(self.address, ESCROW_ABI)

    def is_configured(self) -> bool:
        """Returns True if an escrow contract address is configured and valid."""
        return self.contract is not None

    def _require_configured(self):
        """Enforces that the escrow contract address is configured."""
        if self.contract is None:
            raise EscrowNotConfiguredError(
                "Hiring Escrow contract address is not configured. Set HIRING_ESCROW_ADDRESS."
            )

    @staticmethod
    def _normalize_bytes32(val: Union[str, bytes], field_name: str = "bytes32") -> bytes:
        """Normalizes a hex string or bytes into exactly 32 bytes."""
        if isinstance(val, bytes):
            if len(val) != 32:
                raise InvalidDataError(f"{field_name} must be exactly 32 bytes, got {len(val)}")
            return val

        if isinstance(val, str):
            s = val.strip()
            if s.startswith("0x") or s.startswith("0X"):
                s = s[2:]
            if len(s) != 64:
                raise InvalidDataError(f"{field_name} hex must be 64 characters (32 bytes), got {len(s)}")
            try:
                b = bytes.fromhex(s)
                return b
            except ValueError as e:
                raise InvalidDataError(f"Invalid hex string for {field_name}: {e}")

        raise InvalidDataError(f"Expected str or bytes for {field_name}, got {type(val).__name__}")

    @staticmethod
    def _to_hex_str(val: Union[bytes, str]) -> str:
        """Converts bytes to 0x-prefixed hex string."""
        if isinstance(val, bytes):
            return "0x" + val.hex()
        s = str(val).strip()
        return s if s.startswith("0x") else "0x" + s

    def get_job(self, job_id: Union[str, bytes]) -> Dict[str, Any]:
        """
        Reads a job by jobId from AegisHiringEscrow.
        Decodes the 23-field struct, calculates MON conversions,
        and verifies terminal state invariants.
        """
        self._require_configured()
        job_id_bytes = self._normalize_bytes32(job_id, "jobId")

        try:
            raw_job = self.contract.functions.getJob(job_id_bytes).call()
        except Exception as e:
            err_msg = str(e).lower()
            if "rpc" in err_msg or "connect" in err_msg or "timeout" in err_msg:
                raise RPCError(f"RPC connection error reading job from escrow: {e}")
            raise ContractError(f"Error querying getJob from escrow: {e}")

        # Web3 returns a tuple/list or named struct. Standard ABI tuple has 23 fields.
        if not raw_job or len(raw_job) < 23:
            raise InvalidDataError(f"Malformed job tuple returned from escrow: length {len(raw_job) if raw_job else 0}")

        (
            ret_job_id,
            client_agent_id,
            client,
            provider_agent_id,
            validator_address,
            reward_amount,
            validator_fee_bps,
            min_acceptance_score,
            acceptance_deadline,
            submission_deadline,
            validation_deadline,
            task_hash,
            prehire_trust_snapshot_hash,
            status_code,
            settled,
            submission_hash,
            submission_uri,
            submission_timestamp,
            validation_request_hash,
            failure_timestamp,
            challenge_deadline,
            dispute_timestamp,
            designated_arbiter
        ) = raw_job[:23]

        # In uninitialized jobs, status is 0 or jobId is empty bytes32
        if status_code == 0 or (isinstance(ret_job_id, bytes) and ret_job_id == b"\x00" * 32):
            raise JobNotFoundError(f"Job {self._to_hex_str(job_id_bytes)} not found or uninitialized.")

        status_str = JOB_STATUS_MAP.get(status_code, f"UNKNOWN_{status_code}")
        is_terminal = status_str in TERMINAL_STATUSES

        reward_amount_int = int(reward_amount)
        reward_amount_mon = float(Decimal(reward_amount_int) / Decimal(10**18))
        fee_bps_int = int(validator_fee_bps)
        validator_fee_percent = float(Decimal(fee_bps_int) / Decimal(100))


        return {
            "job_id": self._to_hex_str(ret_job_id),
            "client_agent_id": int(client_agent_id),
            "client": Web3.to_checksum_address(client),
            "provider_agent_id": int(provider_agent_id),
            "validator_address": Web3.to_checksum_address(validator_address),
            "reward_amount_wei": str(reward_amount_int),
            "reward_amount_mon": reward_amount_mon,
            "validator_fee_bps": fee_bps_int,
            "validator_fee_percent": validator_fee_percent,
            "min_acceptance_score": int(min_acceptance_score),
            "acceptance_deadline": int(acceptance_deadline),
            "submission_deadline": int(submission_deadline),
            "validation_deadline": int(validation_deadline),
            "task_hash": self._to_hex_str(task_hash),
            "prehire_trust_snapshot_hash": self._to_hex_str(prehire_trust_snapshot_hash),
            "status": status_str,
            "status_code": int(status_code),
            "is_terminal": is_terminal,
            "settled": bool(settled),
            "submission_hash": self._to_hex_str(submission_hash),
            "submission_uri": str(submission_uri),
            "submission_timestamp": int(submission_timestamp),
            "validation_request_hash": self._to_hex_str(validation_request_hash),
            "failure_timestamp": int(failure_timestamp),
            "challenge_deadline": int(challenge_deadline),
            "dispute_timestamp": int(dispute_timestamp),
            "designated_arbiter": Web3.to_checksum_address(designated_arbiter),
        }

    def get_pending_validator_fees(self, validator_address: str) -> int:
        """Reads pending accrued validator fees for a validator in wei."""
        self._require_configured()
        if not Web3.is_address(validator_address):
            raise InvalidDataError(f"Invalid validator address: {validator_address}")
        checksum_addr = Web3.to_checksum_address(validator_address)

        try:
            fees = self.contract.functions.pendingValidatorFees(checksum_addr).call()
            return int(fees)
        except Exception as e:
            err_msg = str(e).lower()
            if "rpc" in err_msg or "connect" in err_msg or "timeout" in err_msg:
                raise RPCError(f"RPC connection error querying pending validator fees: {e}")
            raise ContractError(f"Error querying pendingValidatorFees from escrow: {e}")

    def get_total_pending_validator_fees(self) -> int:
        """Reads total pending accrued validator fee liabilities across all validators in wei."""
        self._require_configured()
        try:
            total = self.contract.functions.totalPendingValidatorFees().call()
            return int(total)
        except Exception as e:
            err_msg = str(e).lower()
            if "rpc" in err_msg or "connect" in err_msg or "timeout" in err_msg:
                raise RPCError(f"RPC connection error querying total pending validator fees: {e}")
            raise ContractError(f"Error querying totalPendingValidatorFees from escrow: {e}")

    def derive_validation_request_hash(
        self,
        job_id: Union[str, bytes],
        provider_agent_id: int,
        validator_address: str,
        submission_hash: Union[str, bytes]
    ) -> str:
        """
        Derives the canonical validation request hash:
        keccak256(abi.encode(jobId, providerAgentId, validatorAddress, submissionHash)).
        Matches AegisHiringEscrow.deriveValidationRequestHash exactly.
        """
        job_id_bytes = self._normalize_bytes32(job_id, "jobId")
        sub_hash_bytes = self._normalize_bytes32(submission_hash, "submissionHash")

        if not isinstance(provider_agent_id, int) or isinstance(provider_agent_id, bool):
            raise InvalidDataError(f"provider_agent_id must be an integer, got {type(provider_agent_id).__name__}")
        if provider_agent_id <= 0:
            raise InvalidDataError(f"provider_agent_id must be a positive integer (> 0), got {provider_agent_id}")
        if provider_agent_id > 2**256 - 1:
            raise InvalidDataError(f"provider_agent_id exceeds uint256 maximum bounds: {provider_agent_id}")

        if not Web3.is_address(validator_address):
            raise InvalidDataError(f"Invalid validator address: {validator_address}")
        checksum_validator = Web3.to_checksum_address(validator_address)
        if checksum_validator == "0x0000000000000000000000000000000000000000":
            raise InvalidDataError("validator_address cannot be the zero address")

        try:
            encoded = encode(
                ["bytes32", "uint256", "address", "bytes32"],
                [job_id_bytes, provider_agent_id, checksum_validator, sub_hash_bytes]
            )
        except (EncodingError, ValueError, TypeError) as e:
            raise InvalidDataError(f"ABI encoding failed: {e}")

        request_hash = Web3.keccak(encoded)
        return "0x" + request_hash.hex()

