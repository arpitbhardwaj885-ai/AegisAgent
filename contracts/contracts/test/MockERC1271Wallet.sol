// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/interfaces/IERC1271.sol";

contract MockERC1271Wallet is IERC1271 {
    bool public shouldRevert;
    bool public shouldReturnInvalid;

    function setBehavior(bool _revert, bool _invalid) external {
        shouldRevert = _revert;
        shouldReturnInvalid = _invalid;
    }

    function isValidSignature(bytes32 /* hash */, bytes memory /* signature */) external view override returns (bytes4 magicValue) {
        if (shouldRevert) {
            revert("MockERC1271Wallet: forced revert");
        }
        if (shouldReturnInvalid) {
            return 0xffffffff;
        }
        return this.isValidSignature.selector;
    }
}
