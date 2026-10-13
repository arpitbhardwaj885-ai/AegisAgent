# AegisValidationRegistry Architecture

## A. Contract Responsibility
The `AegisValidationRegistry` is responsible for tracking validation requests made by agent owners against specific validators, and recording the subsequent responses from those validators. It acts as an on-chain verifiable ledger of an agent's claims and the validator's cryptographic attestations regarding those claims.

## B. Exact ERC-8004 Interface
The registry strictly adheres to the requested ERC-8004 draft signatures:
```solidity
function initialize(address identityRegistry_) external;
function getIdentityRegistry() external view returns (address);

function validationRequest(
    address validatorAddress,
    uint256 agentId,
    string calldata requestURI,
    bytes32 requestHash
) external;

function validationResponse(
    bytes32 requestHash,
    uint8 response,
    string calldata responseURI,
    bytes32 responseHash,
    string calldata tag
) external;

function getValidationStatus(bytes32 requestHash) external view returns (...);

function getSummary(
    uint256 agentId,
    address[] calldata validatorAddresses,
    string calldata tag
) external view returns (uint64 count, uint8 averageResponse);

function getAgentValidations(uint256 agentId) external view returns (bytes32[] memory);
function getValidatorRequests(address validatorAddress) external view returns (bytes32[] memory);
```

## C. Storage Structs & Mappings
The core state revolves around the `requestHash` as a globally unique identifier.

```solidity
struct ValidationRecord {
    address validatorAddress;
    uint256 agentId;
    uint8 response;       // 0-100
    bool hasResponse;     // Distinguishes between pending (no response) and failed (response=0)
    bytes32 responseHash;
    uint64 lastUpdate;    // Timestamp of the latest response
    string tag;
    bool exists;          // Ensures requestHash uniqueness and tracks existence
}

// Global lookup by request hash
mapping(bytes32 => ValidationRecord) private _validations;

// Indexes for view functions
mapping(uint256 => bytes32[]) private _agentValidations;
mapping(address => bytes32[]) private _validatorRequests;
```
*Note: `requestURI` and `responseURI` are emitted via events, reducing storage overhead.*

## D. Event Definitions
Strictly matching the ERC-8004 definitions:
```solidity
event ValidationRequest(
    address indexed validatorAddress,
    uint256 indexed agentId,
    string requestURI,
    bytes32 indexed requestHash
);

event ValidationResponse(
    address indexed validatorAddress,
    uint256 indexed agentId,
    bytes32 indexed requestHash,
    uint8 response,
    string responseURI,
    bytes32 responseHash,
    string tag
);
```

## E. Authorization Model
- **Initialization**: Strictly bound to the immutable `_deployer` set in the constructor.
- **validationRequest**: `msg.sender` must be the agent owner, an `isApprovedForAll` operator, or the `getApproved` operator (verified via `IERC721` view calls to the Identity Registry).
- **validationResponse**: `msg.sender` must perfectly match the `validatorAddress` stored in `_validations[requestHash]`.

## F. Validation Request Lifecycle
1. **Trigger**: Agent owner calls `validationRequest`.
2. **Auth**: Contract reads from `AegisIdentityRegistry`. Reverts if unauthorized.
3. **Collision Check**: Reverts if `_validations[requestHash].exists == true`.
4. **State Storage**: Initializes a new `ValidationRecord` with `exists = true` and `hasResponse = false`.
5. **Index Updates**: Pushes the `requestHash` to `_agentValidations[agentId]` and `_validatorRequests[validatorAddress]`.
6. **Emission**: Emits `ValidationRequest` (containing the heavy `requestURI`).

## G. Validation Response Lifecycle
1. **Trigger**: Assigned validator calls `validationResponse`.
2. **Auth**: Reverts if `msg.sender != record.validatorAddress`.
3. **Bounds**: Reverts if `response > 100`.
4. **State Update**: Updates `response`, `responseHash`, `tag`, sets `lastUpdate = uint64(block.timestamp)`, and flags `hasResponse = true`. 
5. **Emission**: Emits `ValidationResponse`.
*(Note: A validator can submit multiple times to the same `requestHash`, allowing for lifecycle transitions like Partial -> Final).*

## H. Summary Algorithm
The `getSummary` function iterates through `_agentValidations[agentId]`.
For each `requestHash`:
1. Check if `hasResponse == true`.
2. Apply `validatorAddresses` filter (if non-empty).
3. Apply `tag` filter (if non-empty).
4. If filters pass, accumulate `response` into a `sum` and increment `count`.
5. Return `count` and `sum / count`.

## I. Security Model
- **A. Initialization hijacking**: Protected by constructor-based `_deployer` immutability.
- **B. Unauthorized requests**: Strict identity ownership checks.
- **C. Unauthorized responses**: Enforced mapping `msg.sender == validatorAddress`.
- **D. Nonexistent requests**: Handled by reverting if `!record.exists`.
- **E. Duplicate requestHash**: Enforced by reverting on `validationRequest` if hash is already registered.
- **F. Invalid response**: Hard limit `require(response <= 100)`.
- **G. Validator = address(0)**: Blocked at request creation.
- **H/I. Agent Transfers/Operator Changes**: Requests stick to the `agentId`. Validators can still complete pending validations for transferred agents.
- **J. Repeated responses**: Handled smoothly by state overwrite logic.
- **L. Storage consistency**: Uniqueness logic ensures arrays accurately map to singleton records.
- **N/O. Reentrancy/External Calls**: Only trusted read-only `IERC721` queries. No reentrancy risks.
- **P. DOS arrays**: `getSummary` / `getAgentValidations` can theoretically hit block limits if an agent has thousands of requests, but are safe for off-chain RPCs.

## J. RequestHash Uniqueness Strategy
`requestHash` is treated as a globally unique identifier (UUID) for a validation event.
If two different agents submit the exact same `requestHash`, or an agent tries to resubmit it, the transaction will revert (`require(!_validations[requestHash].exists)`). If an agent genuinely needs to request validation for the exact same off-chain data again, they must salt their new `requestHash` off-chain to guarantee uniqueness.

## K. Gas / Scalability Considerations
The index arrays (`_agentValidations`, `_validatorRequests`) grow linearly and indefinitely. `getSummary` parses the array on-chain. This may lead to out-of-gas errors if executed in an on-chain transaction against an agent with extreme historical volume. It is designated as an acceptable architectural limit for a View function, intended for Indexers and off-chain clients.

## L. ERC-8004 Compatibility Assessment
The architecture achieves 100% compliance with the ERC-8004 draft standard interface for Validation Registries.

## M. Explicit List of Proposed Files
- `contracts/contracts/AegisValidationRegistry.sol`
- `contracts/test/AegisValidationRegistry.test.js`

## N. Open Questions / Design Decisions Requiring Approval
1. **Duplicate Validator Requests**: The `getSummary` logic currently aggregates *all* completed requests. If a validator validates the same agent 100 times, all 100 scores factor equally into the average. Is this the intended behavior, or should the summary only use the *latest* request per validator?
2. **Tag Matching**: Does `getSummary` tag matching need to be case-insensitive, or is exact byte-matching (`keccak256`) sufficient?
