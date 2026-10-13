# Aegis Trust Engine Architecture

## 1. Core Purpose
The Aegis Trust Engine is an application-level intelligence layer built on top of the three ERC-8004-compatible trust primitives (Identity, Reputation, Validation). Its primary purpose is to answer the fundamental question:

*"Should Agent A trust or hire Agent B for a particular task?"*

The engine combines various factors, including identity evidence, reputation evidence, validation evidence, reliability evidence, behavioral risk, task-specific capability/fit, and AI-assisted reasoning. It operates above the primitives, handling sophisticated aggregation and application-specific trust models.

## 2. Core Design Principle
The fundamental design principle is a strict separation of concerns across different layers:

- **Blockchain**: VERIFIABLE EVIDENCE (Source of Truth)
- **Deterministic Engine**: NUMERICAL SCORING (Objective Calculation)
- **Risk Engine**: ADVERSARIAL ANALYSIS (Threat Assessment)
- **AI**: REASONING AND EXPLANATION (Contextual Interpretation)
- **Final Trust Engine**: DECISION (Actionable Recommendation)

**Crucial Constraint:** An LLM is NEVER allowed to arbitrarily write the final trust score. The numerical score must be entirely derived from bounded deterministic calculations. AI is utilized solely to interpret evidence, identify qualitative concerns, explain results in human-readable terms, and provide recommendations based on the calculated deterministic scores.

## 3. Initial Trust Score Model
The global Trust Score (0-100) is deterministically calculated using the following initial weighted model:

- **Reputation: 30%** (Derived from average feedback score, reviewer diversity, and feedback volume)
- **Validation: 25%** (Derived from validation success rate, validator diversity, and recency)
- **Identity: 15%** (Derived from metadata completeness, registration age, and wallet ownership proof)
- **Reliability: 15%** (Derived from consistent endpoint uptime and promptness of past interactions)
- **Behavioral Risk: 15%** (Derived from sudden changes in activity, conflicting feedback, and sybil signals)

Total: 100%

**Normalization (0-100):**
Each component is independently evaluated and normalized to a 0-100 scale before weights are applied.
- *Reputation:* Average rating (1-5) converted to 0-100. Modulated by a confidence factor based on volume.
- *Validation:* Percentage of successful validations from unique validators, penalized for repeated failures.
- *Identity:* Points awarded for verified EOA control, populated metadata fields, and age since registration.
- *Reliability:* Success/Failure ratio of off-chain interactions or task completions.
- *Behavioral Risk:* Starts at 100, deducted based on specific risk flags.

**Handling Missing Evidence:**
Missing evidence is explicitly distinguished from low scores and insufficient evidence.
- *Missing Evidence:* If an agent has no reputation or validations, the respective component score is `0` (or `null`/undefined in internal representation) and the system flags it as "Insufficient Evidence". The overall trust score cannot silently treat missing evidence as perfect evidence. If core components are missing, the final trust score is inherently capped.
- *Insufficient Evidence:* Very low volume of interactions (e.g., 1 review). Component score is heavily discounted by a confidence factor.
- *Low Score:* Abundant evidence proving poor performance (e.g., 50 reviews averaging 1.2).

## 4. Task-Specific Trust
Trust evaluation is task-aware. The system calculates two distinct metrics:

- **Global Trust Score:** General historical reliability.
- **Task Fit Score (0-100):** Specific capability match for the current task.

**Influence on Final Recommendation:**
The Task Fit Score evaluates whether the agent's demonstrated capabilities and historical evidence are relevant to the requested task. For example, if an agent is a "Solidity Auditor" and the task is "Smart Contract Audit", the Task Fit Score will be high. 

The Task Fit Score acts as a modifier or an independent axis to the Global Trust Score. A final recommendation requires both to be above acceptable thresholds. An agent with a Global Trust Score of 95 but a Task Fit Score of 10 will receive a negative recommendation for that specific task. The Task Fit Score does not destroy or alter the underlying Global Trust Score; it contextualizes it for the specific request.

## 5. Risk Engine
The Risk Engine performs deterministic adversarial analysis, producing a risk score and risk flags.

Deterministic Risk Factors:
1. **Sybil/reviewer concentration**
   - *Input Evidence:* Unique reviewers vs. total reviews in Reputation Registry.
   - *Calculation:* Ratio of unique reviewers to total reviews; largest single reviewer's share.
   - *Severity:* HIGH
   - *Score Impact:* Up to -30 on Behavioral Risk.
   - *Explanation:* "High proportion of feedback originates from a small number of addresses."
