# Deployment Record

## AegisIdentityRegistry

- **Network**: Monad Testnet
- **Chain ID**: 10143
- **Contract Name**: AegisIdentityRegistry
- **Contract Address**: `0xa7A27f96d4e8f58d701D42229d5097A69694Ca4B`
- **Deployment Transaction Hash**: `0xd80ee4841b87dac1ddf5874d9af471e784974d6103d69adcc24a5f4fda313f33`
- **Deployment Block**: 68167209
- **Deployer Public Address**: `0xA82832aB9BD6C11A8156c7273815D631F90D347a`
- **Deployment Timestamp**: 2026-10-04T16:49:44Z
- **ERC-8004 Compatibility Status**: Fully Compliant
- **Explorer Reference**: https://testnet.monadvision.com/tx/0xd80ee4841b87dac1ddf5874d9af471e784974d6103d69adcc24a5f4fda313f33

### Post-Deployment Verification

- **Test Registration agentId**: 1
- **Test Registration Transaction Hash**: `0x9e2de55c7c44528e85f9210d3409306eb2e92cd9a1ad6cbb495fad8f7b76e82b`
- **getAgentRegistry()**: `eip155:10143:0xa7a27f96d4e8f58d701d42229d5097a69694ca4b`

## AegisReputationRegistry

- **Network**: Monad Testnet
- **Chain ID**: 10143
- **Contract Name**: AegisReputationRegistry
- **Contract Address**: `0x387948228a43351F2D33E83Db22576F535c85C74`
- **Identity Registry Linked**: `0xa7A27f96d4e8f58d701D42229d5097A69694Ca4B`
- **Deployment & Init Transaction Hash**: `0x2be15fb943c8379b515f74139b3a975d22aaab680b1fb3e85a47ade51c022f3f`
- **Deployment Block**: 68444694
- **Verification Status**: SUCCESS (`getIdentityRegistry()` matched exactly)
- **Explorer Reference**: https://testnet.monadvision.com/tx/0x2be15fb943c8379b515f74139b3a975d22aaab680b1fb3e85a47ade51c022f3f

## AegisValidationRegistry

- **Network**: Monad Testnet
- **Chain ID**: 10143
- **Contract Name**: AegisValidationRegistry
- **Contract Address**: `0x802DE575B528453C8208d5201e27464d63970e2b`
- **Identity Registry Linked**: `0xa7A27f96d4e8f58d701D42229d5097A69694Ca4B`
- **Deployment Transaction Hash**: `0xce0eda544d5f6ccd89339f3f36f861cd9222a585c0fb34e1cf5c3614547fb2f9`
- **Deployment Block**: 68448570
- **Initialization Transaction Hash**: `0xc4a84f6ac270faaa8dc0ad9b218460bbf032652e000165930d950db97e3c25ef`
- **Initialization Block**: 68448580
- **Verification Status**: SUCCESS (`getIdentityRegistry()` matched exactly)
- **Explorer Reference**: https://testnet.monadvision.com/tx/0xce0eda544d5f6ccd89339f3f36f861cd9222a585c0fb34e1cf5c3614547fb2f9

### On-Chain Smoke Test

- **Test Agent ID**: 1
- **Test Validator Address**: `0x0674Bf234268358B5DcbD2c10cCBAFbef2AA7B1c`
- **Smoke-Test Request Hash**: `0x4bc47c147f44e22d4a04c9aef24993055fa06f06541d309a4c57346af6c0b8aa`
- **Smoke-Test Request Transaction Hash**: `0x9835517615634dcd71eccab7bdfce63f5739b9f3a2010bdd46f29152b5c9b040`
- **Smoke-Test Response Transaction Hash**: `0x143bdf61b747f10e5f89be9a3135e9c89fbb9a2ba6739ba4463ff269a688e1d0`
- **State Verification**: SUCCESS (all reads `getValidationStatus`, `getAgentValidations`, `getValidatorRequests`, `getSummary` returned exact matches)

## AegisHiringEscrow

- **Network**: Monad Testnet
- **Chain ID**: 10143
- **Contract Name**: AegisHiringEscrow
- **Contract Address**: `0x28243a3EA0c93CD5FbA6614EAff8980B4A8b0f29`
- **Identity Registry Linked**: `0xa7A27f96d4e8f58d701D42229d5097A69694Ca4B`
- **Validation Registry Linked**: `0x802DE575B528453C8208d5201e27464d63970e2b`
- **Default Arbiter Configured**: `0xA82832aB9BD6C11A8156c7273815D631F90D347a`
- **Deployer Public Address**: `0xA82832aB9BD6C11A8156c7273815D631F90D347a`
- **Deployment Transaction Hash**: `0x936dbb625842403a39ed82ee25b997bd726a5c27b2cff4cbff8734d79b15626c`
- **Deployment Block**: 70374434
- **Receipt Status**: `0x1` (Success)
- **Gas Used**: 3,418,138
- **Effective Gas Price**: 126.5625 gwei
- **Actual Deployment Cost**: 0.432608 MON
- **Deployment Timestamp**: 2026-10-12T10:32:19Z
- **Explorer Reference**: https://testnet.monadvision.com/tx/0x936dbb625842403a39ed82ee25b997bd726a5c27b2cff4cbff8734d79b15626c
- **Address Explorer Reference**: https://testnet.monadvision.com/address/0x28243a3EA0c93CD5FbA6614EAff8980B4A8b0f29

