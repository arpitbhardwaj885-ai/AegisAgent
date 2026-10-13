# AegisAgent Hiring Escrow Architecture & Implementation (Phase 5.3.2.1)

## 1. Executive Summary & Contract Responsibilities

`AegisHiringEscrow.sol` is the dedicated, production-minded smart contract governing agent-to-agent job escrow, task deliverable commitment, decentralized validation verification, and deterministic financial settlement on Monad Testnet (Chain ID `10143`).

### Core Contract Responsibilities
1. **Native MON Escrow Custody**: Holds native MON locked at job creation (`msg.value == rewardAmount`). Strictly forbids unauthorized withdrawals and arbitrary transfers.
2. **Cryptographic Identity Binding**: Verifies counterparty authorization using the deployed `AegisIdentityRegistry` (`0xa7A27f96d4e8f58d701D42229d5097A69694Ca4B`).
3. **Deliverable Commitment**: Locks the provider's uncompressed deliverable hash (`submissionHash`) on-chain.
4. **Validation Attestation Verification**: Reads validation results directly from the deployed `AegisValidationRegistry` (`0x802DE575B528453C8208d5201e27464d63970e2b`) using a deterministic, canonical request hash.
5. **Exact Fee & Payout Settlement**: Atomically executes provider payouts and validator fees according to basis points math (`0 - 5000 bps`) following the Checks-Effects-Interactions (CEI) pattern.
6. **Deterministic Dispute Resolution**: Implements the Designated Arbiter Model with a 24-hour validation challenge window and a 7-day arbiter inactivity timeout fallback to client refund.

---

## 2. Trust Boundaries & Separation of Concerns

```
+----------------------------------------------------------------------------------------------------+
|                                      AEGISAGENT TRUST BOUNDARIES                                    |
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
|   +------------------------------------+          +--------------------------------------------+   |
|   |   AegisIdentityRegistry (Deployed) |          |      AegisValidationRegistry (Deployed)    |   |
|   |   - ownerOf(agentId)               |          |      - validationRequest(...)              |   |
|   |   - getAgentWallet(agentId)        |          |      - validationResponse(...)             |   |
|   +-----------------+------------------+          |      - getValidationStatus(requestHash)    |   |
|                     ^                             +---------------------+----------------------+   |
|                     | (Read-Only Identity Lookups)                      | (Read-Only Status Lookups)   |
|                     |                                                   |                          |
|   +-----------------+---------------------------------------------------+----------------------+   |
|   |                                                                                            |   |
|   |                           AegisHiringEscrow (Dedicated Escrow Contract)                    |   |
|   |                           - Holds Native MON Escrow Funds                                  |   |
|   |                           - Enforces 11-State Lifecycle Machine                            |   |
|   |                           - Atomically Splits Payouts & Fees                               |   |
|   |                           - Arbitrates Disputes via Designated Arbiter                     |   |
|   |                                                                                            |   |
|   +--------------------------------------------------------------------------------------------+   |
|                                                                                                    |
|   +------------------------------------+                                                           |
|   |   AegisReputationRegistry (Deploy) | <--- Post-job feedback explicitly submitted by parties    |
|   |   - giveFeedback(jobId, ...)       |      (NO automatic or fabricated feedback from escrow)    |
|   +------------------------------------+                                                           |
+----------------------------------------------------------------------------------------------------+
```

- **Read-Only Registry Coupling**: Escrow never writes to or modifies the state of `AegisIdentityRegistry` or `AegisValidationRegistry`. It queries `ownerOf`, `getAgentWallet`, and `getValidationStatus` strictly via read-only external calls.
- **ERC-8004 Segregation**: Identity, reputation, and validation registries maintain pure attestation logs. Stateful funds handling and escrow mechanics are completely isolated within `AegisHiringEscrow`.
- **Feedback Decoupling**: Escrow does not automatically mint or record reputation feedback. Post-job feedback is submitted explicitly by counterparties via `AegisReputationRegistry.giveFeedback`, using `jobId` as `feedbackHash`.

---

## 3. Hiring State Machine & Transitions

`AegisHiringEscrow` enforces 12 distinct, non-overlapping lifecycle states (`UNINITIALIZED` through `REFUNDED`). Terminal states are unambiguously distinct and consistently set `settled = true`.

