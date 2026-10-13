# Smart Contract Architecture (Phase 1)

This document outlines the Solidity smart contract architecture for AegisAgent. The design is built as an **ERC-8004-compatible trust infrastructure** supplemented with AegisAgent-specific extensions for autonomous AI agent economies. 

## 1. Core Principles & Constraints
- **Target Network**: Monad Testnet (Chain ID: 10143).
- **ERC-8004 Compatibility**: Preserves core abstractions of identity (agentId, agentURI), reputation signals, and validation evidence.
- **Hackathon Realistic**: MVP deployable on Monad within 8 days. Extension points are designed for future zkML, TEE, or DAO governance, but not implemented in MVP. Standard immutable deployments instead of complex upgradeable proxies.
- **Security-First**: Strict protection against Sybil attacks, farming, AI oracle compromise, signature replay, and reentrancy.

---

## 2. Contract Boundaries & Responsibilities

1. **AegisIdentityRegistry**: Manages agent identity and registration metadata (`agentId`, `agentURI`).
2. **AegisReputationRegistry**: Manages structured performance and reputation signals (success, failures, volume).
3. **AegisHiring**: Manages the task lifecycle state machine and MON escrow.
4. **AegisValidationRegistry**: Manages validation requests, validator authorization, and validation evidence.
5. **AegisTrustEngine**: Handles deterministic aggregation of on-chain signals + authenticated EIP-712 AI assessments.

---

## 3. Contracts Detail

### 3.1 AegisIdentityRegistry
ERC-8004 compatible identity abstraction.

- **Structs**:
  ```solidity
  struct AgentProfile {
      uint256 agentId;
      address owner;
      string agentURI; // IPFS/Arweave link to capabilities/description
      uint256 stakeAmount;
      uint256 registeredAt;
      bool isActive;
  }
  ```
- **Events**: `AgentRegistered`, `AgentURIUpdated`
- **Key Functions**:
  - `registerAgent(string calldata agentURI) external payable`: Requires a minimum MON stake to prevent Sybil attacks.
  - `updateAgentURI(uint256 agentId, string calldata newURI) external`

### 3.2 AegisReputationRegistry
ERC-8004 compatible structured reputation signal registry.

- **Structs**:
  ```solidity
  struct ReputationSignals {
      uint256 successfulTasks;
      uint256 failedTasks;
      uint256 totalVolume;
      uint256 disputes;
  }
  ```
- **Events**: `ReputationUpdated`
- **Key Functions**:
  - `updateReputation(uint256 agentId, bool success, uint256 volume, bool disputed) external onlyValidationRegistry`

### 3.3 AegisHiring (AegisAgent Extension)
Task lifecycle and MON escrow state machine.

- **State Machine**:
  `CREATED` → `ACCEPTED` → `SUBMITTED` → `VALIDATING` → `COMPLETED` (Success) or `FAILED` (Failure)
- **Structs**:
  ```solidity
  enum TaskState { CREATED, ACCEPTED, SUBMITTED, VALIDATING, COMPLETED, FAILED }
  
  struct Task {
      uint256 taskId;
      uint256 clientAgentId;
      uint256 hiredAgentId;
      uint256 reward;
      uint256 deadline;
      uint256 acceptanceTimestamp;
      uint256 submissionTimestamp;
      bytes32 validationRequestHash;
      TaskState state;
      bool settled;
  }
  ```
- **Events**: `TaskCreated`, `TaskAccepted`, `TaskSubmitted`, `TaskCompleted`, `TaskFailed`, `TaskCancelled`
- **Key Functions**:
  - `createTask(...) external payable`: Secures escrow, prevents self-hiring (`clientAgentId != hiredAgentId`).
  - `acceptTask(...) external`
  - `submitTask(...) external`: Transitions to `VALIDATING`.
  - `settleTask(uint256 taskId, bool success) external onlyValidationRegistry`: Handles payout/refund, ensures no double settlement, uses `nonReentrant`.
  - `cancelTask(...) external`: Cancellation rules based on deadline and current state.

### 3.4 AegisValidationRegistry
ERC-8004 compatible validation registry. For MVP, relies on an authorized **Aegis AI Evaluation Oracle**. Designed to seamlessly support multiple validators, stake-backed validators, zkML verification, or TEE attestation in the future without assuming cryptographic trust in a single API.

- **Structs**:
  ```solidity
  struct ValidationRecord {
      uint256 taskId;
      address validator;
      bool success;
      uint8 score;
      bytes32 evidenceHash;
  }
  ```
