import json
from app.trust.models import IdentityEvidence
from app.trust.blockchain.provider import Web3Provider
from app.trust.blockchain.config import IDENTITY_REGISTRY_ADDRESS
from app.trust.blockchain.contracts import IDENTITY_ABI
from app.trust.blockchain.errors import AgentNotFoundError, RPCError, ContractError

class IdentityAdapter:
    def __init__(self, provider: Web3Provider, address: str = IDENTITY_REGISTRY_ADDRESS):
        self.provider = provider
        self.contract = self.provider.get_contract(address, IDENTITY_ABI)

    def get_agent_owner(self, agent_id: int) -> str:
        """Returns owner address of agent ID. Raises AgentNotFoundError if nonexistent, RPCError on connection error."""
        try:
            owner = self.contract.functions.ownerOf(agent_id).call()
            if not owner or owner == "0x0000000000000000000000000000000000000000":
                raise AgentNotFoundError(f"Agent {agent_id} does not exist in Identity Registry.")
            return self.provider.w3.to_checksum_address(owner)
        except Exception as e:
            if isinstance(e, AgentNotFoundError):
                raise
            err_str = str(e).lower()
            if "invalid token id" in err_str or "nonexistenttoken" in err_str or "does not exist" in err_str or "revert" in err_str or "7e273289" in err_str:
                raise AgentNotFoundError(f"Agent {agent_id} does not exist in Identity Registry.")
            raise RPCError(f"RPC error querying owner of agent {agent_id}: {e}")

    def get_identity_evidence(self, agent_id: int) -> IdentityEvidence:

        try:
            # 1. Check existence
            try:
                owner = self.contract.functions.ownerOf(agent_id).call()
            except Exception as e:
                err_str = str(e).lower()
                if "invalid token id" in err_str or "nonexistenttoken" in err_str or "does not exist" in err_str or "revert" in err_str or "7e273289" in err_str:
                    raise AgentNotFoundError(f"Agent {agent_id} does not exist in Identity Registry.")
                raise RPCError(f"Error calling ownerOf: {e}")
                
            # 2. Get Agent Wallet
            wallet_verified = False
            try:
                wallet = self.contract.functions.getAgentWallet(agent_id).call()
                if wallet and wallet != "0x0000000000000000000000000000000000000000":
                    wallet_verified = True
            except Exception:
                pass

            # 3. URI
            metadata_completeness = 0.0
            try:
                uri = self.contract.functions.tokenURI(agent_id).call()
                if uri:
                    metadata_completeness += 30.0
            except Exception:
                pass
                
            # 4. Fetch specific metadata keys
            def fetch_metadata_key(key: str) -> str:
                try:
                    data = self.contract.functions.getMetadata(agent_id, key).call()
                    if data:
                        return data.decode('utf-8')
                except Exception:
                    pass
                return ""

            capabilities_str = fetch_metadata_key("capabilities")
            endpoint_str = fetch_metadata_key("endpoint")
            
            capability_count = 0
            if capabilities_str:
                metadata_completeness += 35.0
                try:
                    caps = json.loads(capabilities_str)
                    if isinstance(caps, list):
                        capability_count = len(caps)
                    elif isinstance(caps, dict):
                        capability_count = len(caps.keys())
                except json.JSONDecodeError:
                    pass

            endpoint_verified = False
            if endpoint_str:
                metadata_completeness += 35.0
                # We consider it endpoint_verified on-chain if they set it.
                # True endpoint verification would require off-chain ping, but we reflect existence here.
                endpoint_verified = True

            return IdentityEvidence(
                agent_exists=True,
                registration_age_days=0, # Hard to get without traversing events
                metadata_completeness=metadata_completeness,
                wallet_verified=wallet_verified,
                endpoint_verified=endpoint_verified,
                capability_count=capability_count
            )
            
        except AgentNotFoundError:
            raise
        except RPCError:
            raise
        except Exception as e:
            raise ContractError(f"Unexpected error in identity adapter: {e}")
