import time
from app.trust.models import ValidationEvidence
from app.trust.blockchain.provider import Web3Provider
from app.trust.blockchain.config import VALIDATION_REGISTRY_ADDRESS
from app.trust.blockchain.contracts import VALIDATION_ABI
from app.trust.blockchain.errors import RPCError, ContractError

class ValidationAdapter:
    def __init__(self, provider: Web3Provider, address: str = VALIDATION_REGISTRY_ADDRESS):
        self.provider = provider
        self.contract = self.provider.get_contract(address, VALIDATION_ABI)
        
    def get_validation_evidence(self, agent_id: int) -> ValidationEvidence:
        try:
            try:
                request_hashes = self.contract.functions.getAgentValidations(agent_id).call()
            except Exception as e:
                err_str = str(e).lower()
                if "revert" in err_str:
                    request_hashes = []
                else:
                    raise RPCError(f"Error fetching validation requests: {e}")

            if not request_hashes:
                return ValidationEvidence()
                
            validation_count = 0
            successful_validation_count = 0
            failed_validation_count = 0
            
            validator_counts = {}
            unique_validator_set = set()
            
            latest_update = 0
            
            for req_hash in request_hashes:
                try:
                    status = self.contract.functions.getValidationStatus(req_hash).call()
                    validator = status[0]
                    agent_id = status[1]
                    response = status[2]
                    response_hash = status[3]
                    last_update = status[5]
                    
                    # Assuming has_response can be inferred from last_update or response_hash
                    # If response_hash is not empty bytes32
                    has_response = last_update > 0 or response_hash != b'\\x00' * 32
                    
                    if has_response:
                        validation_count += 1
                        unique_validator_set.add(validator)
                        validator_counts[validator] = validator_counts.get(validator, 0) + 1
                        
                        if last_update > latest_update:
                            latest_update = last_update
                            
                        # Response is 0-100.
                        if response >= 50:
                            successful_validation_count += 1
                        else:
                            failed_validation_count += 1
                        
                except Exception as e:
                    raise ContractError(f"Error fetching validation status: {e}")
                    
            if validation_count == 0:
                return ValidationEvidence()
                
            validator_shares = [count / validation_count for count in validator_counts.values()]
            
            days_since = None
            if latest_update > 0:
                current_time = int(time.time())
                seconds_since = current_time - latest_update
                if seconds_since >= 0:
                    days_since = seconds_since // 86400
            
            return ValidationEvidence(
                validation_count=validation_count,
                unique_validator_count=len(unique_validator_set),
                successful_validation_count=successful_validation_count,
                failed_validation_count=failed_validation_count,
                validator_shares=validator_shares,
                recent_validation_count=0,
                days_since_last_validation=days_since
            )
            
        except RPCError:
            raise
        except Exception as e:
            raise ContractError(f"Unexpected error in validation adapter: {e}")
