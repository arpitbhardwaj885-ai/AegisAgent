# AegisHiringEscrow Deployment Runbook — Monad Testnet

This runbook specifies the step-by-step procedures for deploying and verifying the `AegisHiringEscrow` smart contract on Monad Testnet (`chainId: 10143`), followed by backend and frontend configuration.

> **CRITICAL PROTOCOL CONSTRAINT:**
> All live deployments and blockchain writes require **explicit user authorization**. Do not execute deployment commands without user consent.

---

## 1. Preconditions & Prerequisites

1. **Monad Testnet RPC Access**:
   - Primary RPC: `https://testnet-rpc.monad.xyz`
   - Chain ID: `10143` (`0x279f`)
2. **Deployer Account**:
   - Dedicated EOA configured via `DEPLOYER_PRIVATE_KEY` in `.env`.
   - Minimum recommended balance: **0.1 MON** (contract deployment consumes ~3,386,000 gas, plus headroom for smoke testing).
3. **Verified Registry Addresses**:
   - `AegisIdentityRegistry`: `0xa7A27f96d4e8f58d701D42229d5097A69694Ca4B` (Bytecode verified: 18,355 bytes).
   - `AegisValidationRegistry`: `0x802DE575B528453C8208d5201e27464d63970e2b` (Bytecode verified: 4,703 bytes; linked to Identity Registry).
4. **Designated Default Arbiter**:
   - **DEPLOYMENT BLOCKER**: `DEFAULT_ARBITER_ADDRESS` must be explicitly defined and verified before broadcasting.
   - **Immutability Notice**: In `AegisHiringEscrow.sol`, `address public immutable defaultArbiter` is declared immutable. It is embedded directly in contract bytecode at construction time. **It cannot be changed, rotated, or upgraded after deployment.**
   - **Environment File Location**: Set in `/home/arpit/AegisAgent/.env` (or pass as an inline environment variable).
   - **Strict Validation**: The deployment script enforces valid 20-byte EVM address syntax, rejects `address(0)`, and will not silently substitute any placeholder or deployer key.
   - The arbiter should be a dedicated governance multisig, dispute resolution committee EOA, or an explicitly designated operational wallet.

---

## 2. Constructor Signature & Parameter Order

The constructor is atomic and initializes three immutable storage addresses:

```solidity
constructor(
    address identityRegistry_,
    address validationRegistry_,
    address defaultArbiter_
)
```

### Exact ABI Inputs:
| Index | Name | Type | Intended Value | Description |
|---|---|---|---|---|
| `0` | `identityRegistry_` | `address` | `0xa7A27f96d4e8f58d701D42229d5097A69694Ca4B` | Deployed ERC-8004 Identity Registry |
| `1` | `validationRegistry_` | `address` | `0x802DE575B528453C8208d5201e27464d63970e2b` | Deployed Validation Registry |
| `2` | `defaultArbiter_` | `address` | `0xA82832aB9BD6C11A8156c7273815D631F90D347a` | Configured deployer public address (`DEFAULT_ARBITER_ADDRESS`) |

*Note: All three addresses are validated to be non-zero in the constructor. There is no separate initializer function.*

---

## 3. Safe Pre-Deployment Validation (No Broadcast)

Before executing on-chain deployment, run the validate-only check to verify compilation, address syntax, checksums, and constructor parameters without deploying or spending funds:

```bash
cd contracts
VALIDATE_ONLY=true npx hardhat run scripts/deploy-escrow.js
```

Expected simulation output:
- Compiles cleanly (`Nothing to compile` or build complete).
- Outputs simulated deployer address and test balance.
- Successfully deploys to in-memory hardhat network with ~3,385,955 gas used.
- Validates that getters `identityRegistry()`, `validationRegistry()`, and `defaultArbiter()` match inputs.

---

## 4. Live Deployment Execution (Requires User Authorization)

> **WARNING:** The following command broadcasts real transactions to Monad Testnet and expends testnet MON.

Once the user provides the explicit `DEFAULT_ARBITER_ADDRESS`:

```bash
cd contracts
DEFAULT_ARBITER_ADDRESS=<VALID_ARBITER_ADDRESS> npx hardhat run scripts/deploy-escrow.js --network monadTestnet
```

The script will output:
- Deployment Transaction Hash (`tx.hash`)
- Deployed Contract Address (`escrowAddress`)
- Block Number
- Gas Used
- Verification confirmation of the three immutable getters

---

## 5. Address Recording & Independent Verification

1. Record the deployed contract address in `docs/deployment.md`:
   ```markdown
   ## AegisHiringEscrow
   - **Network**: Monad Testnet (Chain ID 10143)
   - **Contract Address**: `0x...`
   - **Deployer**: `0x...`
   - **Transaction Hash**: `0x...`
   - **Identity Registry Linked**: `0xa7A27f96d4e8f58d701D42229d5097A69694Ca4B`
   - **Validation Registry Linked**: `0x802DE575B528453C8208d5201e27464d63970e2b`
   - **Default Arbiter**: `0x...`
   ```

