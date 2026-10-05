// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/**
 * @title AegisReputationRegistry
 * @dev ERC-8004 compatible reputation registry.
 */
contract AegisReputationRegistry {
    address private _identityRegistry;
    bool private _initialized;

    struct Feedback {
        int128 value;
        uint8 valueDecimals;
        bool isRevoked;
        string tag1;
        string tag2;
    }

    // agentId => clientAddress => feedbackIndex => Feedback
    mapping(uint256 => mapping(address => mapping(uint64 => Feedback))) private _feedback;

    // agentId => clientAddress => lastIndex
    mapping(uint256 => mapping(address => uint64)) private _lastIndex;

    // agentId => unique clients array
    mapping(uint256 => address[]) private _agentClients;

    // agentId => clientAddress => feedbackIndex => responder => count
    // Tracks response counts by responder to support getResponseCount natively.
    mapping(uint256 => mapping(address => mapping(uint64 => mapping(address => uint64)))) private _responseCounts;

    address private immutable _deployer;

    constructor() {
        _deployer = msg.sender;
    }

    event NewFeedback(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint64 feedbackIndex,
        int128 value,
        uint8 valueDecimals,
        string indexed indexedTag1,
        string tag1,
        string tag2,
        string endpoint,
        string feedbackURI,
        bytes32 feedbackHash
    );

    event FeedbackRevoked(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint64 indexed feedbackIndex
    );

    // Note: EVM non-anonymous events have a maximum of three indexed parameters.
    // 'responder' is deliberately NON-indexed to remain compatible with standard
    // EVM limits without making the event anonymous. This is a deliberate
    // deviation from the ERC-8004 draft.
    event ResponseAppended(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint64 indexed feedbackIndex,
        address responder,
        string responseURI,
        bytes32 responseHash
    );

    function initialize(address identityRegistry_) external {
        require(msg.sender == _deployer, "AegisReputationRegistry: unauthorized");
        require(!_initialized, "AegisReputationRegistry: already initialized");
        require(identityRegistry_ != address(0), "AegisReputationRegistry: zero address");
        _identityRegistry = identityRegistry_;
        _initialized = true;
    }

    function getIdentityRegistry() external view returns (address) {
        return _identityRegistry;
    }

    function giveFeedback(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata endpoint,
        string calldata feedbackURI,
        bytes32 feedbackHash
    ) external {
        require(valueDecimals <= 18, "AegisReputationRegistry: valueDecimals > 18");
        
        // Validate normalized value fits in int128
        int256 normalizedValue = int256(value) * int256(10**(18 - valueDecimals));
        require(
            normalizedValue >= type(int128).min && normalizedValue <= type(int128).max,
            "AegisReputationRegistry: normalized value overflow"
        );

        IERC721 registry = IERC721(_identityRegistry);
        address owner;
        try registry.ownerOf(agentId) returns (address o) {
            owner = o;
        } catch {
            revert("AegisReputationRegistry: agent does not exist");
        }

        require(msg.sender != owner, "AegisReputationRegistry: owner cannot review");
        require(msg.sender != registry.getApproved(agentId), "AegisReputationRegistry: operator cannot review");
        require(!registry.isApprovedForAll(owner, msg.sender), "AegisReputationRegistry: operator cannot review");

        if (_lastIndex[agentId][msg.sender] == 0) {
            _agentClients[agentId].push(msg.sender);
        }

        uint64 index = ++_lastIndex[agentId][msg.sender];

        _feedback[agentId][msg.sender][index] = Feedback({
            value: value,
            valueDecimals: valueDecimals,
            isRevoked: false,
            tag1: tag1,
            tag2: tag2
        });

        emit NewFeedback(
            agentId,
            msg.sender,
            index,
            value,
            valueDecimals,
            tag1,
            tag1,
            tag2,
            endpoint,
            feedbackURI,
            feedbackHash
        );
    }

    function revokeFeedback(uint256 agentId, uint64 feedbackIndex) external {
        require(feedbackIndex > 0 && feedbackIndex <= _lastIndex[agentId][msg.sender], "AegisReputationRegistry: feedback not found");
        require(!_feedback[agentId][msg.sender][feedbackIndex].isRevoked, "AegisReputationRegistry: already revoked");

        _feedback[agentId][msg.sender][feedbackIndex].isRevoked = true;

        emit FeedbackRevoked(agentId, msg.sender, feedbackIndex);
    }

    function appendResponse(
        uint256 agentId,
        address clientAddress,
        uint64 feedbackIndex,
        string calldata responseURI,
        bytes32 responseHash
    ) external {
        require(feedbackIndex > 0 && feedbackIndex <= _lastIndex[agentId][clientAddress], "AegisReputationRegistry: feedback not found");
        
        _responseCounts[agentId][clientAddress][feedbackIndex][msg.sender] += 1;

        emit ResponseAppended(agentId, clientAddress, feedbackIndex, msg.sender, responseURI, responseHash);
    }

    function getSummary(
        uint256 agentId,
        address[] calldata clientAddresses,
        string calldata tag1,
        string calldata tag2
    ) external view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals) {
        require(clientAddresses.length > 0, "AegisReputationRegistry: clientAddresses empty");
        
        // Verify agent exists
        IERC721(_identityRegistry).ownerOf(agentId);

        int256 sum = 0;
        bool filterTag1 = bytes(tag1).length > 0;
        bool filterTag2 = bytes(tag2).length > 0;

        for (uint256 i = 0; i < clientAddresses.length; i++) {
            address client = clientAddresses[i];
            uint64 lastIdx = _lastIndex[agentId][client];
            for (uint64 j = 1; j <= lastIdx; j++) {
                Feedback storage fb = _feedback[agentId][client][j];
                if (fb.isRevoked) continue;
                if (filterTag1 && keccak256(bytes(fb.tag1)) != keccak256(bytes(tag1))) continue;
                if (filterTag2 && keccak256(bytes(fb.tag2)) != keccak256(bytes(tag2))) continue;
                
                // Normalize to 18 decimals
                int256 normalizedValue = int256(fb.value) * int256(10**(18 - fb.valueDecimals));
                sum += normalizedValue;
                count++;
            }
        }

        if (count > 0) {
            summaryValueDecimals = 18;
            summaryValue = int128(sum / int256(uint256(count)));
        } else {
            summaryValueDecimals = 0;
            summaryValue = 0;
        }
    }

    function readFeedback(
        uint256 agentId,
        address clientAddress,
        uint64 feedbackIndex
    ) external view returns (
        int128 value,
        uint8 valueDecimals,
        string memory tag1,
        string memory tag2,
        bool isRevoked
    ) {
        Feedback storage fb = _feedback[agentId][clientAddress][feedbackIndex];
        return (fb.value, fb.valueDecimals, fb.tag1, fb.tag2, fb.isRevoked);
    }

    /**
     * @dev Retrieves all feedback for an agent from a specific list of clients.
     * @notice This iterates over the requested client addresses and feedback records.
     * Large histories may be expensive. Consumers should paginate/filter client 
     * addresses where appropriate. It is not intended as a high-gas on-chain iteration primitive.
     */
    function readAllFeedback(
        uint256 agentId,
        address[] calldata clientAddresses,
        string calldata tag1,
        string calldata tag2,
        bool includeRevoked
    ) external view returns (
        address[] memory clients,
        uint64[] memory feedbackIndexes,
        int128[] memory values,
        uint8[] memory valueDecimals,
        string[] memory tag1s,
        string[] memory tag2s,
        bool[] memory revokedStatuses
    ) {
        // Pre-calculate count
        uint256 resultCount = 0;
        bool filterTag1 = bytes(tag1).length > 0;
        bool filterTag2 = bytes(tag2).length > 0;

        for (uint256 i = 0; i < clientAddresses.length; i++) {
            address client = clientAddresses[i];
            uint64 lastIdx = _lastIndex[agentId][client];
            for (uint64 j = 1; j <= lastIdx; j++) {
                Feedback storage fb = _feedback[agentId][client][j];
                if (!includeRevoked && fb.isRevoked) continue;
                if (filterTag1 && keccak256(bytes(fb.tag1)) != keccak256(bytes(tag1))) continue;
                if (filterTag2 && keccak256(bytes(fb.tag2)) != keccak256(bytes(tag2))) continue;
                resultCount++;
            }
        }

        clients = new address[](resultCount);
        feedbackIndexes = new uint64[](resultCount);
        values = new int128[](resultCount);
        valueDecimals = new uint8[](resultCount);
        tag1s = new string[](resultCount);
        tag2s = new string[](resultCount);
        revokedStatuses = new bool[](resultCount);

        uint256 idx = 0;
        for (uint256 i = 0; i < clientAddresses.length; i++) {
            address client = clientAddresses[i];
            uint64 lastIdx = _lastIndex[agentId][client];
            for (uint64 j = 1; j <= lastIdx; j++) {
                Feedback storage fb = _feedback[agentId][client][j];
                if (!includeRevoked && fb.isRevoked) continue;
                if (filterTag1 && keccak256(bytes(fb.tag1)) != keccak256(bytes(tag1))) continue;
                if (filterTag2 && keccak256(bytes(fb.tag2)) != keccak256(bytes(tag2))) continue;
                
                clients[idx] = client;
                feedbackIndexes[idx] = j;
                values[idx] = fb.value;
                valueDecimals[idx] = fb.valueDecimals;
                tag1s[idx] = fb.tag1;
                tag2s[idx] = fb.tag2;
                revokedStatuses[idx] = fb.isRevoked;
                idx++;
            }
        }
    }

    function getResponseCount(
        uint256 agentId,
        address clientAddress,
        uint64 feedbackIndex,
        address[] calldata responders
    ) external view returns (uint64 count) {
        for (uint256 i = 0; i < responders.length; i++) {
            count += _responseCounts[agentId][clientAddress][feedbackIndex][responders[i]];
        }
    }

    function getClients(uint256 agentId) external view returns (address[] memory) {
        return _agentClients[agentId];
    }

    function getLastIndex(uint256 agentId, address clientAddress) external view returns (uint64) {
        return _lastIndex[agentId][clientAddress];
    }
}
