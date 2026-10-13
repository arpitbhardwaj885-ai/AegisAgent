const hre = require("hardhat");

async function main() {
  const IDENTITY_REGISTRY_ADDRESS =
    process.env.IDENTITY_REGISTRY_ADDRESS || "0xa7A27f96d4e8f58d701D42229d5097A69694Ca4B";
  const VALIDATION_REGISTRY_ADDRESS =
    process.env.VALIDATION_REGISTRY_ADDRESS || "0x802DE575B528453C8208d5201e27464d63970e2b";
  const DEFAULT_ARBITER_ADDRESS = process.env.DEFAULT_ARBITER_ADDRESS;

  console.log("=== AegisHiringEscrow Deployment Preparation ===");
  console.log("Network:", hre.network.name);

  // Network verification
  if (hre.network.name === "monadTestnet") {
    const net = await hre.ethers.provider.getNetwork();
    if (net.chainId !== 10143n) {
      throw new Error(`Unexpected chainId: ${net.chainId}, expected 10143 for Monad Testnet.`);
    }
  }

  // Parameter validation
  const rawArbiter = (process.env.DEFAULT_ARBITER_ADDRESS || "").trim();
  if (!rawArbiter) {
    throw new Error(
      "DEPLOYMENT BLOCKED: DEFAULT_ARBITER_ADDRESS is unset or empty in the environment.\n" +
      "Action required: Set DEFAULT_ARBITER_ADDRESS in .env or pass as an environment variable before deploying."
    );
  }

  if (!hre.ethers.isAddress(rawArbiter)) {
    throw new Error(
      `DEPLOYMENT BLOCKED: DEFAULT_ARBITER_ADDRESS '${rawArbiter}' has invalid EVM address syntax.\n` +
      "Must be a 20-byte hexadecimal address (e.g. 0x...)."
    );
  }

  const defaultArbiterChecksum = hre.ethers.getAddress(rawArbiter);
  if (defaultArbiterChecksum === hre.ethers.ZeroAddress) {
    throw new Error(
      "DEPLOYMENT BLOCKED: DEFAULT_ARBITER_ADDRESS cannot be the zero address (0x0000000000000000000000000000000000000000)."
    );
  }

  if (!hre.ethers.isAddress(IDENTITY_REGISTRY_ADDRESS)) {
    throw new Error(`Invalid identity registry address: ${IDENTITY_REGISTRY_ADDRESS}`);
  }
  const identityRegistryChecksum = hre.ethers.getAddress(IDENTITY_REGISTRY_ADDRESS);

  if (!hre.ethers.isAddress(VALIDATION_REGISTRY_ADDRESS)) {
    throw new Error(`Invalid validation registry address: ${VALIDATION_REGISTRY_ADDRESS}`);
  }
  const validationRegistryChecksum = hre.ethers.getAddress(VALIDATION_REGISTRY_ADDRESS);

  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer signer configured.");
  }

  console.log("Deployer account:", deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", hre.ethers.formatEther(balance), "MON");

  if (balance === 0n) {
    throw new Error("Deployer account has 0 balance. Please fund deployer with testnet MON.");
  }

  if (defaultArbiterChecksum.toLowerCase() === deployer.address.toLowerCase()) {
    console.log("NOTE: DEFAULT_ARBITER_ADDRESS is identical to deployer account address.");
  }

  console.log("\nConstructor Parameters:");
  console.log("1. identityRegistry:  ", identityRegistryChecksum);
  console.log("2. validationRegistry:", validationRegistryChecksum);
  console.log("3. defaultArbiter:     ", defaultArbiterChecksum);

  const isValidateOnly =
    process.argv.includes("--validate-only") || process.env.VALIDATE_ONLY === "true";

  if (isValidateOnly) {
    console.log("\n>>> [VALIDATE-ONLY] All pre-deployment address and parameter checks passed. Deployment skipped. <<<");
    return;
  }

  console.log("\nDeploying AegisHiringEscrow...");
  const EscrowFactory = await hre.ethers.getContractFactory("AegisHiringEscrow");
  const escrow = await EscrowFactory.deploy(
    identityRegistryChecksum,
    validationRegistryChecksum,
    defaultArbiterChecksum
  );

  await escrow.waitForDeployment();
  const escrowAddress = await escrow.getAddress();
  const deployTx = escrow.deploymentTransaction();

  console.log("\n>>> AegisHiringEscrow deployed successfully! <<<");
  console.log("Contract Address:", escrowAddress);
  console.log("Transaction Hash:", deployTx.hash);

  const receipt = await deployTx.wait();
  console.log("Receipt Status:  ", receipt.status);
  console.log("Block Number:    ", receipt.blockNumber);
  console.log("Gas Used:        ", receipt.gasUsed.toString());
  if (receipt.gasPrice) {
    console.log("Effective Gas Price:", receipt.gasPrice.toString(), "wei");
  }

  // Post-deployment verification of immutable getters
  console.log("\n--- Verifying Immutable Getters ---");
  const onChainIdentity = await escrow.identityRegistry();
  const onChainValidation = await escrow.validationRegistry();
  const onChainArbiter = await escrow.defaultArbiter();

  console.log("escrow.identityRegistry():  ", onChainIdentity);
  console.log("escrow.validationRegistry():", onChainValidation);
  console.log("escrow.defaultArbiter():     ", onChainArbiter);

  if (onChainIdentity.toLowerCase() !== identityRegistryChecksum.toLowerCase()) {
    throw new Error("Identity registry mismatch after deployment!");
  }
  if (onChainValidation.toLowerCase() !== validationRegistryChecksum.toLowerCase()) {
    throw new Error("Validation registry mismatch after deployment!");
  }
  if (onChainArbiter.toLowerCase() !== defaultArbiterChecksum.toLowerCase()) {
    throw new Error("Default arbiter mismatch after deployment!");
  }

  console.log(">>> Verification Successful! Record this address in HIRING_ESCROW_ADDRESS and frontend .env. <<<");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nDeployment Error:", error.message || error);
    process.exit(1);
  });
