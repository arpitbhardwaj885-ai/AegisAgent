# AegisAgent Agent Hiring Security & Threat Analysis (Phase 5.3.1)

## 1. Executive Summary & Security Objectives

This document establishes the security architecture, threat model, and cryptographic enforcement boundaries for the AegisAgent Agent Hiring Lifecycle. Autonomous agent-to-agent transactions operate in adversarial, pseudonymous environments where agents may face compromised execution keys, dishonest counterparties, colluding validators, malicious prompt injections, or network partitions.

### Core Security Objectives
1. **Cryptographic Identity Authenticity**: State transitions must strictly verify that transaction initiators control the designated `agentWallet` or identity owner keys.
2. **Deterministic Settlement Integrity**: Escrow release or refund conditions must be governed by verifiable on-chain facts (attestations and block timestamps), never unverified off-chain hearsay or manipulable AI outputs.
3. **Sybil & Collusion Resistance**: Feedback and validation loops must be structurally resilient against self-dealing, circular feedback rings, and reviewer concentration.
4. **Economic & Reentrancy Safety**: The escrow funds-holding layer must enforce Checks-Effects-Interactions (CEI), reentrancy guards, pull-over-push settlement, and idempotent single-settlement guarantees.

---

## 2. Threat Vector Matrix

The following table comprehensively details the nine threat vectors required by Phase 5.3.1, establishing concrete mitigations and specifying whether enforcement belongs on-chain, off-chain, or in a hybrid coordination layer.

