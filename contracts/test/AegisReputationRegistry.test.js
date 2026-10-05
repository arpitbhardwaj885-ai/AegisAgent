const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AegisReputationRegistry", function () {
    let identityRegistry;
    let reputationRegistry;
    let owner;
    let client1;
    let client2;
    let operator;
    let agentId;

    beforeEach(async function () {
        [owner, client1, client2, operator] = await ethers.getSigners();

        const IdentityRegistry = await ethers.getContractFactory("AegisIdentityRegistry");
        identityRegistry = await IdentityRegistry.deploy();

        const ReputationRegistry = await ethers.getContractFactory("AegisReputationRegistry");
        reputationRegistry = await ReputationRegistry.deploy();
        
        await reputationRegistry.initialize(await identityRegistry.getAddress());

        const tx = await identityRegistry.connect(owner).register("ipfs://test-agent");
        const receipt = await tx.wait();
        const event = receipt.logs.find(l => l.fragment && l.fragment.name === 'Registered');
        agentId = event.args.agentId;

        await identityRegistry.connect(owner).setApprovalForAll(operator.address, true);
    });

    it("1. Initialization", async function () {
        expect(await reputationRegistry.getIdentityRegistry()).to.equal(await identityRegistry.getAddress());
    });

    it("2. Zero-address initialization rejection", async function () {
        const ReputationRegistry = await ethers.getContractFactory("AegisReputationRegistry");
        const registry = await ReputationRegistry.deploy();
        await expect(registry.initialize(ethers.ZeroAddress)).to.be.revertedWith("AegisReputationRegistry: zero address");
    });

    it("3. Double initialization rejection", async function () {
        await expect(reputationRegistry.initialize(await identityRegistry.getAddress())).to.be.revertedWith("AegisReputationRegistry: already initialized");
    });

    it("3b. Unauthorized address cannot initialize", async function () {
        const ReputationRegistry = await ethers.getContractFactory("AegisReputationRegistry");
        const registry = await ReputationRegistry.deploy(); // owner deploys
        await expect(registry.connect(client1).initialize(await identityRegistry.getAddress()))
            .to.be.revertedWith("AegisReputationRegistry: unauthorized");
    });

    it("4. Correct Identity Registry address", async function () {
        expect(await reputationRegistry.getIdentityRegistry()).to.equal(await identityRegistry.getAddress());
    });

    it("5. Valid feedback", async function () {
        await expect(reputationRegistry.connect(client1).giveFeedback(
            agentId, 100, 2, "quality", "task", "endpoint", "uri", ethers.ZeroHash
        )).to.emit(reputationRegistry, "NewFeedback");
    });

    it("6. Correct first feedbackIndex = 1", async function () {
        await reputationRegistry.connect(client1).giveFeedback(agentId, 100, 2, "quality", "task", "endpoint", "uri", ethers.ZeroHash);
        expect(await reputationRegistry.getLastIndex(agentId, client1.address)).to.equal(1n);
    });

    it("7. Second feedback from same client gets index = 2", async function () {
        await reputationRegistry.connect(client1).giveFeedback(agentId, 100, 2, "quality", "task", "endpoint", "uri", ethers.ZeroHash);
        await reputationRegistry.connect(client1).giveFeedback(agentId, 90, 2, "quality", "task", "endpoint", "uri", ethers.ZeroHash);
        expect(await reputationRegistry.getLastIndex(agentId, client1.address)).to.equal(2n);
    });

    it("8. Different client starts at index = 1", async function () {
        await reputationRegistry.connect(client1).giveFeedback(agentId, 100, 2, "quality", "task", "endpoint", "uri", ethers.ZeroHash);
        await reputationRegistry.connect(client2).giveFeedback(agentId, 80, 2, "quality", "task", "endpoint", "uri", ethers.ZeroHash);
        expect(await reputationRegistry.getLastIndex(agentId, client2.address)).to.equal(1n);
    });

    it("9. Self-feedback rejected", async function () {
        await expect(reputationRegistry.connect(owner).giveFeedback(
            agentId, 100, 2, "quality", "task", "endpoint", "uri", ethers.ZeroHash
        )).to.be.revertedWith("AegisReputationRegistry: owner cannot review");
    });

    it("10. Approved operator feedback rejected", async function () {
        await expect(reputationRegistry.connect(operator).giveFeedback(
            agentId, 100, 2, "quality", "task", "endpoint", "uri", ethers.ZeroHash
        )).to.be.revertedWith("AegisReputationRegistry: operator cannot review");
    });

    it("11. valueDecimals > 18 rejected", async function () {
        await expect(reputationRegistry.connect(client1).giveFeedback(
            agentId, 100, 19, "quality", "task", "endpoint", "uri", ethers.ZeroHash
        )).to.be.revertedWith("AegisReputationRegistry: valueDecimals > 18");
    });

    it("12. Invalid agent rejected", async function () {
        await expect(reputationRegistry.connect(client1).giveFeedback(
            999, 100, 2, "quality", "task", "endpoint", "uri", ethers.ZeroHash
        )).to.be.revertedWith("AegisReputationRegistry: agent does not exist");
    });

    it("13. Correct NewFeedback event", async function () {
        await expect(reputationRegistry.connect(client1).giveFeedback(
            agentId, 100, 2, "quality", "task", "endpoint", "uri", ethers.ZeroHash
        ))
        .to.emit(reputationRegistry, "NewFeedback")
        .withArgs(agentId, client1.address, 1, 100, 2, "quality", "quality", "task", "endpoint", "uri", ethers.ZeroHash);
    });

    it("14. endpoint is emitted", async function () {
        // Checked in test 13
    });

    it("15. feedbackURI is emitted", async function () {
        // Checked in test 13
    });

    it("16. feedbackHash is emitted", async function () {
        // Checked in test 13
    });

    it("17. URI/hash are NOT stored", async function () {
        await reputationRegistry.connect(client1).giveFeedback(
            agentId, 100, 2, "quality", "task", "endpoint", "uri", ethers.ZeroHash
        );
        const fb = await reputationRegistry.readFeedback(agentId, client1.address, 1);
        expect(fb.value).to.equal(100n);
        expect(fb.valueDecimals).to.equal(2);
        // readFeedback does not return uri/hash
    });

    it("18. readFeedback", async function () {
        await reputationRegistry.connect(client1).giveFeedback(agentId, 100, 2, "quality", "task", "", "", ethers.ZeroHash);
        const fb = await reputationRegistry.readFeedback(agentId, client1.address, 1);
        expect(fb.value).to.equal(100n);
        expect(fb.valueDecimals).to.equal(2);
        expect(fb.tag1).to.equal("quality");
        expect(fb.tag2).to.equal("task");
        expect(fb.isRevoked).to.equal(false);
    });

    it("19. readAllFeedback", async function () {
        await reputationRegistry.connect(client1).giveFeedback(agentId, 100, 2, "quality", "task", "", "", ethers.ZeroHash);
        const [clients, , vals] = await reputationRegistry.readAllFeedback(agentId, [client1.address], "", "", true);
        expect(clients.length).to.equal(1);
        expect(vals[0]).to.equal(100n);
    });

    it("20. getClients", async function () {
        await reputationRegistry.connect(client1).giveFeedback(agentId, 100, 2, "", "", "", "", ethers.ZeroHash);
        await reputationRegistry.connect(client2).giveFeedback(agentId, 90, 2, "", "", "", "", ethers.ZeroHash);
        const clients = await reputationRegistry.getClients(agentId);
        expect(clients.length).to.equal(2);
        expect(clients[0]).to.equal(client1.address);
        expect(clients[1]).to.equal(client2.address);
    });

    it("21. getLastIndex", async function () {
        await reputationRegistry.connect(client1).giveFeedback(agentId, 100, 2, "", "", "", "", ethers.ZeroHash);
        expect(await reputationRegistry.getLastIndex(agentId, client1.address)).to.equal(1n);
    });

    it("22. tag filtering", async function () {
        await reputationRegistry.connect(client1).giveFeedback(agentId, 100, 2, "T1", "T2", "", "", ethers.ZeroHash);
        await reputationRegistry.connect(client1).giveFeedback(agentId, 90, 2, "TX", "T2", "", "", ethers.ZeroHash);
        const [, , vals] = await reputationRegistry.readAllFeedback(agentId, [client1.address], "T1", "", true);
        expect(vals.length).to.equal(1);
        expect(vals[0]).to.equal(100n);
    });

    it("23. client filtering", async function () {
        await reputationRegistry.connect(client1).giveFeedback(agentId, 100, 2, "", "", "", "", ethers.ZeroHash);
        await reputationRegistry.connect(client2).giveFeedback(agentId, 90, 2, "", "", "", "", ethers.ZeroHash);
        const [, , vals] = await reputationRegistry.readAllFeedback(agentId, [client1.address], "", "", true);
        expect(vals.length).to.equal(1);
        expect(vals[0]).to.equal(100n);
    });

    it("24. revoked feedback excluded from getSummary", async function () {
        await reputationRegistry.connect(client1).giveFeedback(agentId, 100, 0, "", "", "", "", ethers.ZeroHash);
        await reputationRegistry.connect(client1).revokeFeedback(agentId, 1);
        const summary = await reputationRegistry.getSummary(agentId, [client1.address], "", "");
        expect(summary.count).to.equal(0n);
    });

    it("25. includeRevoked behavior", async function () {
        await reputationRegistry.connect(client1).giveFeedback(agentId, 100, 0, "", "", "", "", ethers.ZeroHash);
        await reputationRegistry.connect(client1).revokeFeedback(agentId, 1);
        const [, , allExcl] = await reputationRegistry.readAllFeedback(agentId, [client1.address], "", "", false);
        expect(allExcl.length).to.equal(0);
        const [, , allIncl] = await reputationRegistry.readAllFeedback(agentId, [client1.address], "", "", true);
        expect(allIncl.length).to.equal(1);
    });

    it("26. client can revoke own feedback", async function () {
        await reputationRegistry.connect(client1).giveFeedback(agentId, 100, 0, "", "", "", "", ethers.ZeroHash);
        await expect(reputationRegistry.connect(client1).revokeFeedback(agentId, 1))
            .to.emit(reputationRegistry, "FeedbackRevoked")
            .withArgs(agentId, client1.address, 1);
    });

    it("27. another client cannot revoke it", async function () {
        await reputationRegistry.connect(client1).giveFeedback(agentId, 100, 0, "", "", "", "", ethers.ZeroHash);
        await expect(reputationRegistry.connect(client2).revokeFeedback(agentId, 1))
            .to.be.revertedWith("AegisReputationRegistry: feedback not found");
    });

    it("28. already revoked feedback cannot be revoked twice", async function () {
        await reputationRegistry.connect(client1).giveFeedback(agentId, 100, 0, "", "", "", "", ethers.ZeroHash);
        await reputationRegistry.connect(client1).revokeFeedback(agentId, 1);
        await expect(reputationRegistry.connect(client1).revokeFeedback(agentId, 1))
            .to.be.revertedWith("AegisReputationRegistry: already revoked");
    });

    it("29. revoked feedback remains readable", async function () {
        await reputationRegistry.connect(client1).giveFeedback(agentId, 100, 0, "", "", "", "", ethers.ZeroHash);
        await reputationRegistry.connect(client1).revokeFeedback(agentId, 1);
        const fb = await reputationRegistry.readFeedback(agentId, client1.address, 1);
        expect(fb.isRevoked).to.equal(true);
    });

    it("30. permissionless appendResponse", async function () {
        await reputationRegistry.connect(client1).giveFeedback(agentId, 100, 0, "", "", "", "", ethers.ZeroHash);
        await expect(reputationRegistry.connect(client2).appendResponse(agentId, client1.address, 1, "uri", ethers.ZeroHash))
            .to.emit(reputationRegistry, "ResponseAppended")
            .withArgs(agentId, client1.address, 1, client2.address, "uri", ethers.ZeroHash);
    });

    it("31. responder identity equals msg.sender", async function () {
        // Verified in 30
    });

    it("32. invalid feedback response rejected", async function () {
        await expect(reputationRegistry.connect(client2).appendResponse(agentId, client1.address, 1, "uri", ethers.ZeroHash))
            .to.be.revertedWith("AegisReputationRegistry: feedback not found");
    });

    it("33. response counting", async function () {
        await reputationRegistry.connect(client1).giveFeedback(agentId, 100, 0, "", "", "", "", ethers.ZeroHash);
        await reputationRegistry.connect(client2).appendResponse(agentId, client1.address, 1, "uri", ethers.ZeroHash);
        await reputationRegistry.connect(client2).appendResponse(agentId, client1.address, 1, "uri2", ethers.ZeroHash);
        
        const count = await reputationRegistry.getResponseCount(agentId, client1.address, 1, [client2.address]);
        expect(count).to.equal(2n);
    });

    it("34. multiple responders", async function () {
        await reputationRegistry.connect(client1).giveFeedback(agentId, 100, 0, "", "", "", "", ethers.ZeroHash);
        await reputationRegistry.connect(client2).appendResponse(agentId, client1.address, 1, "uri", ethers.ZeroHash);
        await reputationRegistry.connect(owner).appendResponse(agentId, client1.address, 1, "uri", ethers.ZeroHash);
        
        const count = await reputationRegistry.getResponseCount(agentId, client1.address, 1, [client2.address, owner.address]);
        expect(count).to.equal(2n);
    });

    it("35. summary with same decimals", async function () {
        await reputationRegistry.connect(client1).giveFeedback(agentId, 100, 0, "", "", "", "", ethers.ZeroHash);
        await reputationRegistry.connect(client2).giveFeedback(agentId, 200, 0, "", "", "", "", ethers.ZeroHash);
        
        const sum = await reputationRegistry.getSummary(agentId, [client1.address, client2.address], "", "");
        // 100 * 10^18 + 200 * 10^18 = 300 * 10^18 / 2 = 150 * 10^18
        expect(sum.summaryValue).to.equal(150n * 10n**18n);
        expect(sum.summaryValueDecimals).to.equal(18);
    });

    it("36. summary with different decimals", async function () {
        await reputationRegistry.connect(client1).giveFeedback(agentId, 50, 0, "", "", "", "", ethers.ZeroHash);
        await reputationRegistry.connect(client2).giveFeedback(agentId, 5000, 2, "", "", "", "", ethers.ZeroHash);
        
        const sum = await reputationRegistry.getSummary(agentId, [client1.address, client2.address], "", "");
        expect(sum.summaryValue).to.equal(50n * 10n**18n); // Average of 50 and 50 is 50
    });

    it("37. negative feedback values", async function () {
        await reputationRegistry.connect(client1).giveFeedback(agentId, -100, 0, "", "", "", "", ethers.ZeroHash);
        const sum = await reputationRegistry.getSummary(agentId, [client1.address], "", "");
        expect(sum.summaryValue).to.equal(-100n * 10n**18n);
    });

    it("38. mixed positive/negative values", async function () {
        await reputationRegistry.connect(client1).giveFeedback(agentId, -100, 0, "", "", "", "", ethers.ZeroHash);
        await reputationRegistry.connect(client2).giveFeedback(agentId, 300, 0, "", "", "", "", ethers.ZeroHash);
        const sum = await reputationRegistry.getSummary(agentId, [client1.address, client2.address], "", "");
        expect(sum.summaryValue).to.equal(100n * 10n**18n);
    });

    it("39. summary client filtering", async function () {
        await reputationRegistry.connect(client1).giveFeedback(agentId, 100, 0, "", "", "", "", ethers.ZeroHash);
        await reputationRegistry.connect(client2).giveFeedback(agentId, 200, 0, "", "", "", "", ethers.ZeroHash);
        const sum = await reputationRegistry.getSummary(agentId, [client1.address], "", "");
        expect(sum.summaryValue).to.equal(100n * 10n**18n);
    });

    it("40. summary tag filtering", async function () {
        await reputationRegistry.connect(client1).giveFeedback(agentId, 100, 0, "quality", "", "", "", ethers.ZeroHash);
        await reputationRegistry.connect(client2).giveFeedback(agentId, 200, 0, "speed", "", "", "", ethers.ZeroHash);
        const sum = await reputationRegistry.getSummary(agentId, [client1.address, client2.address], "quality", "");
        expect(sum.summaryValue).to.equal(100n * 10n**18n);
        expect(sum.count).to.equal(1n);
    });

    describe("M-01 Normalization Bounds", function () {
        it("1. int128 max with decimals=0 -> rejected", async function () {
            const int128Max = (2n ** 127n) - 1n;
            await expect(reputationRegistry.connect(client1).giveFeedback(
                agentId, int128Max, 0, "", "", "", "", ethers.ZeroHash
            )).to.be.revertedWith("AegisReputationRegistry: normalized value overflow");
        });

        it("2. int128 min with decimals=0 -> rejected", async function () {
            const int128Min = -(2n ** 127n);
            await expect(reputationRegistry.connect(client1).giveFeedback(
                agentId, int128Min, 0, "", "", "", "", ethers.ZeroHash
            )).to.be.revertedWith("AegisReputationRegistry: normalized value overflow");
        });

        it("3. values that exactly fit int128 after normalization -> accepted", async function () {
            const int128Max = (2n ** 127n) - 1n;
            const maxAllowedValue = int128Max / (10n ** 18n);
            await expect(reputationRegistry.connect(client1).giveFeedback(
                agentId, maxAllowedValue, 0, "", "", "", "", ethers.ZeroHash
            )).to.not.be.reverted;
        });

        it("4. values just outside the normalized int128 range -> rejected", async function () {
            const int128Max = (2n ** 127n) - 1n;
            const maxAllowedValue = int128Max / (10n ** 18n);
            await expect(reputationRegistry.connect(client2).giveFeedback(
                agentId, maxAllowedValue + 1n, 0, "", "", "", "", ethers.ZeroHash
            )).to.be.revertedWith("AegisReputationRegistry: normalized value overflow");
        });

        it("5. normal values continue to work", async function () {
            await reputationRegistry.connect(client1).giveFeedback(agentId, 50, 0, "test", "", "", "", ethers.ZeroHash);
            await reputationRegistry.connect(client1).giveFeedback(agentId, 5000, 2, "test", "", "", "", ethers.ZeroHash);
            await reputationRegistry.connect(client1).giveFeedback(agentId, 9977, 2, "test", "", "", "", ethers.ZeroHash);
            await reputationRegistry.connect(client1).giveFeedback(agentId, -32, 1, "test", "", "", "", ethers.ZeroHash);
            await reputationRegistry.connect(client1).giveFeedback(agentId, 560, 0, "test", "", "", "", ethers.ZeroHash);

            const sum = await reputationRegistry.getSummary(agentId, [client1.address], "test", "");
            expect(sum.count).to.equal(5n);
        });
    });
});