2. **Validator concentration**
   - *Input Evidence:* Unique validators in Validation Registry.
   - *Calculation:* Ratio of unique validators to total validations.
   - *Severity:* HIGH
   - *Score Impact:* Up to -25.
   - *Explanation:* "Agent is primarily validated by a concentrated group of validators."
3. **High failure rate**
   - *Input Evidence:* Failed validations or negative reputation scores.
   - *Calculation:* Ratio of failed vs. successful interactions over time.
   - *Severity:* CRITICAL
   - *Score Impact:* Up to -40.
   - *Explanation:* "Frequent task failures or validation rejections."
4. **Stale evidence**
   - *Input Evidence:* Timestamps of last reputation or validation entries.
   - *Calculation:* Days since last activity.
   - *Severity:* MEDIUM
   - *Score Impact:* Up to -15.
   - *Explanation:* "Evidence is aging; current status unverified."
5. **Sudden reputation growth**
   - *Input Evidence:* Timestamps and volume of reputation entries.
   - *Calculation:* Spikes in reputation volume exceeding historical average significantly.
   - *Severity:* HIGH
   - *Score Impact:* Up to -20.
   - *Explanation:* "Anomalous spike in positive reviews indicating potential manipulation."
6. **Conflicting reputation and validation**
   - *Input Evidence:* High reputation scores but frequent validation failures.
   - *Calculation:* Divergence between reputation normalized score and validation normalized score.
   - *Severity:* HIGH
   - *Score Impact:* Up to -25.
   - *Explanation:* "Agent receives positive reviews but fails objective validations."
7. **Inactive agent**
   - *Input Evidence:* Identity metadata update timestamp, interaction timestamps.
   - *Calculation:* No activity recorded across all registries for a prolonged period.
   - *Severity:* LOW
   - *Score Impact:* Up to -10.
   - *Explanation:* "Agent profile is dormant."
8. **Missing identity metadata**
   - *Input Evidence:* Identity Registry metadata URI payload.
   - *Calculation:* Absence of critical fields (description, endpoints, capabilities).
   - *Severity:* MEDIUM
   - *Score Impact:* Up to -15.
   - *Explanation:* "Incomplete profile information."
9. **Unverified endpoints**
   - *Input Evidence:* Endpoint format and accessibility checks (off-chain).
   - *Calculation:* Endpoint fails basic reachability or format checks.
   - *Severity:* HIGH
   - *Score Impact:* Up to -20.
   - *Explanation:* "Agent communication endpoints are unreachable."
10. **Repeated negative validations**
    - *Input Evidence:* Sequential failed validations for the same task type.
    - *Calculation:* Count of consecutive `success=false` validations.
    - *Severity:* CRITICAL
    - *Score Impact:* Up to -35.
    - *Explanation:* "Consistent failure in meeting objective validation criteria."

*(Note: Data is derived strictly from existing blockchain state and verified off-chain metadata, without inventing arbitrary data.)*

## 6. Sybil Analysis
Sybil analysis focuses on detecting artificial inflation of reputation or validation via coordinated accounts.

**Reviewer-Diversity Metric:**
- *Unique Reviewer Count:* Total distinct addresses leaving feedback.
- *Reviewer Concentration:* Calculated using a Herfindahl-Hirschman Index (HHI) style approach on reviewer shares to measure market concentration.
- *Largest Reviewer Share:* The maximum percentage of reviews from a single address.
- *Concentration Risk:* High HHI or a disproportionately large share by a single reviewer triggers a Sybil risk flag.
*(Example: 100 reviews from 50 independent reviewers yields a low concentration risk, while 100 reviews from 2 reviewers yields a critically high concentration risk.)*

## 7. Validation Analysis
Analysis of evidence strictly from the Validation Registry.

Considerations:
- *Validation Count:* Total number of validations recorded.
- *Average Validation Response:* The ratio of successful to total terminal validations.
- *Validator Diversity:* Number of unique validators.
- *Successful/Failed Validations:* Absolute counts of boolean outcomes.
- *Recent Validation Activity:* Time-weighted metrics giving more importance to recent data.
- *Repeated Validation Updates:* The system groups responses by `(validator, request_id)` to ensure intermediate responses for the same request are not incorrectly counted as independent validation successes. Only the terminal state of a specific request is evaluated.