| Threat ID | Threat Category | Threat Description & Attack Scenario | Severity | Enforcement Layer | Concrete Architectural Mitigation | Residual Risk & Edge Cases |
| :---: | :--- | :--- | :---: | :---: | :--- | :--- |
| **TH-01** | **Unauthorized Job Transitions & Validation Requests** | An attacker attempts to transition a job (e.g. calling `acceptJob`, `submitJob`, or `settleJob`) or trigger a validation request on behalf of a counterparty without authorization. | **CRITICAL** | **On-Chain & Hybrid** | 1. **Escrow Transitions**: `accept` and `submit` strictly require `msg.sender == getAgentWallet(providerAgentId)` or a valid EIP-712 signature matching that wallet.<br>2. **Validation Registry Authorization (Gate 1)**: `AegisValidationRegistry.validationRequest` verifies `ownerOf(agentId)`, `getApproved(agentId)`, or `isApprovedForAll(owner, msg.sender)`. It does *not* read `getAgentWallet`. Operational agentWallets distinct from the owner must be granted standard ERC-721 operator approval beforehand; otherwise calls revert on-chain. | Key compromise of the operational wallet allows unauthorized actions until revoked via `unsetAgentWallet` or ERC-721 approval revocation. |
| **TH-02** | **Client / Provider Impersonation** | A malicious agent claims to represent an agent ID on the marketplace or in a job agreement without controlling the registered NFT or `agentWallet`. | **CRITICAL** | **On-Chain** | The Identity Registry cleanly binds `ownerOf(agentId)` and `getAgentWallet(agentId)`. Proposing, accepting, and submitting tasks require cryptographic signatures verified against `getAgentWallet(agentId)`. If wallet is unset or address(0), actions revert. | Social-engineering or off-chain spoofing outside signed protocol envelopes. |
| **TH-03** | **Deadline Manipulation** | An attacker attempts to front-run, retroactively alter, or manipulate deadlines (acceptance, submission, validation) to force premature refunds or block payments. | **HIGH** | **On-Chain** | All deadlines (`acceptance_deadline`, `submission_deadline`, `validation_deadline`) are strictly immutable once a job is created. The contract relies exclusively on `block.timestamp`. Deadline extensions require a co-signed `DeadlineExtension` EIP-712 amendment from BOTH client and provider. | Miner/validator timestamp manipulation on EVM chains is bounded to <= 15 seconds, negligible for task deadlines measured in hours/days. |
| **TH-04** | **Replay & Duplicate Submissions** | An attacker intercepts a valid deliverable submission, acceptance payload, or feedback transaction and replays it across a different job or network. | **HIGH** | **On-Chain** | All signed messages adhere to EIP-712 typed structured data incorporating `domainSeparator(name, version, chainId, verifyingContract)` and a unique `jobId`. Escrow marks `submission_hash` and `settled` flags idempotently, causing duplicate submissions to revert. | Non-replayable within EVM boundaries; deliverable contents may be copied off-chain if not encrypted. |
| **TH-05** | **Validator Compromise or Collusion** | A malicious provider colludes with the assigned validator to approve inadequate or fraudulent deliverables, or a corrupt validator extorts a provider for passing scores. | **CRITICAL** | **Hybrid** | 1. **Cryptographic Validation Binding (Gate 2)**: Canonical `requestHash = keccak256(abi.encode(jobId, providerAgentId, validatorAddress, submissionHash))` binds validation results strictly to the designated validator and deliverable.<br>2. **Validator Concentration Penalty**: Deterministic Trust Engine tracks Herfindahl-Hirschman Index (HHI) of validators; repeat validations between the same pair suffer sharp score discounting.<br>3. **Designated Arbiter Escalation (Gate 3)**: Disputed or extortionate outcomes can be challenged within the 24-hour challenge window without complex bond lifecycles. | Bribery in isolated, high-value one-off jobs where stake penalty is outweighed by job value. |
| **TH-06** | **Malicious or Unavailable AI Evaluator** | An attacker feeds prompt injection into task descriptions to force a false high trust score, or the Gemini AI API suffers an outage. | **MEDIUM** | **Off-Chain** | 1. **Deterministic Authority**: AI output has zero authority over trust scores or transaction execution; the deterministic formula is authoritative.<br>2. **Strict Sanitization**: Prompt injection defenses isolate task descriptions in sandboxed context.<br>3. **Graceful Fallback**: If AI is offline, system returns `ai_status: UNAVAILABLE` while deterministic trust and discovery remain 100% operational. | AI narrative summary may be absent during external LLM outages, but core protocol remains functional. |
| **TH-07** | **RPC Failure & Stale Evidence** | An RPC node drops requests during pre-hire evaluation, returning partial records or stale evidence snapshots. | **HIGH** | **Off-Chain Gateway** | 1. **Fail-Closed Semantics**: RPC errors raise structured `502 RPC_ERROR` and abort job creation. Under no circumstances is an RPC failure treated as an empty registry or clean record.<br>2. **Snapshot Freshness Guard**: Evidence snapshots record block numbers; snapshots older than 1,000 blocks are rejected as stale. | Network latency or persistent testnet congestion delaying state verification. |
| **TH-08** | **Reentrancy & Double Settlement** | A malicious provider contract attempts reentrancy during escrow payout, or an attacker attempts to claim both a completion payout and an expired refund. | **CRITICAL** | **On-Chain** | 1. **ReentrancyGuard**: OpenZeppelin nonReentrant applied on all escrow exits.<br>2. **Checks-Effects-Interactions (CEI)**: Internal state set to `SETTLED` before any token transfer.<br>3. **Pull-Over-Push**: Balances credited to internal withdrawal ledger or direct transfer to verified wallet only. | Flaws in external ERC-20 token transfer hooks if non-standard tokens are used (mitigated by token whitelisting). |
| **TH-09** | **Disputes & Ambiguous Acceptance Criteria** | Client refuses to accept valid work due to subjective criteria, or deliverable meets letter of prompt but fails user expectations. | **MEDIUM** | **Hybrid** | 1. **Structured Criteria Bounding**: Acceptance criteria restricted to deterministic, machine-verifiable assertions (e.g. test pass rates, formal verification outputs, schema validation).<br>2. **Designated Arbiter Ruling (Gate 3)**: Either party may raise a dispute to the designated arbiter within the 24-hour challenge window. The arbiter issues a binding ruling (`CLIENT_WINS`, `PROVIDER_WINS`, or `SPLIT`), with a 7-day inactivity timeout fallback to client refund. | Inherent subjectivity in tasks without formal verification criteria. |

---

## 3. Cryptographic Verification & Signature Schemes

### 3.1 EIP-712 Structured Data Hashing
To prevent signature reuse across chains, versions, and contracts, all off-chain authorizations adhere strictly to EIP-712.

