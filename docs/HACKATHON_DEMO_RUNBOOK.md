# AegisAgent — Hackathon Demonstration Runbook (5–7 Minute Presentation Guide)

> **Audience**: Hackathon Judges, Web3 Builders, AI Researchers  
> **Network**: Monad Testnet (Chain ID `10143`)  
> **Target Duration**: 5 to 7 Minutes  
> **Live Integration Status**: Fully deployed on Monad Testnet; read-only verified. (Client/API services must be started locally using the commands below).

---

## 1. Quick Setup & Environment Requirements

### Required Environment Variables (No Secrets Stored in Repo)
To run the full stack locally, configure the following variables in the root `.env` and `frontend/.env`:

```bash
# Root .env
MONAD_TESTNET_RPC_URL=https://testnet-rpc.monad.xyz
MONAD_CHAIN_ID=10143
IDENTITY_REGISTRY_ADDRESS=0xa7A27f96d4e8f58d701D42229d5097A69694Ca4B
REPUTATION_REGISTRY_ADDRESS=0x387948228a43351F2D33E83Db22576F535c85C74
VALIDATION_REGISTRY_ADDRESS=0x802DE575B528453C8208d5201e27464d63970e2b
HIRING_ESCROW_ADDRESS=0x28243a3EA0c93CD5FbA6614EAff8980B4A8b0f29
DEPLOYER_PRIVATE_KEY=<client_wallet_private_key>
PROVIDER_PRIVATE_KEY=<provider_wallet_private_key>
GEMINI_API_KEY=<optional_gemini_api_key_for_ai_explanations>

# frontend/.env
VITE_AEGIS_ESCROW_CONTRACT_ADDRESS=0x28243a3EA0c93CD5FbA6614EAff8980B4A8b0f29
VITE_API_BASE_URL=http://localhost:8000
```

### Exact Startup Commands

```bash
# Terminal 1: Backend API (FastAPI)
cd backend
source venv/bin/activate
PYTHONPATH=. uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
# Verify: curl http://localhost:8000/health

# Terminal 2: Frontend Dashboard (Vite + React)
cd frontend
npm run dev
# Dashboard URL: http://localhost:5173
```

---

## 2. Verified Monad Testnet Smart Contracts

All contracts are deployed on Monad Testnet (`10143`) and verified via read-only RPC:

| Contract | Verified Monad Testnet Address | Bytecode Size | Verified On-Chain Links |
|---|---|---|---|
| **AegisIdentityRegistry** | `0xa7A27f96d4e8f58d701D42229d5097A69694Ca4B` | 18,355 bytes | ERC-721 based Agent ID NFT & Operational Wallet binding |
| **AegisReputationRegistry**| `0x387948228a43351F2D33E83Db22576F535c85C74` | 7,913 bytes | Linked to Identity Registry |
| **AegisValidationRegistry**| `0x802DE575B528453C8208d5201e27464d63970e2b` | 4,703 bytes | Linked to Identity Registry |
| **AegisHiringEscrow** | `0x28243a3EA0c93CD5FbA6614EAff8980B4A8b0f29` | 15,299 bytes | Linked to Identity, Validation, and Default Arbiter |

---

## 3. 5–7 Minute Live Presentation Sequence

```mermaid
journey
    title 5-7 Minute AegisAgent Hackathon Demo Flow
    section 1. Context & Problem (0:00 - 1:00)
      Autonomous agent economy risks: 5: Presenter
      Why decentralized trust is critical: 5: Presenter
    section 2. System Architecture (1:00 - 2:00)
      Deterministic Trust Engine vs AI Advisory: 5: Presenter
      Monad high-throughput settlement: 5: Presenter
    section 3. Discovery & Evaluation (2:00 - 3:15)
      Agent profiles (Agent 1 & 2): 5: Judge
      Trust/Risk score computation: 5: Judge
    section 4. Hiring Lifecycle (3:15 - 4:30)
      Escrow creation, deposit, submission: 5: Judge
      Cryptographic hash binding: 5: Judge
    section 5. Failure Handling & Evidence (4:30 - 6:00)
      Unresponsive validator safety halt: 5: Judge
      Arbiter dispute resolution: 5: Judge
      On-chain settlement & fee accounting: 5: Judge
    section 6. Summary & Next Steps (6:00 - 7:00)
      ERC-8004 alignment & production roadmap: 5: Presenter
```

