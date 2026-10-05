const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AegisReputationRegistry Transfer Edge Cases", function () {
    let identityRegistry;
    let reputationRegistry;
    let owner;
    let newOwner;
    let client;
    let operator;
    let agentId;

    beforeEach(async function () {
        [owner, newOwner, client, operator] = await ethers.getSigners();

        const IdentityRegistry = await ethers.getContractFactory("AegisIdentityRegistry");
        identityRegistry = await IdentityRegistry.deploy();

        const ReputationRegistry = await ethers.getContractFactory("AegisReputationRegistry");
        reputationRegistry = await ReputationRegistry.deploy();
        
        await reputationRegistry.initialize(await identityRegistry.getAddress());

        const tx = await identityRegistry.connect(owner).register("ipfs://test-agent");
        const receipt = await tx.wait();
        const event = receipt.logs.find(l => l.fragment && l.fragment.name === 'Registered');
        agentId = event.args.agentId;
    });

    it("Should handle ownership transfers correctly regarding feedback rules", async function () {
        // Old owner cannot give feedback
        await expect(reputationRegistry.connect(owner).giveFeedback(agentId, 100, 0, "", "", "", "", ethers.ZeroHash))
            .to.be.revertedWith("AegisReputationRegistry: owner cannot review");
            
        // Client gives feedback before transfer
        await reputationRegistry.connect(client).giveFeedback(agentId, 100, 0, "", "", "", "", ethers.ZeroHash);
        
        // Transfer agent to newOwner
        await identityRegistry.connect(owner).transferFrom(owner.address, newOwner.address, agentId);
        
        // Old owner can NOW give feedback because they don't own it anymore
        await expect(reputationRegistry.connect(owner).giveFeedback(agentId, 100, 0, "", "", "", "", ethers.ZeroHash))
            .to.emit(reputationRegistry, "NewFeedback");
            
        // New owner CANNOT give feedback
        await expect(reputationRegistry.connect(newOwner).giveFeedback(agentId, 100, 0, "", "", "", "", ethers.ZeroHash))
            .to.be.revertedWith("AegisReputationRegistry: owner cannot review");
            
        // Feedback history survives
        const sum = await reputationRegistry.getSummary(agentId, [client.address, owner.address], "", "");
        expect(sum.count).to.equal(2n);
    });
});