2. Independent Read-Only RPC Verification:
   ```bash
   # Verify bytecode exists on-chain:
   cast code 0x<DEPLOYED_ADDRESS> --rpc-url https://testnet-rpc.monad.xyz

   # Verify immutable getters:
   cast call 0x<DEPLOYED_ADDRESS> "identityRegistry()(address)" --rpc-url https://testnet-rpc.monad.xyz
   cast call 0x<DEPLOYED_ADDRESS> "validationRegistry()(address)" --rpc-url https://testnet-rpc.monad.xyz
   cast call 0x<DEPLOYED_ADDRESS> "defaultArbiter()(address)" --rpc-url https://testnet-rpc.monad.xyz
   ```

---

## 6. Backend & Frontend Configuration Updates

### 6.1 Backend Configuration
Set the deployed escrow address in your environment (e.g. root `.env` or `backend/.env`):
```bash
HIRING_ESCROW_ADDRESS=0x<DEPLOYED_ADDRESS>
```
**Restart Backend**:
```bash
# If running uvicorn in background or terminal:
# Stop running instance (Ctrl+C) and restart:
cd backend
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000
```
Verify backend endpoint:
```bash
curl -s http://localhost:8000/escrow/fees/0x0000000000000000000000000000000000000001
# Should return 200 OK with pending_fee_wei: "0" instead of 503 ESCROW_NOT_CONFIGURED
```

### 6.2 Frontend Configuration
Set the address in `frontend/.env`:
```bash
VITE_AEGIS_ESCROW_CONTRACT_ADDRESS=0x<DEPLOYED_ADDRESS>
VITE_API_BASE_URL=http://localhost:8000
```
**Restart Frontend**:
Vite bundles environment variables at startup. Restart the development server:
```bash
cd frontend
# Restart dev server:
npm run dev
```

---

## 7. Post-Deployment Smoke Test Procedure

1. **Read Status Invariant Check**:
   - In frontend: Open `http://localhost:5173`.
   - In Navbar, open "On-Chain Escrow Job Lookup".
   - Search for a dummy jobId: `0x0000000000000000000000000000000000000000000000000000000000000001`.
   - Confirm status returns `UNINITIALIZED` (code `0`), proving live contract connectivity without reverting.

2. **Job Preparation & Proposal Smoke Test**:
   - Use JobForm to create a proposal with `clientAgentId: 1`, `providerAgentId: 1`, `rewardAmount: 0.001 MON`.
   - Confirm modal displays target contract: `0x<DEPLOYED_ADDRESS>` (not `UNCONFIGURED`).
   - Run simulation modal check: verify parameter decoding matches expected struct.

---

## 8. Rollback & Recovery Guidance

- **If deployment fails mid-flight (RPC drop or out of gas)**:
  - Check transaction status on MonadVision (`https://testnet.monadvision.com`).
  - If transaction failed or dropped, no contract exists. Address configuration remains unset (`""`); system remains in mock/disabled fallback state.
- **If deployment succeeds but constructor parameters were incorrect (e.g. wrong arbiter)**:
  - Do NOT set `HIRING_ESCROW_ADDRESS` in `.env`.
  - Because constructor parameters are `immutable`, the deployed contract cannot be mutated.
  - Fix the configuration error and deploy a clean instance. The unconfigured instance has zero locked funds and will remain dormant.
- **If backend integration reveals an unexpected RPC issue**:
  - Clear `HIRING_ESCROW_ADDRESS` (`HIRING_ESCROW_ADDRESS=""`) and restart the backend.
  - Backend routes will gracefully return `503 ESCROW_NOT_CONFIGURED`, disabling write submissions in the UI and protecting users from failed transactions.

---

## 9. Monad Testnet Gas Cost Accounting

| Action | Execution Site | Gas Estimate | Testnet Cost |
|---|---|---|---|
| Contract Deployment (`deploy(identity, validation, arbiter)`) | Hardhat script | ~3,386,000 gas | ~0.0003 - 0.003 MON |
| Deployer Balance Check & Read calls | Read-only RPC | 0 gas | Free |
| Contract Bytecode / Getter verification | Read-only RPC | 0 gas | Free |
| Backend Read Routes (`/escrow/jobs/{id}`, `/escrow/fees/{addr}`) | Read-only RPC | 0 gas | Free |
| Frontend Job Simulation (`eth_estimateGas`, mock execution) | Read-only RPC / Local | 0 gas | Free |
| Live Client Job Creation (`createJob`) *[Future phase]* | Client Wallet (MetaMask) | ~140,000 gas | ~0.0001 MON + reward |
| Provider Acceptance (`acceptJob`) *[Future phase]* | Provider Wallet | ~45,000 gas | ~0.00005 MON |
| Deliverable Submission (`submitDeliverable`) *[Future phase]* | Provider Wallet | ~65,000 gas | ~0.00006 MON |
| Job Settlement (`settleCompletedJob`) *[Future phase]* | Any Caller | ~85,000 gas | ~0.00008 MON |
| Validator Fee Withdrawal (`withdrawValidatorFees`) *[Future phase]* | Validator Wallet | ~35,000 gas | ~0.00003 MON |
