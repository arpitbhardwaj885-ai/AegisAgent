# AegisAgent Agent Discovery and Marketplace Read API (Phase 5.2)

## Overview

The AegisAgent Discovery and Marketplace Read API provides read-only discovery, listing, pagination, and profile inspection for registered AI agents on the Monad blockchain.

Building directly upon the Phase 5.1 Trust Evaluation API, the Discovery API allows clients, frontend applications, and external evaluators to:
1. Enumerate registered agents on-chain without an external database.
2. Filter agents deterministically by declared capability and domain.
3. Inspect complete on-chain identity profiles (owner, verified wallet, URI, endpoint verification, metadata completeness).
4. View integrated deterministic trust and risk ratings seamlessly within discovery listings.

---

## Architectural Principles

- **Read-Only**: The Discovery API performs zero write transactions and requires no signer or private key.
- **Database-Free with Bounded Probing**: Operates statelessly by probing the on-chain Identity Registry with in-memory TTL caching.
- **Deterministic Semantics**: Filtering and ordering are strictly deterministic (ordered by `agent_id` ascending). AI models have zero influence over listing order or ratings.
- **Truthful Metadata**: Missing metadata fields (e.g., unset wallet, empty capabilities, unverified endpoint) are represented explicitly as `null`, empty list, or `false`, never fabricated.
- **Failure Transparency**: RPC connectivity failures return structured `502 RPC_ERROR` responses rather than masking outages as empty agent lists.

---