### Independent On-Chain Verification
- **Bytecode Size**: 15,299 bytes
- **identityRegistry()**: `0xa7A27f96d4e8f58d701D42229d5097A69694Ca4B` (VERIFIED)
- **validationRegistry()**: `0x802DE575B528453C8208d5201e27464d63970e2b` (VERIFIED)
- **defaultArbiter()**: `0xA82832aB9BD6C11A8156c7273815D631F90D347a` (VERIFIED)
- **MAX_VALIDATOR_FEE_BPS**: 5000 (50%)
- **CHALLENGE_WINDOW**: 86400 (24h)
- **DISPUTE_TIMEOUT**: 604800 (7d)

### Post-Deployment Integration Verification (Phase 5.3.2.5.1)

Read-only end-to-end integration verification was performed on Monad Testnet (Chain ID 10143) to confirm backend and frontend alignment with the deployed escrow contract:

1. **Address & Environment Parity**:
   - Backend `HIRING_ESCROW_ADDRESS`: `0x28243a3EA0c93CD5FbA6614EAff8980B4A8b0f29`
   - Frontend `VITE_AEGIS_ESCROW_CONTRACT_ADDRESS`: `0x28243a3EA0c93CD5FbA6614EAff8980B4A8b0f29`
   - Parity Status: **MATCH (Exact)**
   - No private keys, seed phrases, or sensitive environment values exposed.

2. **Backend Read-Only Blockchain Integration**:
   - Monad Testnet RPC: `https://testnet-rpc.monad.xyz`
   - Verified Connected Chain ID: `10143` (`0x279f`)
   - On-Chain Getters via `EscrowAdapter`:
     - `identityRegistry()`: `0xa7A27f96d4e8f58d701D42229d5097A69694Ca4B` (VERIFIED)
     - `validationRegistry()`: `0x802DE575B528453C8208d5201e27464d63970e2b` (VERIFIED)
     - `defaultArbiter()`: `0xA82832aB9BD6C11A8156c7273815D631F90D347a` (VERIFIED)
     - `pendingValidatorFees(0x0674Bf234268358B5DcbD2c10cCBAFbef2AA7B1c)`: `0` wei (VERIFIED)
     - `totalPendingValidatorFees()`: `0` wei (VERIFIED)

3. **FastAPI Endpoints Verification**:
   - `GET /escrow/validators/{address}/fees`: Returns `200 OK` with pending fee wei/MON and total pending liability.
   - `GET /escrow/jobs/{job_id}`: Uninitialized job ID correctly raises `404 Not Found` (`JOB_NOT_FOUND`).
   - `POST /escrow/jobs/prepare`:
     - Unregistered provider agent correctly fails pre-flight on-chain identity check with `400 Bad Request` (`Agent <id> does not exist in Identity Registry`).
     - Valid parameters construct unsigned transaction targeting `0x28243a3EA0c93CD5FbA6614EAff8980B4A8b0f29` with `broadcast: false`.

4. **Frontend API & Simulation Boundary Verification**:
   - API client routes to `${API_BASE_URL}/escrow/...` with `VITE_API_BASE_URL=http://localhost:8000`.
   - Error states (`404 JOB_NOT_FOUND`, `503 ESCROW_NOT_CONFIGURED`, network failures) handled with explicit UI alerts.
   - Simulation boundary in `executeEscrowTransactionSimulation`:
     - Generates transaction hash prefixed with `0xsim_`.
     - Explicit receipt flag `simulated: true`.
     - UI banner explicitly declares: "Mock transaction receipt validated locally. This transaction was NOT broadcast to Monad Testnet and does not exist on-chain."

5. **Regression Test Suites**:
   - Backend pytest suite: 155 passed (100%)
   - Frontend Vitest suite: 65 passed (100%)
   - Hardhat contract suite: 144 passed (100%)
   - Total tests passing: 364 passed

6. **Remaining Limitations & Safety Boundary**:
   - Strictly read-only verification performed.
   - No state-changing on-chain functions were called.
   - Live transaction execution in frontend remains disabled pending explicit authorization.