## 8. Reputation Analysis
Analysis of evidence strictly from the Reputation Registry.

Considerations:
- *Number of Reviewers:* Total count of distinct reviewers.
- *Average Feedback:* Mean of the rating scale.
- *Positive/Negative Feedback:* Ratio of positive to negative feedback. Negative feedback heavily impacts the score.
- *Reviewer Diversity:* Evaluated via the Sybil Analysis module.
- *Tag-Specific Performance:* Average feedback broken down by capability tags.
- *Recent Feedback:* Time-decay applied to older feedback.
- *Feedback Concentration:* Spikes in feedback volume in short timeframes.

## 9. Identity Analysis
Analysis of evidence from the Identity Registry and off-chain metadata.

Considerations:
- *Agent Existence:* Verified directly on-chain via registry mappings.
- *Registration Age:* Derivable from the block timestamp of the registration event (on-chain).
- *Wallet Association:* On-chain verifiable keys and ownership control.
- *Ownership/Control:* Directly from on-chain state.
- *Metadata Completeness:* (Off-chain) Requires fetching the metadata URI and validating the schema.
- *Endpoint Information:* (Off-chain) Extracted from the metadata JSON.
- *Supported Capabilities:* (Off-chain) Extracted from the metadata JSON for Task Fit scoring.

## 10. AI Reasoning Layer
The AI Reasoning Layer interprets the structured, deterministic evidence to provide human-readable explanations and nuanced contextual analysis.

**Input Schema:**
AI receives structured JSON data, NOT arbitrary raw blockchain state.
```json
{
  "agent": {"id": "...", "metadata": {...}},
  "task": {"description": "...", "requirements": [...]},
  "identityEvidence": {...},
  "reputationEvidence": {...},
  "validationEvidence": {...},
  "riskEvidence": {...},
  "deterministicScores": {
    "globalTrust": 82,
    "taskFit": 95,
    "risk": 15
  }
}
```

**Output Schema (Strictly Constrained):**
```json
{
  "reasoning": "string",
  "positiveFactors": ["string"],
  "riskFactors": ["string"],
  "recommendation": "HIRE | DO NOT HIRE | CAUTION",
  "confidence": 0.0 - 1.0,
  "explanation": "string"
}
```

**Fallback & Edge Case Behavior:**
- *Malformed AI Response / Hallucination:* Caught by strict schema validation. Falls back to deterministic score.
- *Unavailable AI Provider:* Engine returns deterministic scores with `aiConfidence=0` and generic templated explanations.
- *Prompt Injection (via Agent Metadata):* All string fields from agent metadata are sanitized, type-cast, and isolated before prompt injection.
- *Contradictory AI Recommendation:* If AI recommends "HIRE" but deterministic trust is very low, the deterministic engine explicitly overrides the recommendation.
- *Low-Confidence Reasoning:* Flagged in the response for frontend consumption.

## 11. Final Decision Model
Distinctions:
- **Global Trust Score:** Overall historical reliability (0-100).
- **Task Fit Score:** Specific capability match for the requested task (0-100).
- **Risk Score:** Aggregated threat level from deterministic risk factors (0-100).
- **AI Confidence:** The LLM's confidence in its qualitative assessment (0.0-1.0).
- **Final Recommendation:** Actionable output derived primarily from the combination of Trust Score, Task Fit Score, and Risk Score.

**Recommended Trust Bands (Configurable Policy Parameters):**
- **90–100**: VERY HIGH TRUST
- **75–89**: HIGH TRUST
- **60–74**: MODERATE TRUST
- **40–59**: LOW TRUST
- **0–39**: VERY LOW TRUST

## 12. Explainability
The Trust Engine must return a complete, transparent score breakdown.

*Conceptual Output Schema (Not implemented yet):*
```json
{
  "trustScore": 87,
  "taskFitScore": 94,
  "riskScore": 18,
  "aiConfidence": 0.91,
  "recommendation": "HIRE",
  "breakdown": {
    "reputation": 91,
    "validation": 88,
    "identity": 95,
    "reliability": 84,
    "behavioralRisk": 76
  },
  "positiveFactors": ["string"],
  "riskFactors": ["string"]
}
```

## 13. API Design
Proposed API Contracts (Implementation deferred).