```
       +-------------------------------------------------------------------------------+
       |                                                                               |
       v                                                                               |
    [CREATED] ----(rejectJob)-------------------------------------> [REJECTED]         |
       |      ----(cancelJob)-------------------------------------> [CANCELLED]        | (Refund
       |      ----(expireJob: now > acceptanceDeadline)-----------> [EXPIRED]          |  Client)
       |                                                                               |
(acceptJob)                                                                            |
       v                                                                               |
   [ACCEPTED] ---(expireUnsubmittedJob: now > subDeadline)--------> [EXPIRED_UNSUB] ---+
       |
(submitJob)
       v
  [SUBMITTED] 
       |
(startValidation)
       v
  [VALIDATING] ---(settleCompletedJob: score >= minScore)--------> [COMPLETED] (Provider payout + Validator fee accrued)
       |
       +----------(recordValidationFailure: score < minScore)-----> [FAILED_VALIDATION]
       |                                                                   |
       |                                      (now > challengeDeadline)    | (raiseDispute within 24h)
       |                                      claimFailedValidationRefund  v
       |                                                    v         [DISPUTED]
       |                                               [REFUNDED]          |
       |                                                    ^              +--(resolveDispute: CLIENT_WINS -> REFUNDED)
       |                                                    |              +--(resolveDispute: PROVIDER/SPLIT -> COMPLETED)
       +----------(raiseDispute: unresp / overwrite)--------+              +--(timeoutDispute: 7 days -> REFUNDED)
```

### Detailed Transition Specifications

| State Transition | Caller Authorization | Preconditions | Side Effects & Payouts |
| :--- | :--- | :--- | :--- |
| `[*] -> CREATED` | Client (`ownerOf` or `getAgentWallet`) | `msg.value == rewardAmount > 0`, deadlines ordered: `now < accept < sub < val`, `feeBps <= 5000` | Escrow funds locked. Job registered. `acceptanceDeadline` timer starts. |
| `CREATED -> ACCEPTED` | Provider `agentWallet` | `block.timestamp <= acceptanceDeadline` | Status set to `ACCEPTED`. `submissionDeadline` timer starts. |
| `CREATED -> REJECTED` | Provider `agentWallet` | `block.timestamp <= acceptanceDeadline`, `!settled` | `status = REJECTED`, `settled = true`. 100% refund transferred to Client. |
| `CREATED -> CANCELLED` | Client (`msg.sender == client`) | Pre-acceptance only, `!settled` | `status = CANCELLED`, `settled = true`. 100% refund transferred to Client. |
| `CREATED -> EXPIRED` | Anyone (Keeper / Client) | `block.timestamp > acceptanceDeadline`, `!settled` | `status = EXPIRED`, `settled = true`. 100% refund transferred to Client. |
| `ACCEPTED -> SUBMITTED` | Provider `agentWallet` | `block.timestamp <= submissionDeadline`, `submissionHash != 0` | Locks deliverable hash. Derives canonical `validationRequestHash`. |
| `ACCEPTED -> EXPIRED_UNSUBMITTED` | Anyone (Keeper / Client) | `block.timestamp > submissionDeadline`, `!settled` | `status = EXPIRED_UNSUBMITTED`, `settled = true`. 100% refund to Client. |
| `SUBMITTED -> VALIDATING` | Anyone (Provider / Client / Keeper) | Validation request confirmed registered on `AegisValidationRegistry` | Verifies `validatorAddress` and `agentId` match on registry. |
| `VALIDATING -> COMPLETED` | Anyone (Provider / Client / Keeper) | `lastUpdate > 0`, `lastUpdate <= valDeadline`, `lastUpdate >= subTime`, `score >= minScore` | `status = COMPLETED`, `settled = true`. Payout: net reward pushed to Provider `agentWallet`, fee accrued to `pendingValidatorFees`. |
| `VALIDATING -> FAILED_VALIDATION` | Anyone (Keeper / Client) | `lastUpdate > 0`, `lastUpdate <= valDeadline`, `score < minScore` | `status = FAILED_VALIDATION`, `settled = false`. Sets `challengeDeadline = block.timestamp + 24 hours`. |
| `FAILED_VAL -> REFUNDED` | Anyone (Keeper / Client) | `block.timestamp > challengeDeadline`, `!settled` | `status = REFUNDED`, `settled = true`. 100% refund transferred to Client. |
| `VALIDATING / FAILED_VAL -> DISPUTED` | Client or Provider `agentWallet` | During `VALIDATING`, or within 24h challenge window after `FAILED_VALIDATION` | `status = DISPUTED`. Funds frozen. Records `disputeTimestamp`. |
| `DISPUTED -> REFUNDED` | Designated Arbiter (`designatedArbiter`) | `job.status == DISPUTED`, `!settled`, `ruling == CLIENT_WINS` | `status = REFUNDED`, `settled = true`. 100% refund transferred to Client. Does NOT require provider wallet. |
| `DISPUTED -> COMPLETED` | Designated Arbiter (`designatedArbiter`) | `job.status == DISPUTED`, `!settled`, `ruling == PROVIDER_WINS` or `SPLIT` | `status = COMPLETED`, `settled = true`. Provider payout pushed to `agentWallet`; validator fee accrued or waived. Requires configured `agentWallet`. |
| `DISPUTED -> REFUNDED` | Anyone (Keeper / Client) | `block.timestamp > disputeTimestamp + 7 days`, `!settled` | Timeout fallback: `status = REFUNDED`, `settled = true`. 100% refund transferred to Client. |

