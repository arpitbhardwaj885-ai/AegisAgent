const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AegisIdentityRegistry", function () {
  let registry;
  let owner;
  let addr1;
  let addr2;
  let mockERC1271;

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();
    const AegisIdentityRegistry = await ethers.getContractFactory("AegisIdentityRegistry");
    registry = await AegisIdentityRegistry.deploy();

    const MockERC1271Wallet = await ethers.getContractFactory("MockERC1271Wallet");
    mockERC1271 = await MockERC1271Wallet.deploy();
  });

  const getSignature = async (agentId, newWallet, nonce, deadline, signer) => {
    const domain = {
      name: "AegisIdentityRegistry",
      version: "1",
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await registry.getAddress()
    };
    
    const types = {
      SetAgentWallet: [
        { name: "agentId", type: "uint256" },
        { name: "newWallet", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" }
      ]
    };
    
    const value = { agentId, newWallet, nonce, deadline };
    return await signer.signTypedData(domain, types, value);
  };

  describe("Deployment", function () {
    it("Should deploy successfully", async function () {
      expect(await registry.getAddress()).to.properAddress;
    });

    it("Should return correct getAgentRegistry format", async function () {
      const network = await ethers.provider.getNetwork();
      const chainId = network.chainId;
      const expectedPrefix = `eip155:${chainId}:`;
      const result = await registry.getAgentRegistry();
      expect(result.startsWith(expectedPrefix)).to.be.true;
      expect(result.toLowerCase()).to.include((await registry.getAddress()).toLowerCase());
    });
  });

  describe("Registration", function () {
    it("Should register a new agent, emit event, and set initial state", async function () {
      const uri = "ipfs://test";
      const tx = await registry.connect(addr1).register(uri);
      
      const agentId = 1;
      expect(await registry.ownerOf(agentId)).to.equal(addr1.address);
      expect(await registry.tokenURI(agentId)).to.equal(uri);
      expect(await registry.getAgentWallet(agentId)).to.equal(addr1.address);
      
      await expect(tx).to.emit(registry, "Registered").withArgs(agentId, uri, addr1.address);
    });

    it("Should emit MetadataSet for the initial agentWallet upon registration", async function () {
      const uri = "ipfs://test_metadata";
      const tx = await registry.connect(addr1).register(uri);
      const agentId = await registry.ownerOf(1) === addr1.address ? 1 : 2; // getting the actual agentId, usually 1 or 2 depending on tests before it if any, but beforeEach resets
      
      const expectedMetadataValue = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [addr1.address]);
      
      await expect(tx)
        .to.emit(registry, "MetadataSet")
        .withArgs(1, "agentWallet", "agentWallet", expectedMetadataValue);
        
      expect(await registry.getAgentWallet(1)).to.equal(addr1.address);
    });

    it("Should generate sequential agent IDs and support multiple agents", async function () {
      await registry.connect(addr1).register("uri1");
      await registry.connect(addr2).register("uri2");
      expect(await registry.ownerOf(1)).to.equal(addr1.address);
      expect(await registry.ownerOf(2)).to.equal(addr2.address);
    });
  });

  describe("URI Updates", function () {
    it("Should allow owner to update URI", async function () {
      await registry.connect(addr1).register("ipfs://test1");
      await expect(registry.connect(addr1).setAgentURI(1, "ipfs://test2"))
        .to.emit(registry, "URIUpdated")
        .withArgs(1, "ipfs://test2", addr1.address);
      expect(await registry.tokenURI(1)).to.equal("ipfs://test2");
    });
  });

  describe("Wallet Management (EIP-712 & ERC-1271)", function () {
    let deadline;
    beforeEach(async function () {
      deadline = Math.floor(Date.now() / 1000) + 3600;
      await registry.connect(addr1).register("ipfs://test1");
    });

    it("Should allow owner to update wallet with valid EOA signature", async function () {
      const nonce = await registry.nonces(addr2.address);
      const signature = await getSignature(1, addr2.address, nonce, deadline, addr2);
      
      await expect(registry.connect(addr1).setAgentWallet(1, addr2.address, deadline, signature))
        .to.emit(registry, "AgentWalletUpdated")
        .withArgs(1, addr1.address, addr2.address);
      
      expect(await registry.getAgentWallet(1)).to.equal(addr2.address);
    });

    it("Should reject wallet update if signature is invalid", async function () {
      const nonce = await registry.nonces(addr2.address);
      const signature = await getSignature(1, addr2.address, nonce, deadline, addr1); // wrong signer
      
      await expect(registry.connect(addr1).setAgentWallet(1, addr2.address, deadline, signature))
        .to.be.revertedWith("AegisIdentityRegistry: Invalid signature");
    });

    it("Should reject wallet update if signature is for wrong agent", async function () {
      const nonce = await registry.nonces(addr2.address);
      const signature = await getSignature(2, addr2.address, nonce, deadline, addr2); 
      
      await expect(registry.connect(addr1).setAgentWallet(1, addr2.address, deadline, signature))
        .to.be.revertedWith("AegisIdentityRegistry: Invalid signature");
    });

    it("Should reject wallet update if expired", async function () {
      const expiredDeadline = Math.floor(Date.now() / 1000) - 3600;
      const nonce = await registry.nonces(addr2.address);
      const signature = await getSignature(1, addr2.address, nonce, expiredDeadline, addr2);
      
      await expect(registry.connect(addr1).setAgentWallet(1, addr2.address, expiredDeadline, signature))
        .to.be.revertedWith("AegisIdentityRegistry: Signature expired");
    });

    it("Should prevent signature replay", async function () {
      const nonce = await registry.nonces(addr2.address);
      const signature = await getSignature(1, addr2.address, nonce, deadline, addr2);
      
      await registry.connect(addr1).setAgentWallet(1, addr2.address, deadline, signature);
      
      // Try again with same signature
      await expect(registry.connect(addr1).setAgentWallet(1, addr2.address, deadline, signature))
        .to.be.revertedWith("AegisIdentityRegistry: Invalid signature");
    });

    it("Should allow valid mock ERC-1271 wallet", async function () {
      const mockAddr = await mockERC1271.getAddress();
      const nonce = await registry.nonces(mockAddr);
      // Dummy signature for contract wallet (doesn't matter since mock accepts anything unless told not to)
      const signature = "0x1234";
      
      await expect(registry.connect(addr1).setAgentWallet(1, mockAddr, deadline, signature))
        .to.emit(registry, "AgentWalletUpdated")
        .withArgs(1, addr1.address, mockAddr);
        
      expect(await registry.getAgentWallet(1)).to.equal(mockAddr);
    });

    it("Should reject invalid ERC-1271 signature", async function () {
      await mockERC1271.setBehavior(false, true);
      const mockAddr = await mockERC1271.getAddress();
      const nonce = await registry.nonces(mockAddr);
      const signature = "0x1234";
      
      await expect(registry.connect(addr1).setAgentWallet(1, mockAddr, deadline, signature))
        .to.be.revertedWith("AegisIdentityRegistry: Invalid signature");
    });
  });

  describe("Transfer Behavior", function () {
    it("Should clear agentWallet on NFT transfer", async function () {
      await registry.connect(addr1).register("ipfs://test1");
      
      expect(await registry.getAgentWallet(1)).to.equal(addr1.address);
      
      await expect(registry.connect(addr1).transferFrom(addr1.address, addr2.address, 1))
        .to.emit(registry, "AgentWalletUpdated")
        .withArgs(1, addr1.address, ethers.ZeroAddress);
        
      expect(await registry.getAgentWallet(1)).to.equal(ethers.ZeroAddress);
      expect(await registry.ownerOf(1)).to.equal(addr2.address);
    });

    it("Should NOT clear wallet during initial minting", async function () {
      const tx = await registry.connect(addr1).register("ipfs://test1");
      
      // Expected an event AgentWalletUpdated(1, 0, addr1), and not AgentWalletUpdated(1, x, 0)
      expect(await registry.getAgentWallet(1)).to.equal(addr1.address);
    });
  });

  describe("unsetAgentWallet", function () {
    it("Should allow authorized caller to unset wallet", async function () {
      await registry.connect(addr1).register("ipfs://test1");
      await expect(registry.connect(addr1).unsetAgentWallet(1))
        .to.emit(registry, "AgentWalletUpdated")
        .withArgs(1, addr1.address, ethers.ZeroAddress);
        
      expect(await registry.getAgentWallet(1)).to.equal(ethers.ZeroAddress);
    });

    it("Should reject unset from unauthorized caller", async function () {
      await registry.connect(addr1).register("ipfs://test1");
      await expect(registry.connect(addr2).unsetAgentWallet(1))
        .to.be.revertedWith("AegisIdentityRegistry: Not authorized");
    });
  });

  describe("Metadata Management", function () {
    it("Should allow owner to set and get metadata", async function () {
      await registry.connect(addr1).register("ipfs://test1");
      const key = "capability";
      const value = ethers.toUtf8Bytes("trading");
      
      await expect(registry.connect(addr1).setMetadata(1, key, value))
        .to.emit(registry, "MetadataSet")
        .withArgs(1, key, key, ethers.hexlify(value));
        
      expect(await registry.getMetadata(1, key)).to.equal(ethers.hexlify(value));
    });

    it("Should reject modifying reserved agentWallet key", async function () {
      await registry.connect(addr1).register("ipfs://test1");
      const value = ethers.toUtf8Bytes("some_wallet");
      await expect(registry.connect(addr1).setMetadata(1, "agentWallet", value))
        .to.be.revertedWith("AegisIdentityRegistry: Reserved key");
    });
  });
});