**1. `GET /agents/{agent_id}/trust`**
- *Request:* URL param `agent_id`.
- *Response:* Global Trust Score, Risk Score, component breakdown.
- *Errors:* 404 Not Found, 500 Internal Error.
- *Validation:* Ethereum address format.
- *Auth:* Public/Rate-limited.

**2. `GET /agents/{agent_id}/risk`**
- *Request:* URL param `agent_id`.
- *Response:* Array of triggered risk flags and severity.
- *Errors:* 404 Not Found.
- *Validation:* Ethereum address format.
- *Auth:* Public/Rate-limited.

**3. `POST /trust/evaluate`**
- *Request:* JSON payload with `agent_id` and `task_description`.
- *Response:* Full evaluation including Task Fit, AI Reasoning, and Final Recommendation.
- *Errors:* 400 Bad Request, 404 Not Found.
- *Validation:* Address format, string length constraints.
- *Auth:* Requires API Key.

**4. `POST /trust/compare`**
- *Request:* JSON payload with `agent_ids` (array) and `task_description`.
- *Response:* Array of evaluations, sorted by suitability.
- *Errors:* 400 Bad Request.
- *Validation:* Address formats, array bounds.
- *Auth:* Requires API Key.

## 14. Data Flow
1. **Frontend**: Requests evaluation of Agent B for Task X.
2. **FastAPI**: Receives synchronous request at `/trust/evaluate`.
3. **Trust Engine Orchestrator**: Initiates multi-step evaluation.
4. **Blockchain Adapters (Async)**: Fetches raw state/events from Monad Testnet RPC.
5. **Metadata Resolver (Async)**: Fetches off-chain data from IPFS/HTTPS.
6. **Deterministic Scoring (Sync)**: Calculates base scores, sybil metrics.
7. **Risk Engine (Sync)**: Evaluates evidence against deterministic risk factors.
8. **AI Reasoning (Async)**: Calls LLM with structured JSON evidence.
9. **Decision Aggregator (Sync)**: Combines scores, risk modifiers, and AI recommendation.
10. **API Response**: Returns JSON.
11. **Frontend**: Renders explainable dashboard.

## 15. Security Model
- **Sybil attacks**: Mitigated by HHI reviewer concentration analysis and requiring diverse unique validators/reviewers.
- **Fake reputation**: Addressed by the sudden reputation growth risk factor and time-weighted analysis.
- **Malicious agent metadata**: Mitigated by sanitizing and strict schema validation of all fetched JSON.
- **Prompt injection**: AI input is strictly structured JSON; raw strings are sanitized. AI output is ignored if contradictory.
- **AI hallucination**: AI output must conform to strict JSON schemas. AI cannot invent trust scores.
- **Stale blockchain state**: Handled by tracking RPC block heights and stale evidence risk factors.
- **Manipulated off-chain evidence**: IPFS hashes ensure immutability. Web2 URIs are tracked for unexpected changes.
- **Compromised AI provider**: Engine degrades gracefully to deterministic-only mode.
- **Validator manipulation**: Validator concentration metric penalizes reliance on single entities.
- **Reviewer collusion**: Addressed by cross-referencing reviewer distributions.
- **Endpoint impersonation**: Wallet signature/on-chain links verify ownership of endpoints.
- **Score manipulation**: Deterministic rules are immutable without server-side code changes.
- **Denial of Service**: APIs heavily rate-limited; expensive RPC calls are cached.
- **Replayed evidence**: Validation Registry data grouped by `(validator, request_id)` to prevent replay/redundant counting.

## 16. ERC-8004 Boundary
It is critical to distinguish between the protocol standard and application logic.

**ERC-8004-Compatible Registries (The Primitives):**
- Identity Registry
- Reputation Registry
- Validation Registry

**AegisAgent Extensions (The Application Layer):**
- Trust Engine scoring algorithms
- Risk Engine
- Task Fit calculations
- AI reasoning layer
- Trust aggregation logic
- Hiring policy

*The Trust Engine itself is NOT part of ERC-8004. It is an application-specific consumer.*

## 17. Future Extensions
*(Not implemented in current phase)*
- agent-to-agent hiring
- escrow tied to validation
- AI evaluation oracle
- validator reputation
- staking/slashing
- decentralized oracle networks
- advanced Sybil detection (graph analysis)
- task-specific reputation ledgers
- trust history reporting
- trust decay mechanisms
- cross-chain trust aggregation
