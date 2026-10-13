from app.trust.models import ReputationEvidence
from app.trust.blockchain.provider import Web3Provider
from app.trust.blockchain.config import REPUTATION_REGISTRY_ADDRESS
from app.trust.blockchain.contracts import REPUTATION_ABI
from app.trust.blockchain.errors import RPCError, ContractError

class ReputationAdapter:
    def __init__(self, provider: Web3Provider, address: str = REPUTATION_REGISTRY_ADDRESS):
        self.provider = provider
        self.contract = self.provider.get_contract(address, REPUTATION_ABI)
        
    def get_reputation_evidence(self, agent_id: int) -> ReputationEvidence:
        try:
            # 1. Get clients
            try:
                clients = self.contract.functions.getClients(agent_id).call()
            except Exception as e:
                err_str = str(e).lower()
                if "revert" in err_str:
                    clients = []
                else:
                    raise RPCError(f"Error fetching clients: {e}")

            if not clients:
                return ReputationEvidence()
                
            # 2. Call readAllFeedback
            try:
                # readAllFeedback(agentId, clientAddresses, tag1, tag2, includeRevoked)
                res = self.contract.functions.readAllFeedback(
                    agent_id, clients, "", "", True
                ).call()
                
                resp_clients = res[0]
                resp_values = res[2]
                resp_decimals = res[3]
                resp_revoked = res[6]
                
            except Exception as e:
                raise ContractError(f"Error calling readAllFeedback: {e}")
                
            feedback_count = 0
            unique_reviewer_set = set()
            positive_feedback_count = 0
            negative_feedback_count = 0
            
            client_counts = {}
            sum_normalized = 0.0
            
            for i in range(len(resp_clients)):
                if resp_revoked[i]:
                    continue 
                    
                client = resp_clients[i]
                val_raw = resp_values[i]
                decimals = resp_decimals[i]
                
                val = val_raw / (10 ** decimals)
                
                feedback_count += 1
                unique_reviewer_set.add(client)
                client_counts[client] = client_counts.get(client, 0) + 1
                
                sum_normalized += val
                
                # Heuristic for positive/negative based on typical 1-5 scale
                if val >= 4.0:
                    positive_feedback_count += 1
                elif val <= 2.0:
                    negative_feedback_count += 1
                    
            if feedback_count == 0:
                return ReputationEvidence()
                
            average_feedback_score = sum_normalized / feedback_count
            reviewer_shares = [count / feedback_count for count in client_counts.values()]
            
            return ReputationEvidence(
                feedback_count=feedback_count,
                unique_reviewer_count=len(unique_reviewer_set),
                average_feedback_score=average_feedback_score,
                positive_feedback_count=positive_feedback_count,
                negative_feedback_count=negative_feedback_count,
                reviewer_shares=reviewer_shares,
                recent_feedback_count=0,
                days_since_last_feedback=None
            )
            
        except RPCError:
            raise
        except Exception as e:
            raise ContractError(f"Unexpected error in reputation adapter: {e}")
