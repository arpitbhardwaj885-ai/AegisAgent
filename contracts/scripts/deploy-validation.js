const hre = require("hardhat");

async function main() {
  const IDENTITY_REGISTRY_ADDRESS = "0xa7A27f96d4e8f58d701D42229d5097A69694Ca4B";

  const signers = await hre.ethers.getSigners();
  const deployer = signers[0];
  
  // Create a random wallet for the validator to ensure it's different from deployer (agent owner)
  const validator = hre.ethers.Wallet.createRandom().connect(hre.ethers.provider);
  
  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Validator account:", validator.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", balance.toString());

  console.log("Funding validator with 0.1 MON...");
  const fundTx = await deployer.sendTransaction({
      to: validator.address,
      value: hre.ethers.parseEther("0.1")
  });
  await fundTx.wait();
  console.log("Validator funded.");

  console.log("Deploying AegisValidationRegistry...");
  const ValidationRegistry = await hre.ethers.getContractFactory("AegisValidationRegistry");
  
  const validationRegistry = await ValidationRegistry.deploy();
  await validationRegistry.waitForDeployment();
  const validationAddress = await validationRegistry.getAddress();

  console.log("AegisValidationRegistry deployed to:", validationAddress);
  const deployTx = validationRegistry.deploymentTransaction();
  console.log("Deployment transaction hash:", deployTx.hash);
  if (deployTx.blockNumber) {
    console.log("Deployment block number:", deployTx.blockNumber);
  } else {
    const receipt = await deployTx.wait();
    console.log("Deployment block number:", receipt.blockNumber);
  }

  // Initialize
  console.log("Initializing AegisValidationRegistry with IdentityRegistry:", IDENTITY_REGISTRY_ADDRESS);
  const tx = await validationRegistry.initialize(IDENTITY_REGISTRY_ADDRESS);
  const receipt = await tx.wait();
  
  console.log("Initialization transaction hash:", receipt.hash);
  console.log("Initialization block number:", receipt.blockNumber);
  console.log("Initialization gas used:", receipt.gasUsed.toString());

  // Verify
  const linkedIdentity = await validationRegistry.getIdentityRegistry();
  console.log("Verification - getIdentityRegistry() returns:", linkedIdentity);
  if (linkedIdentity.toLowerCase() !== IDENTITY_REGISTRY_ADDRESS.toLowerCase()) {
      throw new Error("Initialization failed or mismatch!");
  } else {
      console.log("Initialization verification successful!");
  }

  // --- SMOKE TEST ---
  console.log("--- Starting Smoke Test ---");
  const agentId = 1n;
  
  const timestamp = Date.now().toString();
  const requestPayload = hre.ethers.toUtf8Bytes("smoke-test-" + timestamp);
  const requestHash = hre.ethers.keccak256(requestPayload);
  const responseHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("smoke-response-" + timestamp));

  console.log("Agent ID:", agentId.toString());
  console.log("Validator:", validator.address);
  console.log("Request hash:", requestHash);

  // Request Validation
  console.log("Sending validation request...");
  const reqTx = await validationRegistry.connect(deployer).validationRequest(
      validator.address,
      agentId,
      "https://aegisagent.local/test-validation-request",
      requestHash
  );
  await reqTx.wait();
  console.log("Request TX hash:", reqTx.hash);

  // Respond Validation
  console.log("Sending validation response...");
  const resTx = await validationRegistry.connect(validator).validationResponse(
      requestHash,
      100, // response
      "https://aegisagent.local/test-validation-response",
      responseHash,
      "smoke-test-pass" // tag
  );
  await resTx.wait();
  console.log("Response TX hash:", resTx.hash);

  // Verify State
  console.log("Verifying on-chain state...");
  const status = await validationRegistry.getValidationStatus(requestHash);
  if (status.validatorAddress !== validator.address) throw new Error("Validator address mismatch");
  if (status.agentId !== agentId) throw new Error("Agent ID mismatch");
  if (status.response !== 100n) throw new Error("Response mismatch");
  if (status.responseHash !== responseHash) throw new Error("Response hash mismatch");
  if (status.tag !== "smoke-test-pass") throw new Error("Tag mismatch");
  if (status.lastUpdate === 0n) throw new Error("Last update is zero");
  console.log("getValidationStatus: verified.");

  const agentReqs = await validationRegistry.getAgentValidations(agentId);
  if (!agentReqs.includes(requestHash)) throw new Error("Request hash not in agent validations");
  console.log("getAgentValidations: verified.");

  const valReqs = await validationRegistry.getValidatorRequests(validator.address);
  if (!valReqs.includes(requestHash)) throw new Error("Request hash not in validator requests");
  console.log("getValidatorRequests: verified.");

  const sum = await validationRegistry.getSummary(agentId, [validator.address], "smoke-test-pass");
  // sum could include previous tests if agentId 1 had validations with the same tag and validator.
  // We'll just verify count > 0 and averageResponse == 100 since the tag is exactly matching this test and past ones.
  if (sum.count === 0n) throw new Error("Summary count is zero");
  if (sum.averageResponse !== 100n) throw new Error(`Summary average is ${sum.averageResponse}, expected 100`);
  console.log("getSummary: verified.");
  
  console.log("--- Smoke Test Passed! ---");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