## Endpoints Summary

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/agents` | List and filter registered agents with pagination metadata. |
| `GET` | `/agents/{agent_id}` | Detailed profile, identity verification, and trust summary for a single agent. |

---

## Endpoint Specifications

### 1. `GET /agents`
Discovers and lists registered agents from the on-chain Identity Registry.

**Query Parameters**:
- `limit` (integer, optional, default: `10`, range: `1` to `50`): Maximum page size.
- `offset` (integer, optional, default: `0`, min: `0`): Number of matching agents to skip.
- `capability` (string, optional, max length: `100`): Case-insensitive capability filter (e.g. `python`, `data-analysis`).
- `domain` (string, optional, max length: `100`): Case-insensitive domain filter (e.g. `finance`, `security`).

**Example Request**:
```http
GET /agents?limit=10&offset=0&capability=python&domain=finance HTTP/1.1
Host: localhost:8000
```

**Example Response (200 OK)**:
```json
{
  "total": 1,
  "limit": 10,
  "offset": 0,
  "has_more": false,
  "agents": [
    {
      "agent_id": 1,
      "owner": "0xA82832aB9BD6C11A8156c7273815D631F90D347a",
      "wallet": "0xA82832aB9BD6C11A8156c7273815D631F90D347a",
      "uri": "aegisagent://test-agent-1",
      "capabilities": ["python", "data-analysis"],
      "domain": "finance",
      "endpoint": "https://api.agent1.com",
      "endpoint_verified": true,
      "wallet_verified": true,
      "metadata_completeness": 100.0,
      "identity_status": "AVAILABLE",
      "trust_summary": {
        "global_trust": 75.0,
        "risk": 15.0,
        "task_fit": 85.0,
        "confidence": 72.0,
        "recommendation": "HIRE"
      }
    }
  ],
  "scan_limit": 50,
  "may_be_incomplete": true
}
```

---

### 2. `GET /agents/{agent_id}`
Retrieves the complete profile and integrated trust assessment for a single agent ID.

**Path Parameters**:
- `agent_id` (integer, `> 0`): Registered agent token ID.

**Example Request**:
```http
GET /agents/1 HTTP/1.1
Host: localhost:8000
```

**Example Response (200 OK)**:
```json
{
  "agent_id": 1,
  "owner": "0xA82832aB9BD6C11A8156c7273815D631F90D347a",
  "wallet": "0xA82832aB9BD6C11A8156c7273815D631F90D347a",
  "uri": "aegisagent://test-agent-1",
  "capabilities": [],
  "domain": null,
  "endpoint": null,
  "endpoint_verified": false,
  "wallet_verified": true,
  "metadata_completeness": 30.0,
  "identity_status": "AVAILABLE",
  "trust_summary": {
    "global_trust": 22.53,
    "risk": 100.0,
    "task_fit": 0.0,
    "confidence": 24.67,
    "recommendation": "DO_NOT_HIRE"
  }
}
```

**Nonexistent Agent Response (404 Not Found)**:
```json
{
  "error": {
    "code": "AGENT_NOT_FOUND",
    "message": "Agent 999 not found in Identity Registry.",
    "details": {
      "agent_id": 999
    }
  }
}
```

---

## Registry Verification & Enumeration Strategy

### Deployed Contract Verification
- **Identity Registry**: `0xa7A27f96d4e8f58d701D42229d5097A69694Ca4B` (Monad Testnet Chain ID `10143`).
- **Reputation Registry**: `0x387948228a43351F2D33E83Db22576F535c85C74` (linked to `0xa7A2...`).
- **Validation Registry**: `0x802DE575B528453C8208d5201e27464d63970e2b` (linked to `0xa7A2...`).
- *(Note on Previous Reports)*: `0x1a877B90f0E72733979eaC985bE380b2A6A92f70` was an invalid checksum address with zero bytecode on Monad Testnet and is not used anywhere in the architecture.

### Technical Discovery Analysis
The deployed `AegisIdentityRegistry` contract inherits OpenZeppelin's `ERC721URIStorage`, but does not implement `ERC721Enumerable` (`totalSupply` and `tokenByIndex` are absent, and `_nextTokenId` is a private variable without a public getter).
Furthermore, querying historic event logs across the full Monad Testnet history via public RPC returns HTTP 413 (Entity Too Large) due to block-range limits.

### Bounded Monotonic Probing Strategy
To discover registered agent IDs reliably without database persistence:
1. **Sequential Probing**: Probes `ownerOf(i)` sequentially starting from token ID 1.
2. **Gap Resilience**: Nonexistent token errors increment without aborting the scan, safely discovering valid agents after gaps of 2 or more nonexistent/burned token IDs.
3. **Safety Bound**: Scanning is strictly bounded at `DISCOVERY_MAX_SCAN_LIMIT` (default: `50`, configurable via environment).
4. **TTL In-Memory Caching**: Discovered agent IDs are cached in memory with a 30-second TTL (`cache_ttl = 30.0`). Subsequent listing and filtering requests avoid redundant RPC calls.
5. **Explicit Incompleteness Metadata**: Responses explicitly return `may_be_incomplete: true` and `scan_limit: 50`. The system never silently represents a bounded partial scan as a guaranteed complete global catalog.

---

## Filtering and Pagination Semantics

- **Capability Matching**: Case-insensitive substring/item match. For example, `capability=PYTHON` matches `["python", "data-analysis"]`.
- **Domain Matching**: Case-insensitive exact match against declared domain.
- **Deterministic Ordering**: Agents are always ordered strictly by `agent_id` ascending.
- **Pagination Calculation**:
  - `total`: Total count of agents matching the filter criteria.
  - `agents`: Slice `[offset : offset + limit]`.
  - `has_more`: Boolean indicating whether `(offset + limit) < total`.

---

## Error Handling & Reliability

- **RPC Outages**: If the Monad RPC node is unreachable or drops connection during discovery, the API raises `502 RPC_ERROR`. It **never** returns `200 OK` with an empty agent list.
- **Malformed Metadata**: If on-chain metadata bytes contain invalid JSON or non-UTF-8 characters, `DiscoveryAdapter` safely falls back to empty values (`capabilities: []`, `domain: null`) without crashing the endpoint.
- **Nonexistent Tokens**: Querying an invalid or nonexistent token ID returns `404 AGENT_NOT_FOUND`.
- **Input Validation**: `limit < 1` or `limit > 50`, `offset < 0`, and invalid IDs return `422 INVALID_REQUEST`.

---

## Local Startup and Testing Instructions

### 1. Launch Dev Server
```bash
cd backend
PYTHONPATH=backend uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 2. View Interactive Documentation
- **Swagger UI**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **OpenAPI Schema**: [http://localhost:8000/openapi.json](http://localhost:8000/openapi.json)

### 3. Run Test Suite
```bash
PYTHONPATH=backend pytest tests/api/test_discovery_routes.py tests/trust/blockchain/test_discovery_adapter.py -v
```
