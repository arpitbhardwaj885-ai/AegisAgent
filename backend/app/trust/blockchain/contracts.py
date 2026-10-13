IDENTITY_ABI = [
    {
        "inputs": [{"internalType": "uint256", "name": "agentId", "type": "uint256"}],
        "name": "ownerOf",
        "outputs": [{"internalType": "address", "name": "", "type": "address"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [{"internalType": "uint256", "name": "agentId", "type": "uint256"}],
        "name": "getAgentWallet",
        "outputs": [{"internalType": "address", "name": "", "type": "address"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [{"internalType": "uint256", "name": "agentId", "type": "uint256"}],
        "name": "tokenURI",
        "outputs": [{"internalType": "string", "name": "", "type": "string"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [{"internalType": "uint256", "name": "agentId", "type": "uint256"}, {"internalType": "string", "name": "metadataKey", "type": "string"}],
        "name": "getMetadata",
        "outputs": [{"internalType": "bytes", "name": "", "type": "bytes"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "getAgentRegistry",
        "outputs": [{"internalType": "string", "name": "", "type": "string"}],
        "stateMutability": "view",
        "type": "function"
    }
]

REPUTATION_ABI = [
    {
        "inputs": [{"internalType": "uint256", "name": "agentId", "type": "uint256"}],
        "name": "getClients",
        "outputs": [{"internalType": "address[]", "name": "", "type": "address[]"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {"internalType": "uint256", "name": "agentId", "type": "uint256"},
            {"internalType": "address[]", "name": "clientAddresses", "type": "address[]"},
            {"internalType": "string", "name": "tag1", "type": "string"},
            {"internalType": "string", "name": "tag2", "type": "string"},
            {"internalType": "bool", "name": "includeRevoked", "type": "bool"}
        ],
        "name": "readAllFeedback",
        "outputs": [
            {"internalType": "address[]", "name": "clients", "type": "address[]"},
            {"internalType": "uint64[]", "name": "feedbackIndexes", "type": "uint64[]"},
            {"internalType": "int128[]", "name": "values", "type": "int128[]"},
            {"internalType": "uint8[]", "name": "valueDecimals", "type": "uint8[]"},
            {"internalType": "string[]", "name": "tag1s", "type": "string[]"},
            {"internalType": "string[]", "name": "tag2s", "type": "string[]"},
            {"internalType": "bool[]", "name": "revokedStatuses", "type": "bool[]"}
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {"internalType": "uint256", "name": "agentId", "type": "uint256"},
            {"internalType": "address[]", "name": "clientAddresses", "type": "address[]"},
            {"internalType": "string", "name": "tag1", "type": "string"},
            {"internalType": "string", "name": "tag2", "type": "string"}
        ],
        "name": "getSummary",
        "outputs": [
            {"internalType": "uint64", "name": "count", "type": "uint64"},
            {"internalType": "int128", "name": "summaryValue", "type": "int128"},
            {"internalType": "uint8", "name": "summaryValueDecimals", "type": "uint8"}
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "getIdentityRegistry",
        "outputs": [{"internalType": "address", "name": "", "type": "address"}],
        "stateMutability": "view",
        "type": "function"
    }
]

VALIDATION_ABI = [
    {
        "inputs": [],
        "name": "getIdentityRegistry",
        "outputs": [{"internalType": "address", "name": "", "type": "address"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [{"internalType": "uint256", "name": "agentId", "type": "uint256"}],
        "name": "getAgentValidations",
        "outputs": [{"internalType": "bytes32[]", "name": "requestHashes", "type": "bytes32[]"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [{"internalType": "bytes32", "name": "requestHash", "type": "bytes32"}],
        "name": "getValidationStatus",
        "outputs": [
            {"internalType": "address", "name": "validatorAddress", "type": "address"},
            {"internalType": "uint256", "name": "agentId", "type": "uint256"},
            {"internalType": "uint8", "name": "response", "type": "uint8"},
            {"internalType": "bytes32", "name": "responseHash", "type": "bytes32"},
            {"internalType": "string", "name": "tag", "type": "string"},
            {"internalType": "uint256", "name": "lastUpdate", "type": "uint256"}
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {"internalType": "uint256", "name": "agentId", "type": "uint256"},
            {"internalType": "address[]", "name": "validatorAddresses", "type": "address[]"},
            {"internalType": "string", "name": "tag", "type": "string"}
        ],
        "name": "getSummary",
        "outputs": [
            {"internalType": "uint64", "name": "count", "type": "uint64"},
            {"internalType": "uint8", "name": "averageResponse", "type": "uint8"}
        ],
        "stateMutability": "view",
        "type": "function"
    }
]

ESCROW_ABI = [
    {
        "inputs": [{"internalType": "bytes32", "name": "jobId", "type": "bytes32"}],
        "name": "getJob",
        "outputs": [
            {
                "components": [
                    {"internalType": "bytes32", "name": "jobId", "type": "bytes32"},
                    {"internalType": "uint256", "name": "clientAgentId", "type": "uint256"},
                    {"internalType": "address", "name": "client", "type": "address"},
                    {"internalType": "uint256", "name": "providerAgentId", "type": "uint256"},
                    {"internalType": "address", "name": "validatorAddress", "type": "address"},
                    {"internalType": "uint256", "name": "rewardAmount", "type": "uint256"},
                    {"internalType": "uint256", "name": "validatorFeeBps", "type": "uint256"},
                    {"internalType": "uint8", "name": "minAcceptanceScore", "type": "uint8"},
                    {"internalType": "uint64", "name": "acceptanceDeadline", "type": "uint64"},
                    {"internalType": "uint64", "name": "submissionDeadline", "type": "uint64"},
                    {"internalType": "uint64", "name": "validationDeadline", "type": "uint64"},
                    {"internalType": "bytes32", "name": "taskHash", "type": "bytes32"},
                    {"internalType": "bytes32", "name": "prehireTrustSnapshotHash", "type": "bytes32"},
                    {"internalType": "enum AegisHiringEscrow.JobStatus", "name": "status", "type": "uint8"},
                    {"internalType": "bool", "name": "settled", "type": "bool"},
                    {"internalType": "bytes32", "name": "submissionHash", "type": "bytes32"},
                    {"internalType": "string", "name": "submissionURI", "type": "string"},
                    {"internalType": "uint64", "name": "submissionTimestamp", "type": "uint64"},
                    {"internalType": "bytes32", "name": "validationRequestHash", "type": "bytes32"},
                    {"internalType": "uint64", "name": "failureTimestamp", "type": "uint64"},
                    {"internalType": "uint64", "name": "challengeDeadline", "type": "uint64"},
                    {"internalType": "uint64", "name": "disputeTimestamp", "type": "uint64"},
                    {"internalType": "address", "name": "designatedArbiter", "type": "address"}
                ],
                "internalType": "struct AegisHiringEscrow.Job",
                "name": "",
                "type": "tuple"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [{"internalType": "address", "name": "", "type": "address"}],
        "name": "pendingValidatorFees",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "totalPendingValidatorFees",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {"internalType": "bytes32", "name": "jobId", "type": "bytes32"},
            {"internalType": "uint256", "name": "providerAgentId", "type": "uint256"},
            {"internalType": "address", "name": "validatorAddress", "type": "address"},
            {"internalType": "bytes32", "name": "submissionHash", "type": "bytes32"}
        ],
        "name": "deriveValidationRequestHash",
        "outputs": [{"internalType": "bytes32", "name": "", "type": "bytes32"}],
        "stateMutability": "pure",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "MAX_VALIDATOR_FEE_BPS",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "CHALLENGE_WINDOW",
        "outputs": [{"internalType": "uint64", "name": "", "type": "uint64"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "DISPUTE_TIMEOUT",
        "outputs": [{"internalType": "uint64", "name": "", "type": "uint64"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "identityRegistry",
        "outputs": [{"internalType": "contract IAegisIdentityRegistry", "name": "", "type": "address"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "validationRegistry",
        "outputs": [{"internalType": "contract IAegisValidationRegistry", "name": "", "type": "address"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "defaultArbiter",
        "outputs": [{"internalType": "address", "name": "", "type": "address"}],
        "stateMutability": "view",
        "type": "function"
    }
]

