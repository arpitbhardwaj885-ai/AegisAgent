// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract AegisValidationRegistry {
    struct ValidationRecord {
        address validatorAddress;
        uint256 agentId;
        uint8 response;       // 0-100
        bool hasResponse;
        bytes32 responseHash;
        uint64 lastUpdate;
        string tag;
        bool exists;
    }

    address private immutable _deployer;
    bool private _initialized;
    address private _identityRegistry;

    // requestHash => ValidationRecord
    mapping(bytes32 => ValidationRecord) private _validations;
    // agentId => requestHashes
    mapping(uint256 => bytes32[]) private _agentValidations;
    // validatorAddress => requestHashes
    mapping(address => bytes32[]) private _validatorRequests;

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

    constructor() {
        _deployer = msg.sender;
    }

    function initialize(address identityRegistry_) external {
        require(msg.sender == _deployer, "AegisValidationRegistry: unauthorized");
        require(!_initialized, "AegisValidationRegistry: already initialized");
        require(identityRegistry_ != address(0), "AegisValidationRegistry: zero address");
        _identityRegistry = identityRegistry_;
        _initialized = true;
    }

    function getIdentityRegistry() external view returns (address) {
        return _identityRegistry;
    }

    function validationRequest(
        address validatorAddress,
        uint256 agentId,
        string calldata requestURI,
        bytes32 requestHash
    ) external {
        require(validatorAddress != address(0), "AegisValidationRegistry: zero validator");
        require(!_validations[requestHash].exists, "AegisValidationRegistry: hash already exists");

        IERC721 registry = IERC721(_identityRegistry);
        address owner;
        try registry.ownerOf(agentId) returns (address o) {
            owner = o;
        } catch {
            revert("AegisValidationRegistry: agent does not exist");
        }

        require(
            msg.sender == owner ||
            msg.sender == registry.getApproved(agentId) ||
            registry.isApprovedForAll(owner, msg.sender),
            "AegisValidationRegistry: unauthorized requester"
        );

        _validations[requestHash] = ValidationRecord({
            validatorAddress: validatorAddress,
            agentId: agentId,
            response: 0,
            hasResponse: false,
            responseHash: bytes32(0),
            lastUpdate: 0,
            tag: "",
            exists: true
        });

        _agentValidations[agentId].push(requestHash);
        _validatorRequests[validatorAddress].push(requestHash);

        emit ValidationRequest(validatorAddress, agentId, requestURI, requestHash);
    }

    function validationResponse(
        bytes32 requestHash,
        uint8 response,
        string calldata responseURI,
        bytes32 responseHash,
        string calldata tag
    ) external {
        require(_validations[requestHash].exists, "AegisValidationRegistry: request not found");
        ValidationRecord storage record = _validations[requestHash];
        require(msg.sender == record.validatorAddress, "AegisValidationRegistry: unauthorized validator");
        require(response <= 100, "AegisValidationRegistry: invalid response > 100");

        record.response = response;
        record.hasResponse = true;
        record.responseHash = responseHash;
        record.lastUpdate = uint64(block.timestamp);
        record.tag = tag;

        emit ValidationResponse(
            record.validatorAddress,
            record.agentId,
            requestHash,
            response,
            responseURI,
            responseHash,
            tag
        );
    }

    function getValidationStatus(bytes32 requestHash)
        external
        view
        returns (
            address validatorAddress,
            uint256 agentId,
            uint8 response,
            bytes32 responseHash,
            string memory tag,
            uint256 lastUpdate
        )
    {
        require(_validations[requestHash].exists, "AegisValidationRegistry: request not found");
        ValidationRecord storage record = _validations[requestHash];
        return (
            record.validatorAddress,
            record.agentId,
            record.response,
            record.responseHash,
            record.tag,
            uint256(record.lastUpdate)
        );
    }

    function getSummary(
        uint256 agentId,
        address[] calldata validatorAddresses,
        string calldata tag
    ) external view returns (uint64 count, uint8 averageResponse) {
        IERC721 registry = IERC721(_identityRegistry);
        try registry.ownerOf(agentId) returns (address) {} catch {
            revert("AegisValidationRegistry: agent does not exist");
        }

        uint256 sum = 0;
        bytes32[] storage requests = _agentValidations[agentId];
        
        bool checkValidators = validatorAddresses.length > 0;
        bool checkTag = bytes(tag).length > 0;

        for (uint256 i = 0; i < requests.length; i++) {
            ValidationRecord storage record = _validations[requests[i]];
            if (!record.hasResponse) {
                continue;
            }

            if (checkValidators) {
                bool foundValidator = false;
                for (uint256 j = 0; j < validatorAddresses.length; j++) {
                    if (record.validatorAddress == validatorAddresses[j]) {
                        foundValidator = true;
                        break;
                    }
                }
                if (!foundValidator) {
                    continue;
                }
            }

            if (checkTag) {
                if (keccak256(bytes(record.tag)) != keccak256(bytes(tag))) {
                    continue;
                }
            }

            sum += record.response;
            count++;
        }

        if (count > 0) {
            averageResponse = uint8(sum / count);
        } else {
            averageResponse = 0;
        }
    }

    /**
     * @dev Retrieves all validation request hashes for an agent.
     * @notice Large histories may be expensive for on-chain consumers.
     */
    function getAgentValidations(uint256 agentId) external view returns (bytes32[] memory requestHashes) {
        return _agentValidations[agentId];
    }

    /**
     * @dev Retrieves all validation request hashes assigned to a validator.
     * @notice Large histories may be expensive for on-chain consumers.
     */
    function getValidatorRequests(address validatorAddress) external view returns (bytes32[] memory requestHashes) {
        return _validatorRequests[validatorAddress];
    }
}
