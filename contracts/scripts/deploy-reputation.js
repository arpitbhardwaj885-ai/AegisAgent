const hre = require("hardhat");

async function main() {
  const IDENTITY_REGISTRY_ADDRESS = "0xa7A27f96d4e8f58d701D42229d5097A69694Ca4B";

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", balance.toString());

  console.log("Deploying AegisReputationRegistry...");
  const ReputationRegistry = await hre.ethers.getContractFactory("AegisReputationRegistry");
  
  const reputationRegistry = await ReputationRegistry.deploy();
  await reputationRegistry.waitForDeployment();
  const reputationAddress = await reputationRegistry.getAddress();

  console.log("AegisReputationRegistry deployed to:", reputationAddress);

  // Initialize
  console.log("Initializing AegisReputationRegistry with IdentityRegistry:", IDENTITY_REGISTRY_ADDRESS);
  const tx = await reputationRegistry.initialize(IDENTITY_REGISTRY_ADDRESS);
  const receipt = await tx.wait();
  
  console.log("Initialization transaction hash:", receipt.hash);
  console.log("Block number:", receipt.blockNumber);
  console.log("Gas used:", receipt.gasUsed.toString());

  // Verify
  const linkedIdentity = await reputationRegistry.getIdentityRegistry();
  console.log("Verification - getIdentityRegistry() returns:", linkedIdentity);
  if (linkedIdentity.toLowerCase() !== IDENTITY_REGISTRY_ADDRESS.toLowerCase()) {
      throw new Error("Initialization failed or mismatch!");
  } else {
      console.log("Verification successful!");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