### Read-Only API, Agent Discovery, Supply, and Parity Verification (Phase 5.3.2.5.2)

Comprehensive read-only verification was conducted across FastAPI routes, on-chain state on Monad Testnet (`chainId: 10143`), agent supply mechanics, and cross-registry parity:

1. **API Read-Only Routes Tested**:
   - `GET /health`: Returns `200 OK` (`{"status": "ok"}`). Zero RPC calls or side effects.
   - `GET /agents`: Returns `200 OK` with paginated discovery catalog. Correctly reports `scan_limit: 50` and `may_be_incomplete: true`. Overbound pagination (`limit=100`) strictly rejected with `422 Unprocessable Content`.
   - `GET /agents/1`: Returns `200 OK` with full profile matching on-chain state:
     - `owner`: `0xA82832aB9BD6C11A8156c7273815D631F90D347a`
     - `wallet`: `0xA82832aB9BD6C11A8156c7273815D631F90D347a`
     - `uri`: `aegisagent://test-agent-1`
     - `wallet_verified`: `true`
     - `trust_summary`: Integrates deterministic scores (`global_trust: 22.53`, `risk: 100.0`, `task_fit: 100.0`, `confidence: 24.67`, `recommendation: DO_NOT_HIRE`).
   - `GET /agents/9999`: Returns `404 Not Found` with structured error code `AGENT_NOT_FOUND`.
   - `GET /agents/0`: Rejects non-positive token IDs with `422 Unprocessable Content`.
   - `GET /agents/1/trust`: Returns `200 OK` with full trust evaluation, evidence breakdown, risk factors, and verifiable block snapshot.
   - `GET /agents/9999/trust`: Returns `404 Not Found` (`AGENT_NOT_FOUND`).
   - `GET /agents/1/risk`: Returns `200 OK` with risk tier `CRITICAL`, risk score `100.0`, and active risk factors.
   - `GET /agents/9999/risk`: Returns `404 Not Found` (`AGENT_NOT_FOUND`).

2. **Agent Discovery & Supply Analysis**:
   - **Discovered Agents**: Only Agent ID `1` exists within the bounded sequential scan range `[1..50]`.
   - **Non-Enumerable Interface**: `AegisIdentityRegistry` inherits OpenZeppelin ERC-721 without `ERC721Enumerable`. Methods `totalSupply()`, `tokenByIndex()`, and `tokenOfOwnerByIndex()` do not exist and cannot be invoked.
   - **RPC Log Query Constraints**: Monad Testnet public RPC (`https://testnet-rpc.monad.xyz`) enforces a maximum block span of ~100 blocks per `eth_getLogs` request (ranges >= 500 blocks fail with `413 Request Entity Too Large`).
   - **Event Log Verification**: Target query on Agent 1 registration block `68167221` successfully returned the canonical `Registered(agentId: 1, agentURI: "aegisagent://test-agent-1", owner: 0xA82832aB9BD6C11A8156c7273815D631F90D347a)` event and `Transfer` mint log.
   - **Supply Defensibility**:
     - Complete global agent count is not deterministically computable on-demand via RPC without either an external event indexer (subgraph/indexer service) or issuing ~22,000 chunked RPC calls across the 2.2M block history.
     - The backend's bounded scan (`scan_limit: 50`) returning `may_be_incomplete: true` is confirmed as the correct, defensible, and safe pattern.

3. **Cross-Contract & Frontend Parity**:
   - `Chain ID`: `10143` verified across backend Web3 provider, frontend config, and RPC query.
   - `Identity Registry`: `0xa7A27f96d4e8f58d701D42229d5097A69694Ca4B` verified in config, validation `getIdentityRegistry()`, reputation `getIdentityRegistry()`, and escrow `identityRegistry()`.
   - `Validation Registry`: `0x802DE575B528453C8208d5201e27464d63970e2b` verified in config and escrow `validationRegistry()`.
   - `Reputation Registry`: `0x387948228a43351F2D33E83Db22576F535c85C74` verified in config.
   - `Hiring Escrow`: `0x28243a3EA0c93CD5FbA6614EAff8980B4A8b0f29` verified identically across backend `.env`, frontend `.env`, and on-chain contract bytecode.
   - `Default Arbiter`: `0xA82832aB9BD6C11A8156c7273815D631F90D347a` verified on-chain via escrow `defaultArbiter()`.

4. **Regression Test Suites Baseline**:
   - Backend pytest suite: 156 passed (100%)
   - Frontend Vitest suite: 65 passed (100%)
   - Frontend Production build: Passed cleanly
   - Hardhat contract suite: 144 passed (100%)
   - Total regression tests passing: 365 passed

5. **Safety Compliance**:
   - Strictly read-only verification performed.
   - No state-changing contract functions called.
   - No transaction signing, broadcasting, or live hiring execution enabled.