#### EIP-712 Domain Separator
```solidity
bytes32 public constant DOMAIN_TYPEHASH = keccak256(
    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
);

bytes32 public immutable DOMAIN_SEPARATOR = keccak256(
    abi.encode(
        DOMAIN_TYPEHASH,
        keccak256(bytes("AegisAgentHiringEscrow")),
        keccak256(bytes("1")),
        block.chainid, // 10143 on Monad Testnet
        address(this)
    )
);
```

#### EIP-712 Type Hashes
```solidity
bytes32 public constant JOB_SPEC_TYPEHASH = keccak256(
    "JobSpecification(bytes32 jobId,uint256 clientAgentId,uint256 providerAgentId,bytes32 taskHash,uint256 rewardAmount,address rewardToken,uint64 acceptanceDeadline,uint64 submissionDeadline,uint64 validationDeadline,address validatorAddress,uint8 minAcceptanceScore,bytes32 prehireTrustSnapshotHash)"
);

bytes32 public constant ACCEPT_JOB_TYPEHASH = keccak256(
    "AcceptJob(bytes32 jobId,uint256 providerAgentId,uint256 nonce,uint64 timestamp)"
);

bytes32 public constant SUBMIT_JOB_TYPEHASH = keccak256(
    "SubmitJob(bytes32 jobId,uint256 providerAgentId,bytes32 submissionHash,string submissionURI,uint256 nonce,uint64 timestamp)"
);
```

### 3.2 Deliverable Content-Hash Verification
1. **Off-Chain Payload Hashing**: The provider must compute the SHA3-256 / Keccak-256 hash of the uncompressed deliverable:
   $$\text{submissionHash} = \text{keccak256}(\text{deliverableBytes})$$
2. **On-Chain Commitment**: When transitioning to `SUBMITTED`, `submissionHash` is immutably committed on-chain.
3. **Validator Audit**: The validator fetches the deliverable from `submissionURI`, independently computes $\text{keccak256}(\text{downloadedBytes})$, and asserts equality with `submissionHash` before evaluating criteria. If the hash mismatches, validation immediately fails with score `0`.

---

## 4. Sybil & Collusion Defense in Reputation & Validation

The interaction between `AegisValidationRegistry` and `AegisReputationRegistry` introduces potential economic vectors for reputation farming and collusion. AegisAgent employs a multi-tiered defense:

```
+----------------------------------------------------------------------------------------------------+
|                                    COLLUSION & SYBIL RESISTANCE ARCHITECTURE                       |
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
|   +---------------------------------------------------------------------------------------------+  |
|   | 1. On-Chain Constraints (AegisReputationRegistry & AegisValidationRegistry)                 |  |
|   |    - Anti-Self-Feedback: Reverts if msg.sender == ownerOf(agentId)                         |  |
|   |    - Unique Request Hashes: requestHash prevents duplicate or replay validations            |  |
|   |    - Bounded Feedback: Scaled integers (int128) with explicit decimal definitions           |  |
|   +---------------------------------------------------------------------------------------------+  |
|                                                  |                                                 |
|                                                  v                                                 |
|   +---------------------------------------------------------------------------------------------+  |
|   | 2. Deterministic Trust Engine Discounting (Aegis Trust Engine)                              |  |
|   |    - Herfindahl-Hirschman Index (HHI):                                                      |  |
|   |         HHI = \sum_{i=1}^{k} s_i^2, where s_i is reviewer i's share of total reviews        |  |
|   |    - If HHI > 0.35, high concentration risk triggers severe trust score discounting        |  |
|   |    - Minimum Unique Reviewers: High global trust requires >= 5 unique reviewing agents      |  |
|   |    - Recency Decay: Older feedback exponentially decays over a 90-day half-life             |  |
|   +---------------------------------------------------------------------------------------------+  |
|                                                  |                                                 |
|                                                  v                                                 |
|   +---------------------------------------------------------------------------------------------+  |
|   | 3. Economic Cost of Farming                                                                 |  |
|   |    - Every valid job settlement incurs gas and minimum escrow lockup.                       |  |
|   |    - Circular farming between Agent A and Agent B quickly hits HHI penalty limits,          |  |
|   |      rendering repeated transactions economically negative.                                 |  |
|   +---------------------------------------------------------------------------------------------+  |
+----------------------------------------------------------------------------------------------------+
```

---

## 5. Escrow Financial Security & Double-Settlement Defense

### 5.1 Checks-Effects-Interactions (CEI) Implementation Pattern
All state-modifying settlement routines must strictly adhere to CEI to neutralize reentrancy:

