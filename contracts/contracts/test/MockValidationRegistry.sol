// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IAegisValidationRegistry.sol";

/**
 * @title MockValidationRegistry
 * @dev Faithful mock of deployed AegisValidationRegistry.
 * Emulates overwrite behavior on repeated responses and exact return tuple.
 */
contract MockValidationRegistry is IAegisValidationRegistry {
    struct ValidationRecord {
        address validatorAddress;
        uint256 agentId;
        uint8 response;
        bool hasResponse;
        bytes32 responseHash;
        uint64 lastUpdate;
        string tag;
        bool exists;
    }

    mapping(bytes32 => ValidationRecord) private _validations;

    function validationRequest(
        address validatorAddress,
        uint256 agentId,
        string calldata /* requestURI */,
        bytes32 requestHash
    ) external override {
        require(validatorAddress != address(0), "Zero validator");
        require(!_validations[requestHash].exists, "Hash already exists");

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
    }

    function validationResponse(
        bytes32 requestHash,
        uint8 response,
        string calldata /* responseURI */,
        bytes32 responseHash,
        string calldata tag
    ) external override {
        require(_validations[requestHash].exists, "Request not found");
        ValidationRecord storage record = _validations[requestHash];
        require(msg.sender == record.validatorAddress, "Unauthorized validator");
        require(response <= 100, "Response > 100");

        // Overwrites latest state exactly like deployed contract
        record.response = response;
        record.hasResponse = true;
        record.responseHash = responseHash;
        record.lastUpdate = uint64(block.timestamp);
        record.tag = tag;
    }

    function getValidationStatus(bytes32 requestHash)
        external
        view
        override
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

    // Helper for test setups to explicitly manipulate time or test edge cases
    function setCustomResponse(
        bytes32 requestHash,
        uint8 response,
        bytes32 responseHash,
        string calldata tag,
        uint64 customTimestamp
    ) external {
        require(_validations[requestHash].exists, "Request not found");
        ValidationRecord storage record = _validations[requestHash];
        record.response = response;
        record.hasResponse = true;
        record.responseHash = responseHash;
        record.lastUpdate = customTimestamp;
        record.tag = tag;
    }
}