---

## 4. Exact Validation Cryptographic Binding

To prevent replay attacks across jobs, stale updates, or score spoofing, each job immutably binds to a canonical `validationRequestHash`:

$$\text{requestHash} = \text{keccak256}(\text{abi.encode}(\text{jobId}, \text{providerAgentId}, \text{validatorAddress}, \text{submissionHash}))$$

### Six Invariant Assertions in `settleCompletedJob`
When settling a completed job, Escrow unpacks all 6 return fields from `AegisValidationRegistry.getValidationStatus(requestHash)` and asserts:

```solidity
(
    address actualValidator,
    uint256 actualAgentId,
    uint8 responseScore,
    bytes32 actualResponseHash,
    string memory tag,
    uint256 lastUpdate
) = validationRegistry.getValidationStatus(expectedRequestHash);

require(lastUpdate > 0, "No validation response recorded");
require(actualValidator == job.validatorAddress, "Validator mismatch");
require(actualAgentId == job.providerAgentId, "Agent ID mismatch");
require(lastUpdate <= job.validationDeadline, "Validation response expired");
require(lastUpdate >= job.submissionTimestamp, "Validation predates submission");
require(responseScore >= job.minAcceptanceScore, "Validation score insufficient");
```

---

## 5. Critical Overwrite Case & Dispute Handling

### The On-Chain Overwrite Mechanism
In the deployed `AegisValidationRegistry.sol`:
- `validationResponse` overwrites storage fields (`response`, `responseHash`, `tag`) and updates `lastUpdate = uint64(block.timestamp)` on each call by the validator.
- The contract storage records **only the latest response**. Historical responses are preserved solely in emitted `ValidationResponse` blockchain events.

### Overwrite Scenario & Automated Settlement
Consider the scenario:
1. Validator submits a passing response ($\text{score} \ge \text{minScore}$) at timestamp $t_1 \le \text{validationDeadline}$.
2. Validator subsequently submits a modified response at timestamp $t_2 > \text{validationDeadline}$ before settlement occurs.
3. In `AegisValidationRegistry`, `lastUpdate` is overwritten with $t_2$.
4. When `settleCompletedJob(jobId)` is invoked, the check:
   ```solidity
   require(lastUpdate <= job.validationDeadline, "Validation response expired");
   ```
   **fails-closed and reverts**.

### The Deterministic Resolution Flow
The provider is **never permanently locked or stuck**:
1. The provider invokes `raiseDispute(jobId, justificationURI)` directly while `job.status == JobStatus.VALIDATING`.
2. Escrow transitions the job to `DISPUTED`, freezing funds for arbitration.
3. **Arbiter Evidence Assumption**: The Designated Arbiter inspects the Monad Testnet event log for the indexed `ValidationResponse` event emitted at block timestamp $t_1 \le \text{validationDeadline}$ containing a score $\ge \text{minAcceptanceScore}$.
4. The Arbiter calls `resolveDispute(jobId, Ruling.PROVIDER_WINS, rulingURI)`.
5. Escrow marks `job.settled = true`, transfers `providerPayout` to the provider, and pays `validatorFee` to the validator.

> [!NOTE]
> Historical responses are **not accessible via on-chain storage getters** on `AegisValidationRegistry`. The escrow contract does not pretend to verify past overwritten responses on-chain; the designated arbiter performs off-chain event log verification to issue a binding on-chain ruling.

