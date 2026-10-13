// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/**
 * @title IAegisIdentityRegistry
 * @dev Interface for AegisIdentityRegistry ERC-8004 agent identity lookups.
 */
interface IAegisIdentityRegistry is IERC721 {
    /**
     * @notice Retrieves the operational agent wallet associated with an agent ID.
     * @param agentId The ID of the registered agent.
     * @return The operational wallet address, or address(0) if unset.
     */
    function getAgentWallet(uint256 agentId) external view returns (address);
}
