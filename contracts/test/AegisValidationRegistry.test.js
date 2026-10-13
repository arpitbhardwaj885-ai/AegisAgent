const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AegisValidationRegistry", function () {
    let identityRegistry;
    let validationRegistry;
    let owner;
    let newOwner;
    let validator;
    let operator;
    let other;
    let agentId;
    let requestHash;
    let requestHash2;

    beforeEach(async function () {
        [owner, newOwner, validator, operator, other] = await ethers.getSigners();

        const IdentityRegistry = await ethers.getContractFactory("AegisIdentityRegistry");
        identityRegistry = await IdentityRegistry.deploy();

        const ValidationRegistry = await ethers.getContractFactory("AegisValidationRegistry");
        validationRegistry = await ValidationRegistry.deploy();

        await validationRegistry.initialize(await identityRegistry.getAddress());

        const tx = await identityRegistry.connect(owner).register("ipfs://test-agent");
        const receipt = await tx.wait();
        const event = receipt.logs.find(l => l.fragment && l.fragment.name === 'Registered');
        agentId = event.args.agentId;

        await identityRegistry.connect(owner).setApprovalForAll(operator.address, true);

        requestHash = ethers.keccak256(ethers.toUtf8Bytes("request1"));
        requestHash2 = ethers.keccak256(ethers.toUtf8Bytes("request2"));
    });

    describe("Initialization", function () {
        it("authorized initialization", async function () {
            expect(await validationRegistry.getIdentityRegistry()).to.equal(await identityRegistry.getAddress());
        });

        it("unauthorized initialization", async function () {
            const ValidationRegistry = await ethers.getContractFactory("AegisValidationRegistry");
            const registry = await ValidationRegistry.deploy();
            await expect(registry.connect(other).initialize(await identityRegistry.getAddress()))
                .to.be.revertedWith("AegisValidationRegistry: unauthorized");
        });

        it("double initialization", async function () {
            await expect(validationRegistry.initialize(await identityRegistry.getAddress()))
                .to.be.revertedWith("AegisValidationRegistry: already initialized");
        });

        it("zero identity registry", async function () {
            const ValidationRegistry = await ethers.getContractFactory("AegisValidationRegistry");
            const registry = await ValidationRegistry.deploy();
            await expect(registry.initialize(ethers.ZeroAddress))
                .to.be.revertedWith("AegisValidationRegistry: zero address");
        });
    });

    describe("Requests", function () {
        it("valid request", async function () {
            await expect(validationRegistry.connect(owner).validationRequest(
                validator.address, agentId, "uri", requestHash
            )).to.emit(validationRegistry, "ValidationRequest")
              .withArgs(validator.address, agentId, "uri", requestHash);
        });

        it("nonexistent agent", async function () {
            await expect(validationRegistry.connect(owner).validationRequest(
                validator.address, 999, "uri", requestHash
            )).to.be.revertedWith("AegisValidationRegistry: agent does not exist");
        });

        it("unauthorized requester", async function () {
            await expect(validationRegistry.connect(other).validationRequest(
                validator.address, agentId, "uri", requestHash
            )).to.be.revertedWith("AegisValidationRegistry: unauthorized requester");
        });

        it("approved operator", async function () {
            await identityRegistry.connect(owner).approve(other.address, agentId);
            await expect(validationRegistry.connect(other).validationRequest(
                validator.address, agentId, "uri", requestHash
            )).to.emit(validationRegistry, "ValidationRequest");
        });

        it("setApprovalForAll operator", async function () {
            await expect(validationRegistry.connect(operator).validationRequest(
                validator.address, agentId, "uri", requestHash
            )).to.emit(validationRegistry, "ValidationRequest");
        });

        it("zero validator", async function () {
            await expect(validationRegistry.connect(owner).validationRequest(
                ethers.ZeroAddress, agentId, "uri", requestHash
            )).to.be.revertedWith("AegisValidationRegistry: zero validator");
        });

        it("duplicate requestHash", async function () {
            await validationRegistry.connect(owner).validationRequest(validator.address, agentId, "uri", requestHash);
            await expect(validationRegistry.connect(owner).validationRequest(
                validator.address, agentId, "uri2", requestHash
            )).to.be.revertedWith("AegisValidationRegistry: hash already exists");
        });
    });

    describe("Responses", function () {
        beforeEach(async function () {
            await validationRegistry.connect(owner).validationRequest(validator.address, agentId, "uri", requestHash);
        });

        it("valid response", async function () {
            await expect(validationRegistry.connect(validator).validationResponse(
                requestHash, 50, "resURI", ethers.ZeroHash, "tag1"
            )).to.emit(validationRegistry, "ValidationResponse")
              .withArgs(validator.address, agentId, requestHash, 50, "resURI", ethers.ZeroHash, "tag1");
        });

        it("response 0", async function () {
            await validationRegistry.connect(validator).validationResponse(requestHash, 0, "resURI", ethers.ZeroHash, "tag1");
            const status = await validationRegistry.getValidationStatus(requestHash);
            expect(status.response).to.equal(0);
        });

        it("response 100", async function () {
            await validationRegistry.connect(validator).validationResponse(requestHash, 100, "resURI", ethers.ZeroHash, "tag1");
            const status = await validationRegistry.getValidationStatus(requestHash);
            expect(status.response).to.equal(100);
        });

        it("response > 100", async function () {
            await expect(validationRegistry.connect(validator).validationResponse(
                requestHash, 101, "resURI", ethers.ZeroHash, "tag1"
            )).to.be.revertedWith("AegisValidationRegistry: invalid response > 100");
        });

        it("unauthorized validator", async function () {
            await expect(validationRegistry.connect(other).validationResponse(
                requestHash, 50, "resURI", ethers.ZeroHash, "tag1"
            )).to.be.revertedWith("AegisValidationRegistry: unauthorized validator");
        });

        it("nonexistent request", async function () {
            await expect(validationRegistry.connect(validator).validationResponse(
                requestHash2, 50, "resURI", ethers.ZeroHash, "tag1"
            )).to.be.revertedWith("AegisValidationRegistry: request not found");
        });

        it("repeated response updates", async function () {
            await validationRegistry.connect(validator).validationResponse(requestHash, 50, "resURI", ethers.ZeroHash, "tag1");
            await validationRegistry.connect(validator).validationResponse(requestHash, 75, "resURI2", ethers.ZeroHash, "tag2");
            const status = await validationRegistry.getValidationStatus(requestHash);
            expect(status.response).to.equal(75);
            expect(status.tag).to.equal("tag2");
        });
        
        it("response hash update", async function () {
            const h = ethers.keccak256(ethers.toUtf8Bytes("testhash"));
            await validationRegistry.connect(validator).validationResponse(requestHash, 50, "resURI", h, "tag1");
            const status = await validationRegistry.getValidationStatus(requestHash);
            expect(status.responseHash).to.equal(h);
        });
        
        it("tag update", async function () {
            await validationRegistry.connect(validator).validationResponse(requestHash, 50, "resURI", ethers.ZeroHash, "newtag");
            const status = await validationRegistry.getValidationStatus(requestHash);
            expect(status.tag).to.equal("newtag");
        });
    });

    describe("Views", function () {
        beforeEach(async function () {
            await validationRegistry.connect(owner).validationRequest(validator.address, agentId, "uri", requestHash);
            await validationRegistry.connect(owner).validationRequest(validator.address, agentId, "uri2", requestHash2);
        });

        it("getValidationStatus", async function () {
            await validationRegistry.connect(validator).validationResponse(requestHash, 50, "resURI", ethers.ZeroHash, "tag1");
            const status = await validationRegistry.getValidationStatus(requestHash);
            expect(status.validatorAddress).to.equal(validator.address);
            expect(status.agentId).to.equal(agentId);
            expect(status.response).to.equal(50);
            expect(status.tag).to.equal("tag1");
        });

        it("getAgentValidations", async function () {
            const validations = await validationRegistry.getAgentValidations(agentId);
            expect(validations.length).to.equal(2);
            expect(validations[0]).to.equal(requestHash);
            expect(validations[1]).to.equal(requestHash2);
        });

        it("getValidatorRequests", async function () {
            const reqs = await validationRegistry.getValidatorRequests(validator.address);
            expect(reqs.length).to.equal(2);
            expect(reqs[0]).to.equal(requestHash);
        });
    });

    describe("Summary", function () {
        beforeEach(async function () {
            await validationRegistry.connect(owner).validationRequest(validator.address, agentId, "uri", requestHash);
            await validationRegistry.connect(owner).validationRequest(other.address, agentId, "uri2", requestHash2);
        });

        it("no completed validations", async function () {
            const sum = await validationRegistry.getSummary(agentId, [], "");
            expect(sum.count).to.equal(0n);
            expect(sum.averageResponse).to.equal(0);
        });

        it("one validation", async function () {
            await validationRegistry.connect(validator).validationResponse(requestHash, 50, "res", ethers.ZeroHash, "tag");
            const sum = await validationRegistry.getSummary(agentId, [], "");
            expect(sum.count).to.equal(1n);
            expect(sum.averageResponse).to.equal(50);
        });

        it("multiple validations", async function () {
            await validationRegistry.connect(validator).validationResponse(requestHash, 50, "res", ethers.ZeroHash, "tag");
            await validationRegistry.connect(other).validationResponse(requestHash2, 100, "res", ethers.ZeroHash, "tag");
            const sum = await validationRegistry.getSummary(agentId, [], "");
            expect(sum.count).to.equal(2n);
            expect(sum.averageResponse).to.equal(75);
        });

        it("same validator multiple requests", async function () {
            const h3 = ethers.keccak256(ethers.toUtf8Bytes("request3"));
            await validationRegistry.connect(owner).validationRequest(validator.address, agentId, "uri3", h3);
            await validationRegistry.connect(validator).validationResponse(requestHash, 20, "res", ethers.ZeroHash, "tag");
            await validationRegistry.connect(validator).validationResponse(h3, 80, "res", ethers.ZeroHash, "tag");
            
            const sum = await validationRegistry.getSummary(agentId, [validator.address], "");
            expect(sum.count).to.equal(2n);
            expect(sum.averageResponse).to.equal(50);
        });

        it("validator filtering", async function () {
            await validationRegistry.connect(validator).validationResponse(requestHash, 50, "res", ethers.ZeroHash, "tag");
            await validationRegistry.connect(other).validationResponse(requestHash2, 100, "res", ethers.ZeroHash, "tag");
            const sum = await validationRegistry.getSummary(agentId, [other.address], "");
            expect(sum.count).to.equal(1n);
            expect(sum.averageResponse).to.equal(100);
        });

        it("tag filtering", async function () {
            await validationRegistry.connect(validator).validationResponse(requestHash, 50, "res", ethers.ZeroHash, "tag1");
            await validationRegistry.connect(other).validationResponse(requestHash2, 100, "res", ethers.ZeroHash, "tag2");
            const sum = await validationRegistry.getSummary(agentId, [], "tag2");
            expect(sum.count).to.equal(1n);
            expect(sum.averageResponse).to.equal(100);
        });

        it("exact case-sensitive tag matching", async function () {
            await validationRegistry.connect(validator).validationResponse(requestHash, 50, "res", ethers.ZeroHash, "tag1");
            const sum = await validationRegistry.getSummary(agentId, [], "TAG1");
            expect(sum.count).to.equal(0n);
        });

        it("response 0 included", async function () {
            await validationRegistry.connect(validator).validationResponse(requestHash, 0, "res", ethers.ZeroHash, "tag");
            const sum = await validationRegistry.getSummary(agentId, [], "");
            expect(sum.count).to.equal(1n);
            expect(sum.averageResponse).to.equal(0);
        });

        it("response 100 included", async function () {
            await validationRegistry.connect(validator).validationResponse(requestHash, 100, "res", ethers.ZeroHash, "tag");
            const sum = await validationRegistry.getSummary(agentId, [], "");
            expect(sum.count).to.equal(1n);
            expect(sum.averageResponse).to.equal(100);
        });

        it("average calculation", async function () {
            await validationRegistry.connect(validator).validationResponse(requestHash, 33, "res", ethers.ZeroHash, "tag");
            await validationRegistry.connect(other).validationResponse(requestHash2, 66, "res", ethers.ZeroHash, "tag");
            const sum = await validationRegistry.getSummary(agentId, [], "");
            expect(sum.count).to.equal(2n);
            expect(sum.averageResponse).to.equal(49); // 99 / 2 = 49
        });
    });

    describe("Transfer", function () {
        it("request before transfer", async function () {
            await validationRegistry.connect(owner).validationRequest(validator.address, agentId, "uri", requestHash);
            await identityRegistry.connect(owner).transferFrom(owner.address, newOwner.address, agentId);
            
            // Should still be able to respond
            await expect(validationRegistry.connect(validator).validationResponse(
                requestHash, 50, "resURI", ethers.ZeroHash, "tag"
            )).to.not.be.reverted;
        });

        it("response after transfer", async function () {
            await validationRegistry.connect(owner).validationRequest(validator.address, agentId, "uri", requestHash);
            await identityRegistry.connect(owner).transferFrom(owner.address, newOwner.address, agentId);
            await validationRegistry.connect(validator).validationResponse(requestHash, 50, "resURI", ethers.ZeroHash, "tag");
            const sum = await validationRegistry.getSummary(agentId, [], "");
            expect(sum.count).to.equal(1n);
        });

        it("old owner rejected", async function () {
            await identityRegistry.connect(owner).transferFrom(owner.address, newOwner.address, agentId);
            await expect(validationRegistry.connect(owner).validationRequest(
                validator.address, agentId, "uri", requestHash
            )).to.be.revertedWith("AegisValidationRegistry: unauthorized requester");
        });

        it("new owner accepted", async function () {
            await identityRegistry.connect(owner).transferFrom(owner.address, newOwner.address, agentId);
            await expect(validationRegistry.connect(newOwner).validationRequest(
                validator.address, agentId, "uri", requestHash
            )).to.emit(validationRegistry, "ValidationRequest");
        });
    });
});
