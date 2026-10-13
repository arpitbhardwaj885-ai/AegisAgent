class AdapterError(Exception):
    pass

class AgentNotFoundError(AdapterError):
    pass

class RPCError(AdapterError):
    pass

class ContractError(AdapterError):
    pass

class InvalidDataError(AdapterError):
    pass

class EscrowNotConfiguredError(AdapterError):
    pass

class JobNotFoundError(AdapterError):
    pass

