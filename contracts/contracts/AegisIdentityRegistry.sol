// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import "@openzeppelin/contracts/utils/Nonces.sol";

/**
 * @title AegisIdentityRegistry
 * @dev ERC-8004 compatible identity registry for AegisAgent.
 * Extends ERC721 to represent Agent Identities.
 */
contract AegisIdentityRegistry is ERC721URIStorage, EIP712, Nonces {
    using Strings for uint256;

    bytes32 public constant SET_AGENT_WALLET_TYPEHASH = keccak256("SetAgentWallet(uint256 agentId,address newWallet,uint256 nonce,uint256 deadline)");

    uint256 private _nextTokenId;

    mapping(uint256 => address) private _agentWallets;
    mapping(uint256 => mapping(string => bytes)) private _metadata;

    event Registered(uint256 indexed agentId, string agentURI, address indexed owner);
    event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy);
    event AgentWalletUpdated(uint256 indexed agentId, address indexed oldWallet, address indexed newWallet);
    event MetadataSet(uint256 indexed agentId, string indexed indexedMetadataKey, string metadataKey, bytes metadataValue);

    constructor() ERC721("AegisAgent Identity", "AEGIS") EIP712("AegisIdentityRegistry", "1") {
        // Start agent IDs from 1
        _nextTokenId = 1;
    }

    /**
     * @dev Reverts if the caller is not the owner or an approved operator for the agentId.
     */
    modifier onlyAuthorized(uint256 agentId) {
        address owner = ownerOf(agentId);
        require(
            msg.sender == owner || 
            getApproved(agentId) == msg.sender || 
            isApprovedForAll(owner, msg.sender),
            "AegisIdentityRegistry: Not authorized"
        );
        _;
    }

    /**
     * @dev Registers a new agent identity.
     * @param agentURI The URI pointing to the agent's registration metadata.
     * @return agentId The ID of the newly minted agent.
     */
    function register(string calldata agentURI) external returns (uint256 agentId) {
        agentId = _nextTokenId++;
        
        _safeMint(msg.sender, agentId);
        _setTokenURI(agentId, agentURI);
        
        // Initial agent wallet is the registering owner
        _agentWallets[agentId] = msg.sender;
        
        emit Registered(agentId, agentURI, msg.sender);
        emit AgentWalletUpdated(agentId, address(0), msg.sender);
        emit MetadataSet(agentId, "agentWallet", "agentWallet", abi.encode(msg.sender));
    }

    /**
     * @dev Updates the agent URI.
     */
    function setAgentURI(uint256 agentId, string calldata newURI) external onlyAuthorized(agentId) {
        _setTokenURI(agentId, newURI);
        emit URIUpdated(agentId, newURI, msg.sender);
    }

    /**
     * @dev Retrieves the agent's designated wallet.
     */
    function getAgentWallet(uint256 agentId) external view returns (address) {
        _requireOwned(agentId); // Throws if nonexistent
        return _agentWallets[agentId];
    }

    /**
     * @dev Updates the agent's designated wallet.
     * Requires cryptographic proof of control from the new wallet.
     */
    function setAgentWallet(
        uint256 agentId,
        address newWallet,
        uint256 deadline,
        bytes calldata signature
    ) external onlyAuthorized(agentId) {
        require(newWallet != address(0), "AegisIdentityRegistry: Wallet cannot be zero address");
        require(block.timestamp <= deadline, "AegisIdentityRegistry: Signature expired");

        bytes32 structHash = keccak256(
            abi.encode(
                SET_AGENT_WALLET_TYPEHASH,
                agentId,
                newWallet,
                _useNonce(newWallet),
                deadline
            )
        );

        bytes32 hash = _hashTypedDataV4(structHash);

        require(
            SignatureChecker.isValidSignatureNow(newWallet, hash, signature),
            "AegisIdentityRegistry: Invalid signature"
        );

        address oldWallet = _agentWallets[agentId];
        _agentWallets[agentId] = newWallet;
        emit AgentWalletUpdated(agentId, oldWallet, newWallet);
    }

    /**
     * @dev Unsets the agent's designated wallet.
     */
    function unsetAgentWallet(uint256 agentId) external onlyAuthorized(agentId) {
        address oldWallet = _agentWallets[agentId];
        _agentWallets[agentId] = address(0);
        emit AgentWalletUpdated(agentId, oldWallet, address(0));
    }

    /**
     * @dev Sets on-chain metadata for an agent.
     */
    function setMetadata(uint256 agentId, string calldata metadataKey, bytes calldata metadataValue) external onlyAuthorized(agentId) {
        // Prevent modification of the reserved key "agentWallet"
        require(keccak256(bytes(metadataKey)) != keccak256(bytes("agentWallet")), "AegisIdentityRegistry: Reserved key");
        
        _metadata[agentId][metadataKey] = metadataValue;
        emit MetadataSet(agentId, metadataKey, metadataKey, metadataValue);
    }

    /**
     * @dev Retrieves on-chain metadata for an agent.
     */
    function getMetadata(uint256 agentId, string calldata metadataKey) external view returns (bytes memory) {
        _requireOwned(agentId);
        return _metadata[agentId][metadataKey];
    }

    /**
     * @dev Returns the canonical registry identifier (eip155:<chainId>:<contractAddress>).
     */
    function getAgentRegistry() external view returns (string memory) {
        return string.concat(
            "eip155:",
            Strings.toString(block.chainid),
            ":",
            Strings.toHexString(uint160(address(this)), 20)
        );
    }

    /**
     * @dev Hook that is called before any token transfer. This includes minting and burning.
     * Clears the agentWallet upon transfer to a new owner to prevent previous owner from
     * retaining control.
     */
    function _update(address to, uint256 tokenId, address auth) internal virtual override returns (address) {
        address previousOwner = super._update(to, tokenId, auth);

        // If this is a transfer (not a mint) and the recipient is not the previous owner
        if (previousOwner != address(0) && to != previousOwner) {
            address oldWallet = _agentWallets[tokenId];
            if (oldWallet != address(0)) {
                _agentWallets[tokenId] = address(0);
                emit AgentWalletUpdated(tokenId, oldWallet, address(0));
            }
        }

        return previousOwner;
    }
}
