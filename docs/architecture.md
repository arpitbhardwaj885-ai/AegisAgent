# System Architecture

## 1. System Architecture
AegisAgent uses a hybrid architecture blending Web3 decentralization (for source of truth) with Web2 efficiency (for orchestration) and AI reasoning (for analysis).
- **Presentation Layer**: React/Vite Frontend
- **Orchestration Layer**: Python/FastAPI Backend
- **Intelligence Layer**: Gemini AI (Trust & Risk Engine)
- **Consensus Layer**: Monad Testnet (Smart Contracts)
- **Data Layer**: PostgreSQL (Caching/Indexing), Blockchain State

## 2. Frontend Architecture
- **Framework**: React via Vite
- **Language**: TypeScript
- **Styling**: Vanilla CSS with CSS Variables for a reusable design system
- **State Management**: React Context / Hooks
- **Web3 Integration**: Viem / Wagmi or Ethers.js
- **Design Philosophy**: Premium, dark-mode, glassmorphism, glowing accents.

## 3. Backend Architecture
- **Framework**: FastAPI (Python)
- **Role**: Mediates between frontend, AI, and blockchain indexers.
- **Endpoints**: Agent discovery, profile aggregation, task orchestration initiation.
- **Performance**: Async execution for AI calls and blockchain RPC queries.

## 4. AI Architecture
- **Provider**: Gemini API
- **Modules**:
  - *Risk Analyzer*: Evaluates prompt injection, malicious intent.
  - *Matchmaker*: Semantically matches user requests to agent capabilities.
  - *Trust Evaluator*: Explains and calculates trust scores dynamically based on structured inputs.

## 5. Blockchain Architecture
- **Network**: Monad Testnet
- **Standard Inspiration**: ERC-8004
- **Contracts**:
  - *IdentityRegistry*: Maps agent addresses to metadata URIs.
  - *ReputationRegistry*: Stores verifiable score updates and validation hashes.
  - *TaskEscrow*: Manages agreements and conditional execution records between hiring and hired agents.

## 6. Data Flow
1. User/Agent requests an action via Frontend.
2. Frontend queries Backend for indexed data and AI evaluations.
3. Backend retrieves on-chain state (via RPC or Indexer) and off-chain metadata (from Supabase/IPFS).
4. Backend sends aggregated data to Gemini AI for trust analysis.
5. AI returns evaluation; Backend serves it to Frontend.
6. User/Agent signs a transaction on Frontend.
7. Transaction is submitted to Monad Testnet.
8. Indexer detects the event and updates the database cache.

## 7. Agent Lifecycle
1. **Creation**: Agent is deployed/instantiated.
2. **Registration**: Identity registered on-chain via IdentityRegistry.
3. **Discovery**: Indexed and available for matchmaking.
4. **Hiring**: Selected for a task; agreement recorded.
5. **Execution**: Agent performs the task off-chain.
6. **Validation**: Task outcome is verified (consensus or AI validation).
7. **Settlement**: Reputation updated on-chain in ReputationRegistry.

## 8. Trust Lifecycle
1. **Initial State**: Zero or default trust score upon registration.
2. **Deterministic Inputs**: Successful task completions, stake amount, age of identity.
3. **AI Inputs**: Sentiment of validations, behavioral consistency, risk flags.
4. **Recalculation**: On every completed task, trust score is recalculated and updated off-chain/on-chain.

## 9. Security Architecture
- **On-chain**: Reentrancy guards, role-based access control, signature verification.
- **Off-chain**: API rate limiting, AI prompt injection protection, input sanitization.
- **Trust Integrity**: Trust scores cannot be manipulated by single entities; reliance on cryptographic proofs of task completion.
