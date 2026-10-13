// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAegisHiringEscrow {
    function cancelJob(bytes32 jobId) external;
    function settleCompletedJob(bytes32 jobId) external;
}

contract ReentrancyAttacker {
    IAegisHiringEscrow public target;
    bytes32 public attackJobId;
    bool public attackOnReceive;
    uint256 public reentrancyAttempts;

    function setTarget(address target_, bytes32 jobId_) external {
        target = IAegisHiringEscrow(target_);
        attackJobId = jobId_;
        attackOnReceive = true;
    }

    receive() external payable {
        if (attackOnReceive) {
            attackOnReceive = false;
            reentrancyAttempts++;
            // Attempt to re-enter
            target.cancelJob(attackJobId);
        }
    }
}

contract RejectingRecipient {
    // Reverts on any ether reception
    receive() external payable {
        revert("Rejection recipient refuses ether");
    }
}