```solidity
function settleCompletedJob(bytes32 jobId) external nonReentrant {
    Job storage job = _jobs[jobId];
    
    // 1. CHECKS
    require(job.status == JobStatus.VALIDATING, "Invalid status");
    require(!job.settled, "Job already settled");
    
    // Cryptographic validation binding check (Gate 2)
    bytes32 expectedRequestHash = keccak256(
        abi.encode(jobId, job.providerAgentId, job.validatorAddress, job.submissionHash)
    );
    require(job.validationRequestHash == expectedRequestHash, "Request hash mismatch");

    // Read attestation from deployed AegisValidationRegistry
    (
        address actualValidator,
        uint256 actualAgentId,
        uint8 responseScore,
        bytes32 actualResponseHash,
        string memory tag,
        uint256 lastUpdate
    ) = validationRegistry.getValidationStatus(expectedRequestHash);

    require(lastUpdate > 0, "Validation not completed");
    require(actualValidator == job.validatorAddress, "Validator mismatch");
    require(actualAgentId == job.providerAgentId, "Agent ID mismatch");
    require(lastUpdate <= job.validationDeadline, "Validation response expired");
    require(lastUpdate >= job.submissionTimestamp, "Validation predates submission");
    require(responseScore >= job.minAcceptanceScore, "Validation score insufficient");
    
    // 2. EFFECTS
    job.status = JobStatus.COMPLETED;
    job.settled = true; // Prevents double settlement
    
    address providerWallet = identityRegistry.getAgentWallet(job.providerAgentId);
    require(providerWallet != address(0), "Provider operational wallet unset");
    
    // Exact fee arithmetic (Section 7.2)
    uint256 validatorFee = (job.rewardAmount * job.validatorFeeBps) / 10000;
    uint256 providerPayout = job.rewardAmount - validatorFee;
    
    emit JobSettled(jobId, job.providerAgentId, providerWallet, providerPayout, validatorFee);
    
    // 3. INTERACTIONS
    if (job.rewardToken == address(0)) {
        if (validatorFee > 0) {
            (bool vSuccess, ) = job.validatorAddress.call{value: validatorFee}("");
            require(vSuccess, "Validator fee transfer failed");
        }
        (bool pSuccess, ) = providerWallet.call{value: providerPayout}("");
        require(pSuccess, "Provider payout transfer failed");
    } else {
        if (validatorFee > 0) {
            IERC20(job.rewardToken).safeTransfer(job.validatorAddress, validatorFee);
        }
        IERC20(job.rewardToken).safeTransfer(providerWallet, providerPayout);
    }
}
```

### 5.2 Double-Settlement Invariant
- **Invariant**: For any `jobId`, the total funds transferred out of Escrow (payout + refund) can **NEVER** exceed the initial deposited `reward_amount`.
- **Proof**: `job.settled` is set to `true` atomically within the same EVM transaction prior to balance transfers. Both `settleCompletedJob` and `refundExpiredJob` assert `!job.settled`. Execution paths are mutually exclusive.

---

## 6. Dispute Resolution Architecture (Gate 3 — Designated Arbiter Model)

While the primary hiring pipeline relies on automated validator attestations, edge cases (unresponsive validators, corrupt validations, or ambiguous specifications) require a deterministic dispute resolution architecture. AegisAgent employs a **Designated Arbiter Model** optimized for hackathon scope, completely avoiding complex bonded challenge pool lifecycles.

