from typing import Any, Optional

class APIException(Exception):
    """Base API exception with structured error representation."""
    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = 400,
        details: Optional[Any] = None
    ):
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details
        super().__init__(message)


class AgentNotFoundError(APIException):
    def __init__(self, agent_id: int):
        super().__init__(
            code="AGENT_NOT_FOUND",
            message=f"Agent {agent_id} not found in Identity Registry.",
            status_code=404,
            details={"agent_id": agent_id}
        )


class RPCException(APIException):
    def __init__(self, message: str = "Blockchain RPC node unavailable or connection failed."):
        super().__init__(
            code="RPC_ERROR",
            message=message,
            status_code=502
        )


class ContractException(APIException):
    def __init__(self, message: str = "Smart contract execution failed on blockchain."):
        super().__init__(
            code="CONTRACT_ERROR",
            message=message,
            status_code=502
        )


class InvalidBlockchainDataException(APIException):
    def __init__(self, message: str = "Invalid or unparseable data returned from blockchain."):
        super().__init__(
            code="INVALID_BLOCKCHAIN_DATA",
            message=message,
            status_code=502
        )


class InvalidRequestException(APIException):
    def __init__(self, message: str, details: Optional[Any] = None):
        super().__init__(
            code="INVALID_REQUEST",
            message=message,
            status_code=400,
            details=details
        )


class TrustEvaluationException(APIException):
    def __init__(self, message: str = "Unexpected error encountered during deterministic trust evaluation."):
        super().__init__(
            code="TRUST_EVALUATION_ERROR",
            message=message,
            status_code=500
        )


class AIUnavailableException(APIException):
    def __init__(self, message: str = "AI reasoning provider is currently unavailable."):
        super().__init__(
            code="AI_UNAVAILABLE",
            message=message,
            status_code=503
        )


class EscrowNotConfiguredException(APIException):
    def __init__(self, message: str = "Hiring Escrow contract is not configured on this environment."):
        super().__init__(
            code="ESCROW_NOT_CONFIGURED",
            message=message,
            status_code=503
        )


class JobNotFoundException(APIException):
    def __init__(self, job_id: str):
        super().__init__(
            code="JOB_NOT_FOUND",
            message=f"Job {job_id} not found in Escrow registry or uninitialized.",
            status_code=404,
            details={"job_id": job_id}
        )