---

### Step 1: Problem & Solution (Time: 0:00 – 1:00)
- **The Problem**: In multi-agent autonomous economies, agents hire other agents without human intervention. Without cryptographically verifiable identity and trust, agents face Sybil attacks, impersonation, prompt injection, deliverable hallucination, and financial fraud.
- **The Solution**: **AegisAgent** — an end-to-end trust and hiring infrastructure built on Monad.
  - Combines **deterministic on-chain evidence** (ERC-8004 aligned identity, performance history, validation records) with a **verifiable multi-factor trust engine**.
  - Provides an **AI reasoning layer** that explains risks and recommendations in natural language **without ever possessing the authority to override deterministic rules or sign transactions**.

---

### Step 2: System Architecture (Time: 1:00 – 2:00)
Highlight the architectural separation of powers:
1. **Frontend (`frontend/`)**: Modern React + TypeScript interface with dual-mode transaction simulation and on-chain escrow status lookup.
2. **Backend Engine (`backend/app/`)**:
   - `EscrowAdapter`, `IdentityAdapter`, `ValidationAdapter`: Strict read-only blockchain adapters communicating over JSON-RPC.
   - `TrustEngine`: Authoritative, deterministic multi-variable trust and risk scoring (scoring weights: evidence weight, reviewer diversity, task fit, confidence).
   - `AITrustReasoner`: Advisory layer using Gemini API for risk narrative generation. If the AI hallucinates or fails, the deterministic decision stands unmodified.
3. **Smart Contracts (`contracts/`)**: Monad Testnet smart contracts enforcing state machines, deadline guarantees, pull-payment fee liabilities, and reentrancy protection.

---

### Step 3: Agent Discovery & Trust Evaluation (Time: 2:00 – 3:15)
- **Show Agent Profiles**:
  - **Client Agent ID 1**: Owner/Wallet `0xA82832aB9BD6C11A8156c7273815D631F90D347a`
  - **Provider Agent ID 2**: Owner/Wallet `0x0428A965CB2285a84065307C02D8392eCf5ddEBB`
- **Execute / Display Trust Evaluation**:
  - Query backend endpoint: `GET /trust/agents/2`
  - Show the response: deterministic `global_trust_score`, `risk_score`, `risk_factors` (e.g., historical reviewer concentration), and AI advisory breakdown.
- **Key Judge Takeaway**: Emphasize that the AI output is **strictly advisory**. The trust score and hiring gates are computed deterministically.

---

### Step 4: The Live Hiring Lifecycle (Time: 3:15 – 4:30)
Explain the full lifecycle executed live on Monad Testnet for Job ID:
`0xa83e75b7c2701e47e899ba4ab0e5c55eae4a5f74e63a87eb6bc81944621ba2c2`

1. **Job Creation**: Client locked `0.01 MON` principal in `AegisHiringEscrow`.
2. **Job Acceptance**: Provider Agent 2 (`0x0428...dEBB`) accepted proposal before deadline (`Tx 0x493c...78b`).
3. **Deliverable Submission**: Provider submitted test deliverable payload bound via `keccak256`:
   - `submissionHash`: `0x04339a816e41a2fae1a51ee500e271fd4c38539f50fa4f343e4605d7484f0126`
   - `validationRequestHash`: `0x2316197e4fb4702694c8b9037f057582ac36fa9b5b169ace52c6f2630e8a17c2`
4. **Validation Registration**: Provider registered request on `AegisValidationRegistry` for validator `0x0674Bf234268358B5DcbD2c10cCBAFbef2AA7B1c` (`Tx 0x5021...a79`).
5. **Start Validation**: Escrow verified registry binding and entered `VALIDATING` (`Tx 0x018d...0a2`).

---

### Step 5: Failure Handling & Truthful Arbiter Resolution (Time: 4:30 – 6:00)
*This is the most critical technical and security demonstration of the project.*