---

## 6. Payment, Fee, and Pull-Payment Accounting

### Validator Fee Pull-Payment Architecture (SEC-02 Remediation)
To prevent unpayable or malicious validator contracts from griefing or locking provider payouts:
1. **Liability Accrual**: During `settleCompletedJob` and `resolveDispute(PROVIDER_WINS)`, the validator fee is **not pushed** via low-level call. Instead, it is recorded as an on-chain liability:
   ```solidity
   pendingValidatorFees[job.validatorAddress] += validatorFee;
   totalPendingValidatorFees += validatorFee;
   emit ValidatorFeeAccrued(jobId, job.validatorAddress, validatorFee);
   ```
2. **Provider Payout Decoupling**: The provider's net payout (`providerPayout`) is transferred immediately to `providerWallet` without depending on validator reception.
3. **Withdrawal Functions**: Validators withdraw their accrued fees via:
   - `withdrawValidatorFees()`: Transfers caller's accrued fees directly to `msg.sender`.
   - `withdrawValidatorFeesTo(address payable recipient)`: Allows the validator to route fees to a designated cold wallet or payout address.
4. **CEI & Reentrancy Protection**: Both withdrawal functions are protected by `nonReentrant` and zero out caller liability before initiating native transfers.
5. **Preserved Liabilities**: If a withdrawal transfer reverts (e.g. unpayable recipient), the transaction reverts cleanly, preserving `pendingValidatorFees` intact.
6. **Undercollateralization Invariant**:
   $$\text{address}(\text{this}).\text{balance} \ge \sum \text{activeJobRewards} + \text{totalPendingValidatorFees}$$

### Basis Points Integer Arithmetic & Fee Cap
Validator fees are expressed in basis points ($1 \text{ bps} = 0.01\%$), strictly bounded:
$$0 \le \text{validatorFeeBps} \le 5000 \quad (0\% \text{ to } 50\% \text{ maximum})$$

For `JobStatus.COMPLETED` and `Ruling.PROVIDER_WINS`:
$$\text{validatorFee} = \left\lfloor \frac{\text{rewardAmount} \times \text{validatorFeeBps}}{10000} \right\rfloor$$
$$\text{providerPayout} = \text{rewardAmount} - \text{validatorFee}$$

### Invariant: Exact Fund Conservation
$$\text{providerPayout} + \text{validatorFee} \equiv \text{rewardAmount}$$
No fractional token dust is stranded or lost.

### Split Ruling (50/50) Dust Handling
Under `Ruling.SPLIT`:
- The validator fee is **waived** ($0$).
- Funds are divided equally with odd-wei dust conservation:
  $$\text{clientRefund} = \lfloor \text{rewardAmount} / 2 \rfloor$$
  $$\text{providerPayout} = \text{rewardAmount} - \text{clientRefund}$$
  $$\text{clientRefund} + \text{providerPayout} \equiv \text{rewardAmount}$$

---

## 7. Registry & Wallet Authorization Model

1. **Client Authorization**:
   `createJob` requires `msg.sender == ownerOf(clientAgentId) || msg.sender == getAgentWallet(clientAgentId)`.
2. **Provider Authorization**:
   Operational actions (`acceptJob`, `submitJob`, and raising disputes) require:
   `msg.sender == identityRegistry.getAgentWallet(providerAgentId)`
   If the operational wallet is unset (`address(0)`), actions revert.
3. **Dispute Resolution Decoupling (SEC-01 Remediation)**:
   In `resolveDispute`:
   - `Ruling.CLIENT_WINS` does **not** query or require `providerWallet`. If the provider's NFT was transferred or the operational wallet was unset, the arbiter can still issue a full refund to the client.
   - `Ruling.PROVIDER_WINS` and `Ruling.SPLIT` strictly enforce `providerWallet != address(0)`, ensuring payouts are never burned or sent to address zero.
4. **Validation Registry Requester Authorization (Gate 1 Resolution)**:
   Calling `validationRequest` on `AegisValidationRegistry` checks:
   `msg.sender == ownerOf(agentId) || msg.sender == getApproved(agentId) || isApprovedForAll(owner, msg.sender)`
   The identity owner must grant ERC-721 operator approval (`setApprovalForAll` or `approve`) to the operational `agentWallet` before registering validation requests.

---

## 8. Known Limitations & Deferred Features

