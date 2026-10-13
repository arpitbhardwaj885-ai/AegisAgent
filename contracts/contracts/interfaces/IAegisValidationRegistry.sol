// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IAegisValidationRegistry
 * @dev Interface for the deployed AegisValidationRegistry on Monad Testnet.
 */
interface IAegisValidationRegistry {
    /**
     * @notice Registers a new validation request.
     * @param validatorAddress The designated validator address.
     * @param agentId The target agent ID being evaluated.
     * @param requestURI The metadata URI describing the validation criteria.
     * @param requestHash Unique hash identifying the request.
     */
    function validationRequest(
        address validatorAddress,
        uint256 agentId,
        string calldata requestURI,
        bytes32 requestHash
    ) external;

    /**
     * @notice Submits or updates a validation response.
     * @dev Overwrites previous stored state for requestHash and updates lastUpdate.
     * @param requestHash The request hash.
     * @param response Score between 0 and 100.
     * @param responseURI Report or evidence URI.
     * @param responseHash Report content hash.
     * @param tag Categorization tag.
     */
    function validationResponse(
        bytes32 requestHash,
        uint8 response,
        string calldata responseURI,
        bytes32 responseHash,
        string calldata tag
    ) external;

    /**
     * @notice Returns the latest stored validation status for a request hash.
     * @dev Reverts if the requestHash does not exist.
     * @param requestHash The request hash to query.
     * @return validatorAddress The designated validator.
     * @return agentId The evaluated agent ID.
     * @return response Latest validation score (0-100).
     * @return responseHash Hash of the validator's deliverable evaluation.
     * @return tag Tag associated with this response.
     * @return lastUpdate Block timestamp of the latest response (0 if unanswered).
     */
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
        );
}
