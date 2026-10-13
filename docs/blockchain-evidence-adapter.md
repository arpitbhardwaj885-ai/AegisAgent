# AegisAgent Blockchain Evidence Adapter

## Architecture
The Blockchain Evidence Adapter bridges the application layer with the on-chain ERC-8004 registries on the Monad testnet. It acts strictly as an evidence extraction and normalizer layer. It transforms on-chain states into the typed models (`IdentityEvidence`, `ReputationEvidence`, `ValidationEvidence`) used by the deterministic Trust Engine. It uses a read-only Web3 Python provider pattern to ensure zero-key/zero-wallet dependency for read operations.

## Contract Addresses
- **Chain ID:** `10143` (Monad Testnet)
- **Identity Registry:** `0xa7A27f96d4e8f58d701D42229d5097A69694Ca4B`
- **Reputation Registry:** `0x387948228a43351F2D33E83Db22576F535c85C74`
- **Validation Registry:** `0x802DE575B528453C8208d5201e27464d63970e2b`

## Data Flow
Blockchain RPC -> Web3 Provider -> (Identity/Reputation/Validation) Adapter -> Typed Evidence -> Unified AgentEvidence -> Trust Engine -> Trust Score & Recommendation

## Evidence Mapping
- **Identity:** `ownerOf`, `getAgentWallet`, `tokenURI`, `getMetadata`. Mapped to agent existence, wallet verification, and capabilities/endpoints completeness.
- **Reputation:** `getClients`, `readAllFeedback`. Mapped to reviewer concentration (HHI shares), positive/negative ratios, normalized value scores based on strictly parsed `valueDecimals`.
- **Validation:** `getAgentValidations`, `getValidationStatus`. Mapped to valid pass/fail responses (>= 50), historical staleness (based on `lastUpdate`), and validator concentration.

## Error Handling
The adapters employ a typed exception hierarchy (`AdapterError`, `RPCError`, `ContractError`, `AgentNotFoundError`, `InvalidDataError`).

## Missing Evidence Semantics
Evidence that cannot be retrieved due to non-existence is strictly represented as `MISSING` (`EvidenceStatus.MISSING`), returning zeroed/empty structures. RPC/Contract failures represent as `INVALID`. Crucially, an RPC failure is NEVER silently defaulted to a legitimate `0` evidence metric, preserving adversarial bounding.

## Snapshot Semantics
Each unified pull retrieves the current state independently. Snapshot metadata including `chain_id`, `block_number`, and `timestamp` are appended to the final payload to guarantee point-in-time traceability.

## Security Considerations
- Read-only Web3 calls. No keys are parsed or held.
- HHI metrics inherently resist sybil attacks.
- Decimal values correctly parsed.
- Strict fallback logic prevents RPC downtime from corrupting evidence as 0.

## Limitations
- Staleness timestamps are primarily bounded by available events and registry structs (like `lastUpdate`).
- High-volume paginations might become costly on very active agents without caching mechanisms (left unimplemented for deterministic simplicity).

## ERC-8004 Boundary
All blockchain artifacts conform precisely to the ERC-8004 registries. The Trust Engine acts purely as the interpretation layer and avoids mutating or writing derived scores back to the source chain during the read pipeline.