1. **Native MON Only**: The Phase 5.3.2 escrow supports native MON payments. ERC-20 token support is deferred to subsequent phases.
2. **Designated Arbiter Model**: Uses an authorized address (`designatedArbiter`) per contract/job. Multi-signature arbitration committees and decentralized bonded jury pools are deferred to avoid complex bond lifecycles.
3. **No Automatic Slashing**: Unsuccessful validation degrades reputation scores deterministically; it does not slash an agent's stake or NFT.
4. **Explicit Counterparty Feedback**: Escrow does not automatically log reputation feedback upon settlement. Counterparties submit feedback via `AegisReputationRegistry.giveFeedback`.

---

## 9. Backend Escrow Integration Architecture (Phase 5.3.2.2)

### 9.1 Overview & Separation of Concerns
Phase 5.3.2.2 integrates the verified `AegisHiringEscrow` architecture with AegisAgent's existing FastAPI backend in a strictly read-only, non-broadcasting manner.

```
+----------------------------------------------------------------------------------------------------+
|                                AEGISAGENT BACKEND ESCROW INTEGRATION                               |
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
|    FastAPI Routes (`/escrow/*`)                                                                    |
|    - GET /escrow/jobs/{job_id}                                                                     |
|    - GET /escrow/validators/{validator_address}/fees                                               |
|    - POST /escrow/jobs/prepare                                                                     |
|                 |                                                                                  |
|                 v                                                                                  |
|    EscrowAdapter (`app.trust.blockchain.escrow_adapter`)                                            |
|    - Decodes 23-field struct `Job`                                                                 |
|    - Maps numeric status enum (0..12) to human-readable strings                                    |
|    - Maps terminal states (`COMPLETED`, `REFUNDED`, `REJECTED`, `CANCELLED`, `EXPIRED`, etc.)       |
|    - Pull-payment fee liabilities (`pendingValidatorFees`, `totalPendingValidatorFees`)            |
|    - Canonical hash derivation (`deriveValidationRequestHash`, `taskHash`, `jobId`)                |
|                 |                                                                                  |
|                 v (Read-Only eth_call)                                                             |
|    AegisHiringEscrow Contract (Monad Testnet / Local Mock)                                         |
|    - Zero private keys in backend                                                                  |
|    - Zero transaction signing                                                                      |
|    - Zero transaction broadcasting                                                                 |
+----------------------------------------------------------------------------------------------------+
```

### 9.2 Supported API Endpoints

| Endpoint | Method | Parameters | Description | Error Handling |
| :--- | :--- | :--- | :--- | :--- |
| `/escrow/jobs/{job_id}` | `GET` | `job_id`: 32-byte hex string | Fetches on-chain job terms, status code (0–12), settlement flags, and deadlines. | `404 JOB_NOT_FOUND` if uninitialized, `503 ESCROW_NOT_CONFIGURED` if unset, `502 RPC_ERROR` on node failure. |
| `/escrow/validators/{validator_address}/fees` | `GET` | `validator_address`: Ethereum address | Queries individual pending validator fee liability and global pending liabilities. | `400 INVALID_REQUEST` on bad address, `503 ESCROW_NOT_CONFIGURED` if unset. |
| `/escrow/jobs/prepare` | `POST` | `JobPrepareRequest` JSON | Validates proposed parameters, enforces sequence deadlines, evaluates pre-hire trust, derives canonical hashes, and formats unsigned transaction payload. | `400 INVALID_REQUEST` on self-hire, fee > 5000 bps, score out of range, or inverted deadlines. |

### 9.3 Invariants & Security Guarantees
1. **Zero Transaction Broadcast**: The backend never initiates, signs, or broadcasts state-mutating transactions. All writes are constructed as unsigned parameter payloads for client wallet execution (e.g., MetaMask).
2. **Advisory AI Boundary**: AI reasoning remains explanatory and cannot authorize or trigger escrow settlement.
3. **Fail-Closed Configuration**: If `HIRING_ESCROW_ADDRESS` is not configured, the backend returns structured `503 ESCROW_NOT_CONFIGURED` without exposing secrets or stack traces.
4. **Terminal State Consistency**: All terminal states (`COMPLETED`, `REJECTED`, `CANCELLED`, `EXPIRED`, `EXPIRED_UNSUBMITTED`, `REFUNDED`) consistently map `is_terminal: true` and `settled: true`.

