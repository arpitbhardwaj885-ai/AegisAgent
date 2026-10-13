# Aegis Identity Registry

## Overview
AegisAgent positions itself as an **ERC-8004-compatible trust infrastructure** augmented with AegisAgent extensions. The `AegisIdentityRegistry` is the foundational layer, responsible for anchoring autonomous AI agents on-chain.

## Why ERC-8004 Compatible Identity?
AegisAgent strictly complies with the current ERC-8004 draft for Agent Identities. ERC-8004 emphasizes decoupling identity from quantifiable reputation. By modeling agent identities as NFTs (ERC-721), AegisAgent achieves:
- **Transferability**: Agents (and their accumulated reputation) can be owned, transferred, or operated by a primary wallet.
- **Interoperability**: Existing indexers, marketplaces, and wallets can recognize agent identities naturally without custom logic.

## Core Concepts

### agentId
The `agentId` represents the unique, monotonically increasing identifier of the agent. It maps 1:1 to the ERC-721 `tokenId`.

### agentURI
The `agentURI` points to the metadata describing the agent (e.g., an IPFS or Arweave hash pointing to a JSON document containing capabilities, descriptions, and model specifics).

### agent wallet
The `agentWallet` is the designated address that operates on behalf of the agent, receiving funds and signing off-chain transactions. 
- **Initialization:** By default, it is initialized to the owner who minted the identity.
- **Proof-of-Control (ERC-8004 requirement):** Changing the wallet using `setAgentWallet()` requires cryptographic proof of consent from the *new* wallet.
  - **EOAs:** Implemented via EIP-712 structured signatures. Signatures are strongly domain-separated using the contract address, chain ID, and a nonce to prevent replay attacks across chains or registries.
  - **Smart Contract Wallets:** Implemented via ERC-1271 validation (`isValidSignature`).
- **Transfer Reset (ERC-8004 requirement):** If the Agent NFT is transferred to a new owner, the `agentWallet` is automatically cleared (reset to `address(0)`) to prevent the previous owner from maintaining execution rights.
- **Unsetting:** The wallet can be explicitly cleared by the owner using `unsetAgentWallet()`.

### Metadata
The registry supports on-chain key-value metadata via `setMetadata()`, strictly emitting the ERC-8004 `MetadataSet(uint256 indexed agentId, string indexed indexedMetadataKey, string metadataKey, bytes metadataValue)` event. This allows rapid on-chain capability flags or routing directives that smart contracts can read synchronously without relying on off-chain `agentURI` resolution. The key `agentWallet` is reserved and protected.

### EVM Version (Implementation Choice)
While the goal is broad L2 compatibility (e.g., Shanghai), the implementation uses OpenZeppelin `v5.6.1` which relies on the `mcopy` opcode. As a result, the target EVM version is explicitly set to `cancun`. The Monad Testnet target fully supports `cancun` opcodes, making this safe for deployment.

### Registry Identifier
Through `getAgentRegistry()`, the contract emits a standard canonical identifier (e.g., `eip155:10143:0x123...`) useful for off-chain matching and cross-chain references.

## Security Model
- **Ownership Verification**: All state-modifying functions revert unless invoked by the ERC-721 owner or an explicitly approved operator.
- **Safe Reverts**: The contract correctly uses OpenZeppelin's `_requireOwned` to prevent calls accessing nonexistent agents.
- **Immutability**: Designed to be immutable for MVP without upgradeable proxy complexity. No central admin can arbitrarily modify agent profiles.

## Future Integrations
- **Reputation Registry**: The `AegisReputationRegistry` will map directly back to the `agentId` tracked here, accumulating success/failure metrics.
- **Validation Registry**: Once a task completes, validators use the identity registry to resolve the correct `agentWallet` for payouts.
