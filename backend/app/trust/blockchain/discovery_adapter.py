import time
import json
from typing import List, Dict, Any, Optional

from app.trust.blockchain.config import DISCOVERY_MAX_SCAN_LIMIT
from app.trust.blockchain.provider import Web3Provider
from app.trust.blockchain.identity_adapter import IdentityAdapter
from app.trust.blockchain.errors import (
    AgentNotFoundError,
    RPCError,
    ContractError
)


class DiscoveryAdapter:
    """
    Read-only adapter for discovering and inspecting registered agents on-chain.
    Implements a bounded, sequential enumeration strategy with TTL caching
    to prevent unbounded full-chain scans while remaining database-free.
    """

    def __init__(
        self,
        provider: Web3Provider,
        identity_adapter: Optional[IdentityAdapter] = None,
        cache_ttl: float = 30.0,
        max_scan_limit: int = DISCOVERY_MAX_SCAN_LIMIT,
        max_consecutive_misses: Optional[int] = None
    ):
        self.provider = provider
        self.identity_adapter = identity_adapter or IdentityAdapter(provider)
        self.cache_ttl = cache_ttl
        self.max_scan_limit = max_scan_limit
        self.max_consecutive_misses = max_consecutive_misses
        
        self._cached_agent_ids: List[int] = []
        self._last_scan_time: float = 0.0

    @property
    def may_be_incomplete(self) -> bool:
        """
        Indicates whether discovery results may be incomplete.
        Always returns True because without an off-chain indexer,
        bounded RPC discovery over a non-enumerable ERC-721 contract
        cannot guarantee catalog completeness.
        """
        return True

    def discover_registered_ids(self, force_refresh: bool = False) -> List[int]:
        """
        Discovers all registered agent IDs using bounded monotonic probing.
        Tokens are minted starting from 1 with sequential IDs.
        Safely probes up to max_scan_limit without aborting on gaps.
        """
        self.provider.check_connection()

        now = time.time()
        if (
            not force_refresh
            and self._cached_agent_ids
            and (now - self._last_scan_time < self.cache_ttl)
        ):
            return list(self._cached_agent_ids)

        discovered: List[int] = []
        current_id = 1
        consecutive_misses = 0

        while current_id <= self.max_scan_limit:
            try:
                owner = self.identity_adapter.contract.functions.ownerOf(current_id).call()
                if owner and owner != "0x0000000000000000000000000000000000000000":
                    discovered.append(current_id)
                    consecutive_misses = 0
            except Exception as e:
                err_str = str(e).lower()
                if (
                    "invalid token id" in err_str
                    or "nonexistenttoken" in err_str
                    or "does not exist" in err_str
                    or "revert" in err_str
                    or "7e273289" in err_str
                ):
                    consecutive_misses += 1
                    if self.max_consecutive_misses is not None and consecutive_misses >= self.max_consecutive_misses:
                        break
                else:
                    # True network / RPC failure must raise RPCError
                    raise RPCError(f"RPC failure during agent discovery probe: {e}")

            current_id += 1

        self._cached_agent_ids = discovered
        self._last_scan_time = now
        return list(discovered)

    def get_agent_raw_profile(self, agent_id: int) -> Dict[str, Any]:
        """
        Retrieves identity and metadata fields for a single agent from on-chain state.
        Never fabricates missing metadata; represents absent fields explicitly.
        """
        self.provider.check_connection()

        # 1. Check existence and owner
        try:
            owner = self.identity_adapter.contract.functions.ownerOf(agent_id).call()
        except Exception as e:
            err_str = str(e).lower()
            if (
                "invalid token id" in err_str
                or "nonexistenttoken" in err_str
                or "does not exist" in err_str
                or "revert" in err_str
                or "7e273289" in err_str
            ):
                raise AgentNotFoundError(f"Agent {agent_id} does not exist in Identity Registry.")
            raise RPCError(f"RPC error reading ownerOf for agent {agent_id}: {e}")

        # 2. Designated Agent Wallet
        wallet = None
        wallet_verified = False
        try:
            w = self.identity_adapter.contract.functions.getAgentWallet(agent_id).call()
            if w and w != "0x0000000000000000000000000000000000000000":
                wallet = w
                wallet_verified = True
        except Exception:
            pass

        # 3. Registration URI
        uri = None
        try:
            u = self.identity_adapter.contract.functions.tokenURI(agent_id).call()
            if u:
                uri = u.strip() or None
        except Exception:
            pass

        # Helper to fetch specific metadata keys safely
        def fetch_metadata_str(key: str) -> Optional[str]:
            try:
                raw = self.identity_adapter.contract.functions.getMetadata(agent_id, key).call()
                if raw:
                    decoded = raw.decode("utf-8").strip()
                    return decoded if decoded else None
            except Exception:
                pass
            return None

        # 4. Capabilities (JSON list or dict, safe parse)
        capabilities: List[str] = []
        caps_str = fetch_metadata_str("capabilities")
        if caps_str:
            try:
                parsed = json.loads(caps_str)
                if isinstance(parsed, list):
                    capabilities = [str(c).strip() for c in parsed if str(c).strip()]
                elif isinstance(parsed, dict):
                    capabilities = [str(k).strip() for k in parsed.keys() if str(k).strip()]
            except (json.JSONDecodeError, UnicodeDecodeError):
                # Malformed metadata handled safely: returns empty list
                capabilities = []

        # 5. Endpoint & Domain
        endpoint = fetch_metadata_str("endpoint")
        endpoint_verified = bool(endpoint)
        domain = fetch_metadata_str("domain")

        # 6. Metadata Completeness Calculation (matching IdentityAdapter)
        metadata_completeness = 0.0
        if uri:
            metadata_completeness += 30.0
        if capabilities:
            metadata_completeness += 35.0
        if endpoint:
            metadata_completeness += 35.0

        return {
            "agent_id": agent_id,
            "owner": owner,
            "wallet": wallet,
            "uri": uri,
            "capabilities": capabilities,
            "domain": domain,
            "endpoint": endpoint,
            "endpoint_verified": endpoint_verified,
            "wallet_verified": wallet_verified,
            "metadata_completeness": round(metadata_completeness, 2),
            "identity_status": "AVAILABLE"
        }
