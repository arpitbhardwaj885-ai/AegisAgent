from web3 import Web3
from web3.exceptions import Web3Exception
from app.trust.blockchain.config import DEFAULT_RPC_URL, DEFAULT_CHAIN_ID
from app.trust.blockchain.errors import RPCError, ContractError

class Web3Provider:
    def __init__(self, rpc_url: str = DEFAULT_RPC_URL, chain_id: int = DEFAULT_CHAIN_ID):
        self.rpc_url = rpc_url
        self.chain_id = chain_id
        # Simple timeout configuration for request robustness
        self.w3 = Web3(Web3.HTTPProvider(self.rpc_url, request_kwargs={'timeout': 15}))
        
    def check_connection(self):
        try:
            if not self.w3.is_connected():
                raise RPCError(f"Cannot connect to RPC at {self.rpc_url}")
            actual_chain_id = self.w3.eth.chain_id
            if actual_chain_id != self.chain_id:
                raise RPCError(f"Wrong chain ID. Expected {self.chain_id}, got {actual_chain_id}")
        except Exception as e:
            if isinstance(e, RPCError):
                raise
            raise RPCError(f"RPC connection failed: {e}")

    def get_contract(self, address: str, abi: list):
        if not self.w3.is_address(address):
            raise ContractError(f"Invalid contract address: {address}")
        return self.w3.eth.contract(address=self.w3.to_checksum_address(address), abi=abi)
        
    def get_latest_block(self) -> int:
        try:
            return self.w3.eth.block_number
        except Exception as e:
            raise RPCError(f"Failed to get block number: {e}")