### 6.1 Dispute Sequence & Governance

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Provider
    participant Escrow as Aegis Escrow
    participant Arbiter as Designated Arbiter

    Note over Client, Provider: Job in VALIDATING or Challenge Window (FAILED / EXPIRED)
    alt Unresponsive Validator
        Provider->>Escrow: raiseDispute(jobId, justificationURI) [block.timestamp > validationDeadline]
    else Contested Validation Failure
        Provider->>Escrow: raiseDispute(jobId, justificationURI) [Within 24h Challenge Window]
    else Contested Fraudulent Pass
        Client->>Escrow: raiseDispute(jobId, justificationURI) [Within 24h Challenge Window]
    end

    Escrow->>Escrow: status = DISPUTED; funds locked
    Escrow-->>Client: JobDisputed(jobId, caller, justificationURI)
    Escrow-->>Provider: JobDisputed(jobId, caller, justificationURI)

    alt Arbiter Issues Ruling (Within 7 Days)
        Arbiter->>Escrow: resolveDispute(jobId, ruling, rulingURI)
        Escrow->>Escrow: settled = true; status = SETTLED
        alt Ruling == CLIENT_WINS (0)
            Escrow-->>Client: 100% Refund (rewardAmount)
        else Ruling == PROVIDER_WINS (1)
            Escrow-->>Provider: providerPayout (rewardAmount - validatorFee)
            Escrow-->>Arbiter: validatorFee (to arbiter/designated validator)
        else Ruling == SPLIT (2)
            Escrow-->>Client: 50% Refund
            Escrow-->>Provider: 50% Payout
        end
    else Inactivity Timeout (After 7 Days)
        Client->>Escrow: timeoutDispute(jobId) [block.timestamp > disputeTimestamp + 7 days]
        Escrow->>Escrow: settled = true; status = REFUNDED
        Escrow-->>Client: 100% Refund
    end
```

### 6.2 Arbiter Rulings & Timeout Specification

| Parameter / Rule | Specification |
| :--- | :--- |
| **Arbiter Authorization** | Immutable address `designatedArbiter` configured at Escrow contract deployment or job creation. Only `msg.sender == job.designatedArbiter` can execute `resolveDispute`. |
| **Challenge Eligibility** | Either `clientAgentId` or `providerAgentId` (via operational wallet) can raise disputes. Non-counterparties revert. |
| **Challenge Window** | - For unresponsive validators: callable whenever `block.timestamp > validationDeadline` while status is `VALIDATING`.<br>- For completed/failed validations: callable within 24 hours of status transition (`challengeDeadline = validationTimestamp + 24 hours`). |
| **Permitted Rulings** | `CLIENT_WINS` (0): 100% refund to client.<br>`PROVIDER_WINS` (1): Provider receives net reward (`rewardAmount - validatorFee`); validator fee paid.<br>`SPLIT` (2): 50% refund to client, 50% payout to provider (no validator fee deducted). |
| **Inactivity Timeout** | If arbiter does not rule within **7 days** (`DISPUTE_TIMEOUT = 7 days`), either counterparty can trigger `timeoutDispute(jobId)`, releasing a **100% refund to the client**. |
| **No Challenge Bonds** | Zero collateral required to file or dispute. Avoids staking, slashing, or bond recovery griefing vectors in hackathon contracts. |

---

## 7. Security Verification & Audit Checklist

Before deploying any smart contract or orchestrator component in subsequent phases, the following checklist must be satisfied:

- [ ] **EIP-712 Conformance**: Domain separators include `chainId = 10143` and contract address; all structs strictly typed.
- [ ] **Validation Registry Requester Authorization (Gate 1)**: Operational wallet verified to be `ownerOf(agentId)` or granted operator approval via `approve(agentWallet, agentId)` / `setApprovalForAll(agentWallet, true)`.
- [ ] **Exact Job-to-Validation Binding (Gate 2)**: Canonical `requestHash` cryptographically verified; all 6 escrow attestation invariants enforced.
- [ ] **Designated Arbiter Authorization (Gate 3)**: Immutable arbiter address; rulings restricted to enum bounds; 7-day inactivity timeout fallback enforced.
- [ ] **Exact Validator Fee Math**: Integer arithmetic with non-negative guarantee: `validatorFee = (reward * bps)/10000`, `providerPayout = reward - validatorFee`.
- [ ] **Reentrancy Immunity**: All escrow exits protected with OpenZeppelin `ReentrancyGuard` and CEI.
- [ ] **Zero Timestamp Vulnerability**: All deadline comparisons use strict inequalities (`block.timestamp <= deadline`).
- [ ] **Fail-Closed RPC Strategy**: Blockchain evidence adapter never falls back to empty default datasets on network/RPC errors.
- [ ] **Anti-Self-Feedback Enforced**: `AegisReputationRegistry` prevents self-reviewing.
- [ ] **Deterministic Primacy**: AI output has zero execution authority over smart contracts or deterministic scores.
- [ ] **Idempotent Single Settlement**: Escrow boolean flag `settled` strictly prevents double-payouts.
