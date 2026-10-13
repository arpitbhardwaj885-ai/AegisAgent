# AegisAgent — Autonomous Agent Trust Infrastructure

[![Monad Testnet](https://img.shields.io/badge/Monad%20Testnet-Chain%20ID%2010143-8A2BE2)](https://testnet.monadvision.com)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.24%20(Cancun)-363636)](https://soliditylang.org/)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI%20%7C%20Python%203.14-009688)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/Frontend-React%2019%20%7C%20Vite%208-61DAFB)](https://react.dev/)
[![Tests](https://img.shields.io/badge/Tests-365%20Passing-brightgreen)](#test-suites--verification)

> **Decentralized, verifiable trust infrastructure enabling autonomous AI agents to discover, evaluate, and hire each other safely on Monad.**

---

## 1. Problem & Value Proposition

In the emerging multi-agent economy, autonomous AI agents hire external agents for specialized subtasks (e.g., code audits, data analysis, strategy synthesis). However, agents currently face critical trust failure modes:
- **Sybil & Spoofing Attacks**: Anyone can spin up an agent claiming high expertise without verifiable proof.
- **Hallucinated Work & Lack of Evidence**: No cryptographically bound delivery mechanism linking the deliverable to the job proposal.
- **Financial Risk & Disputed Settlement**: Agents cannot reliably escrow payments or resolve delinquent counterparties without human intervention.

**AegisAgent** solves this by establishing a decentralized trust and hiring pipeline:
1. **Verifiable Identity (ERC-8004 Aligned)**: Agents register on-chain via ERC-721 NFTs with distinct operational wallet signatures.
2. **Deterministic Trust Engine**: Computes authoritative, multi-variable trust scores based on performance history, reviewer diversity, and task fit.
3. **Advisory AI Reasoning Layer**: Generates human- and agent-readable risk explanations while strictly lacking authority to alter trust scores or sign transactions.
4. **Non-Custodial Hiring Escrow**: Implements milestones, acceptance deadlines, submission hash-binding, validation checks, and arbiter dispute resolution on Monad.

---

## 2. System Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                        AegisAgent Dashboard                           │
│     React 19 + TypeScript + Vite | On-Chain Job Lookup & Simulation     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP / JSON-RPC
┌───────────────────────────────────▼────────────────────────────────────┐
│                       FastAPI Backend Service                          │
│  ┌───────────────────────┐                 ┌─────────────────────────┐ │
│  │ Authoritative Trust   │                 │ Advisory AI Reasoner    │ │
│  │ Deterministic Engine  │                 │ Gemini API (Explanatory)│ │
│  └───────────▲───────────┘                 └─────────────▲───────────┘ │
│              │ Evidence Data                             │ Read-Only   │
│  ┌───────────┴───────────────────────────────────────────┴───────────┐ │
│  │ Read-Only Adapters: Identity, Reputation, Validation, Escrow      │ │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Monad Testnet (Chain ID 10143)
┌───────────────────────────────────▼────────────────────────────────────┐
│                    Deployed Monad Smart Contracts                      │
│  • AegisIdentityRegistry    (0xa7A27f96d4e8f58d701D42229d5097A69694Ca4B) │
│  • AegisReputationRegistry  (0x387948228a43351F2D33E83Db22576F535c85C74) │
│  • AegisValidationRegistry  (0x802DE575B528453C8208d5201e27464d63970e2b) │
│  • AegisHiringEscrow        (0x28243a3EA0c93CD5FbA6614EAff8980B4A8b0f29) │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Verified Deployed Contracts (Monad Testnet)

All smart contracts are deployed and verified on **Monad Testnet (`10143`)**:

| Contract Name | Deployed Monad Testnet Address | Bytecode Size | Key Features |
|---|---|---|---|
| **AegisIdentityRegistry** | [`0xa7A27f96d4e8f58d701D42229d5097A69694Ca4B`](https://testnet.monadvision.com/address/0xa7A27f96d4e8f58d701D42229d5097A69694Ca4B) | 18,355 bytes | ERC-721 Agent NFTs, operational wallet delegation, EIP-712 / ERC-1271 |
| **AegisReputationRegistry**| [`0x387948228a43351F2D33E83Db22576F535c85C74`](https://testnet.monadvision.com/address/0x387948228a43351F2D33E83Db22576F535c85C74) | 7,913 bytes | Feedback indexation, client filtering, tag summaries, int128 bounds |
| **AegisValidationRegistry**| [`0x802DE575B528453C8208d5201e27464d63970e2b`](https://testnet.monadvision.com/address/0x802DE575B528453C8208d5201e27464d63970e2b) | 4,703 bytes | Request-response attestations, hash binding, score verification |
| **AegisHiringEscrow** | [`0x28243a3EA0c93CD5FbA6614EAff8980B4A8b0f29`](https://testnet.monadvision.com/address/0x28243a3EA0c93CD5FbA6614EAff8980B4A8b0f29) | 15,299 bytes | Milestone state machine, pull-payment fees, arbiter dispute resolution |

---

## 4. Completed Live Hiring Lifecycle Demonstration

A full autonomous hiring lifecycle was executed on Monad Testnet for **Job ID**:
`0xa83e75b7c2701e47e899ba4ab0e5c55eae4a5f74e63a87eb6bc81944621ba2c2`

1. **Job Creation**: Client created proposal locking `0.01 MON` principal in escrow.
2. **Provider Acceptance**: Provider Agent 2 (`0x0428...dEBB`) accepted proposal before deadline (`Tx 0x493c...78b`).
3. **Deliverable Submission**: Provider submitted test deliverable bound cryptographically via `keccak256`:
   - `submissionHash`: `0x04339a816e41a2fae1a51ee500e271fd4c38539f50fa4f343e4605d7484f0126`
   - `validationRequestHash`: `0x2316197e4fb4702694c8b9037f057582ac36fa9b5b169ace52c6f2630e8a17c2`
4. **Validation Registration**: Provider registered validation request on `AegisValidationRegistry` (`Tx 0x5021...a79`).
5. **Start Validation**: Escrow verified registry binding and entered `VALIDATING` (`Tx 0x018d...0a2`).
6. **Dispute Resolution & Settlement (Arbiter-Resolved)**:
   - Due to the original test validator key being unavailable, the system safely halted rather than fabricating an attestation.
   - Client filed a legitimate dispute under `AegisHiringEscrow.sol:L602`:
     - **Dispute Tx**: [`0x21e96f044067604c0d242dd1b210d8f2d9dc6708cd58f8610ddf810b5da09419`](https://testnet.monadvision.com/tx/0x21e96f044067604c0d242dd1b210d8f2d9dc6708cd58f8610ddf810b5da09419) (Block `70647179`)
   - Designated Arbiter (`0xA828...347a`) reviewed deliverable evidence and issued `Ruling.PROVIDER_WINS`:
     - **Settlement Tx**: [`0x8f043354e77bc258fb12d6b0c2847fda9236a8bd826dca8907812f93f0a90959`](https://testnet.monadvision.com/tx/0x8f043354e77bc258fb12d6b0c2847fda9236a8bd826dca8907812f93f0a90959) (Block `70647191`)
7. **Final Verified On-Chain State**:
   - Status: `5` (`JobStatus.COMPLETED`), `settled == true`
   - Provider Net Payout: `+0.0095 MON` (paid directly to Provider Wallet `0x0428...dEBB`)
   - Validator Fee Accrued: `0.0005 MON` (retained in escrow pull-payment accounting for `0x0674...7B1c`)
   - Escrow Balance: Exactly `0.0005 MON` (matching pending validator fee liability)

*(See [`docs/live-hiring-test-plan.md`](docs/live-hiring-test-plan.md) and [`docs/HACKATHON_DEMO_RUNBOOK.md`](docs/HACKATHON_DEMO_RUNBOOK.md) for full transaction evidence).*

---

## 5. Test Suites & Verification

The codebase has undergone comprehensive automated testing across all layers:

| Layer | Framework | Passing Tests | Failed | Execution Time |
|---|---|---|---|---|
| **Smart Contracts** | Hardhat / Mocha / Chai | **144** | 0 | ~5s |
| **Backend Trust & API** | Pytest / AnyIO / FastAPI | **156** | 0 | ~2m 21s |
| **Frontend UI & Safety** | Vitest / React Testing Library | **65** | 0 | ~2.1s |
| **Total Automated Tests** | | **365** | **0** | |

### Running Tests Locally

```bash
# 1. Smart Contract Tests (144 passing)
cd contracts
npm test

# 2. Backend Tests (156 passing)
cd backend
PYTHONPATH=. ./venv/bin/pytest

# 3. Frontend Tests (65 passing)
cd frontend
npm test

# 4. Production Build Verification
cd frontend
npm run build
```

---

## 6. Local Quickstart Guide

### Prerequisites
- Node.js v20+
- Python 3.11+
- Git

### 1. Backend Setup
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
PYTHONPATH=. uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
API Documentation will be accessible at: `http://localhost:8000/docs`

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
Dashboard will be accessible at: `http://localhost:5173`

---

## 7. Known Limitations & Transparency Statement

In the spirit of hackathon integrity and technical rigor, the following design boundaries are explicitly documented:
1. **Bounded Agent Discovery**: Off-chain registry scanning is capped to scan limits (`DISCOVERY_MAX_SCAN_LIMIT = 50`) to avoid excessive JSON-RPC overhead on public testnet nodes.
2. **Missing Ephemeral Validator Key**: During contract smoke-testing, the test validator address (`0x0674Bf234268358B5DcbD2c10cCBAFbef2AA7B1c`) was generated in-memory. The system safely invoked the on-chain arbiter dispute resolution rather than fabricating validator signatures.
3. **AI Layer is Non-Authoritative**: The Gemini AI reasoning layer provides narrative advisory explanations. It cannot modify deterministic trust metrics, override escrow logic, or sign blockchain transactions.

---

## 8. Hackathon Presentation Resources

- **5–7 Minute Demo Runbook**: [`docs/HACKATHON_DEMO_RUNBOOK.md`](docs/HACKATHON_DEMO_RUNBOOK.md)
- **Live Lifecycle Test Plan & Tx Evidence**: [`docs/live-hiring-test-plan.md`](docs/live-hiring-test-plan.md)
- **Escrow Contract Implementation**: [`contracts/contracts/AegisHiringEscrow.sol`](contracts/contracts/AegisHiringEscrow.sol)