- **Events**: `ValidationRequested`, `ValidationSubmitted`
- **Key Functions**:
  - `requestValidation(uint256 taskId, bytes32 evidenceHash) external onlyHiringContract`
  - `submitValidation(uint256 taskId, bool success, uint8 score, bytes32 evidenceHash) external onlyAuthorizedValidator`
    - Calls `AegisHiring.settleTask(...)`
    - Calls `AegisReputationRegistry.updateReputation(...)`

### 3.5 AegisTrustEngine (AegisAgent Extension)
Calculates bounded, deterministic trust scores. Prevents arbitrary backend writes by separating and independently bounding on-chain signals from AI signals.

- **On-chain Signals (Deterministic Base)**: successful tasks, failed tasks, validation scores, completed task volume, dispute count, identity age/stake.
- **AI Signals (Contextual Modifiers)**: behavioral risk, output quality, anomaly detection, consistency, Sybil/fraud likelihood.
- **EIP-712 Payload**:
  ```solidity
  struct AIAssessment {
      uint256 agentId;
      uint256 taskId;
      uint8 riskScore;
      uint8 qualityScore;
      uint256 modelVersion;
      bytes32 evidenceHash;
      uint256 nonce;
      uint256 deadline;
  }
  ```
- **Replay & Stale Data Protection**: 
  - **Nonce**: Ensures each signed assessment can only be used once per agent, completely nullifying replay attacks.
  - **Deadline**: Prevents stale AI assessments from being submitted when network or agent conditions have changed.
  - **Domain Separator**: Binds the signature to the specific `chainId` and `verifyingContract` address.
- **Events**: `TrustScoreUpdated`, `AIAssessmentAccepted`
- **Key Functions**:
  - `submitAIAssessment(AIAssessment calldata assessment, bytes calldata signature) external`
    - Verifies EIP-712 structured signature against the authorized Aegis AI Evaluation Oracle.
    - Deterministically merges AI signals with on-chain signals.
    - Emits bounded final score.

---

## 4. Security Threat Models & Mitigations

| Threat Model | Mitigation |
|--------------|------------|
| **Sybil Agents** | `AegisIdentityRegistry` requires a native MON stake to register an `agentId`. |
| **Fake Reputation / Farming** | `AegisHiring` demands actual escrow value. Tasks cannot have 0 reward. Validation is independent. |
| **Self-Feedback** | `AegisHiring.createTask` requires `clientAgentId != hiredAgentId`. |
| **Validator Compromise** | MVP uses a central authorized AI oracle key, but architecture restricts its power to just reporting success/fail. Future extensions allow decentralized validators. |
| **AI Oracle Compromise** | Trust score boundaries are deterministic on-chain. Oracle can only influence within defined AI signal bounds (e.g. up to 30% of total score), not arbitrarily write final scores. |
| **Signature Replay** | Defeated via EIP-712 Domain Separator (`chainId`, contract address) + strict `nonce` tracking per agent/oracle. |
| **Stale AI Assessments** | Defeated via `deadline` block timestamp embedded in EIP-712 payloads. |
| **Unauthorized Reputation Updates** | Only `AegisValidationRegistry` can call `updateReputation` on `AegisReputationRegistry`. |
| **Reentrancy** | All state-changing/escrow-releasing functions use OpenZeppelin's `nonReentrant` modifier (Checks-Effects-Interactions pattern). |
| **Double Settlement** | `AegisHiring` task struct tracks `bool settled`. Settle calls on `settled == true` revert immediately. |
| **Task Deadline Manipulation** | `deadline` is immutable post-creation. |
| **Malicious Agent Submissions** | Intercepted in `VALIDATING` state. Failure triggers refund to client. |
| **Malicious Client Cancellation** | Clients cannot cancel an escrow once a task is in `ACCEPTED` or `SUBMITTED` state; they must await validation or deadline expiry. |

---

## 5. Implementation Summary

### Final Contract Dependency Graph
1. `AegisIdentityRegistry` (Base Layer)
2. `AegisReputationRegistry` (Signal Storage)
3. `AegisHiring` (Escrow & State Machine; depends on Identity)
4. `AegisValidationRegistry` (Oracle Intg; depends on Hiring & Reputation)
5. `AegisTrustEngine` (Score Aggregation; depends on Reputation & AI Auth)

### What is MVP vs. Future Extension
- **Hackathon MVP**: Single authorized "Aegis AI Evaluation Oracle" (Gemini backend proxy) for validation and AI trust signals. Standard immutable deployments. Strict EIP-712 signatures. Full state-machine escrow.
- **Future Extension (Out of Scope for 8 Days)**: DAO governance, upgradeable proxy complexity, cross-chain state proofs, zero-knowledge (zkML) on-chain verification, production-grade decentralized oracle networks, stake slashing for bad validators.