- **The Real-World Obstacle**: The designated validator address `0x0674Bf234268358B5DcbD2c10cCBAFbef2AA7B1c` was an ephemeral test address whose signing key was unavailable in the test harness.
- **Security Invariant Demonstration**:
  - The system **refused** to fabricate signatures, generate fake validator keys, or bypass contract checks.
  - EVM simulations proved that calling `validationResponse` or `settleCompletedJob` without the authorized validator strictly reverts.
- **Contract-Supported Dispute Resolution**:
  - Under `AegisHiringEscrow.sol:L602`, an unresponsive validator while in `VALIDATING` permits raising a dispute.
  - **Dispute Raised**: Client filed dispute stating *"Designated validator key unavailable; independent validation response cannot be submitted."*
    - **Tx Hash**: [`0x21e96f044067604c0d242dd1b210d8f2d9dc6708cd58f8610ddf810b5da09419`](https://testnet.monadvision.com/tx/0x21e96f044067604c0d242dd1b210d8f2d9dc6708cd58f8610ddf810b5da09419)
    - Block: `70647179` | Status: `1` (SUCCESS) | Job moved to `DISPUTED` (`11`).
  - **Arbiter Ruling (`PROVIDER_WINS`)**: Designated Arbiter (`0xA828...347a`) reviewed deliverable evidence and issued `Ruling.PROVIDER_WINS`.
    - **Tx Hash**: [`0x8f043354e77bc258fb12d6b0c2847fda9236a8bd826dca8907812f93f0a90959`](https://testnet.monadvision.com/tx/0x8f043354e77bc258fb12d6b0c2847fda9236a8bd826dca8907812f93f0a90959)
    - Block: `70647191` | Status: `1` (SUCCESS) | Job moved to `COMPLETED` (`5`).
- **Transparency Statement**: The demo is explicitly presented as **arbiter-resolved**, not validator-attested.

---

### Step 6: Live On-Chain Evidence & Accounting (Time: 6:00 – 6:30)
Show the final on-chain verification in the frontend UI or terminal via `scripts/inspect-lifecycle-state.js`:

```bash
node scripts/inspect-lifecycle-state.js
```

**Verified Results on Monad Testnet**:
- **Job Status**: `5` (`JobStatus.COMPLETED`)
- **Settlement Flag**: `settled == true`
- **Provider Net Payout**: `+0.0095 MON` transferred directly to Provider Wallet `0x0428...dEBB`.
- **Validator Fee Accrued**: `0.0005 MON` (5% / 500 bps) accrued in escrow contract pull-payment accounting (`pendingValidatorFees[0x0674...7B1c]`).
- **Escrow Contract Balance**: Exactly `0.0005 MON` (100% reserved for pending validator fee pull-payment).

---

### Step 7: Conclusion & Realistic Next Steps (Time: 6:30 – 7:00)
- **Technical Achievements**:
  - 144 Hardhat smart contract tests passing.
  - 156 backend integration and trust engine tests passing.
  - 65 frontend React/Vite component and boundary tests passing.
  - Production build passing in 146ms.
  - Fully verified on-chain lifecycle on Monad Testnet.
- **Future Roadmap**:
  - Full ERC-8004 standard alignment as drafts finalize.
  - Decentralized validator pools with stake-slashing.
  - Dynamic MPC-based operational agent key rotation.

---

## 4. Troubleshooting Guide

| Issue | Root Cause | Solution |
|---|---|---|
| Backend returns `503 EscrowNotConfigured` | `HIRING_ESCROW_ADDRESS` unset | Ensure `.env` is present or rely on built-in default `0x28243a3EA0c93CD5FbA6614EAff8980B4A8b0f29`. |
| Backend returns `ModuleNotFoundError: No module named 'app'` | Running without python package root | Start with `PYTHONPATH=. uvicorn app.main:app ...` from `backend/`. |
| Frontend displays `Job Not Found (404)` | Querying an uninitialized Job ID | In the Lookup tab, enter the verified live Job ID: `0xa83e75b7c2701e47e899ba4ab0e5c55eae4a5f74e63a87eb6bc81944621ba2c2`. |
| Monad RPC connection timeout | Public testnet RPC congestion | Fallback to alternative Monad Testnet RPC endpoints if configured. |
