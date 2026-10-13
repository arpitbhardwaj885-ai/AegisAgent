const hre = require("hardhat");

async function main() {
  const network = await hre.ethers.provider.getNetwork();
  const [deployer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(deployer.address);

  console.log("--- PRE-DEPLOYMENT INFO ---");
  console.log(`Network: ${network.name}`);
  console.log(`Chain ID: ${network.chainId}`);
  console.log(`Deployer address: ${deployer.address}`);
  console.log(`Deployer balance: ${hre.ethers.formatEther(balance)} MON`);
  console.log("---------------------------\n");

  if (network.chainId !== 10143n && network.chainId !== 10143) {
    throw new Error(`Expected Chain ID 10143 but got ${network.chainId}`);
  }

  console.log("Deploying AegisIdentityRegistry...");
  const AegisIdentityRegistry = await hre.ethers.getContractFactory("AegisIdentityRegistry");
  const registry = await AegisIdentityRegistry.deploy();

  await registry.waitForDeployment();
  const contractAddress = await registry.getAddress();
  const tx = registry.deploymentTransaction();
  const receipt = await tx.wait();

  console.log("\n--- DEPLOYMENT RESULT ---");
  console.log("Contract name: AegisIdentityRegistry");
  console.log(`Deployer address: ${deployer.address}`);
  console.log(`Contract address: ${contractAddress}`);
  console.log(`Chain ID: ${network.chainId}`);
  console.log(`Transaction hash: ${tx.hash}`);
  console.log(`Block number: ${receipt.blockNumber}`);
  console.log(`Gas used: ${receipt.gasUsed.toString()}`);
  console.log("Deployment status: SUCCESS");
  console.log("-------------------------\n");

  console.log("--- POST-DEPLOYMENT VERIFICATION ---");
  const getAgentRegistryResult = await registry.getAgentRegistry();
  console.log(`getAgentRegistry(): ${getAgentRegistryResult}`);
  console.log(`ERC-721 Name: ${await registry.name()}`);
  console.log(`ERC-721 Symbol: ${await registry.symbol()}`);
  
  console.log(`\nRegistering test agent...`);
  const regTx = await registry.register("aegisagent://test-agent-1");
  const regReceipt = await regTx.wait();

  const agentId = 1; // Since it's the first agent
  console.log(`Test Registration TX: ${regTx.hash}`);
  
  const owner = await registry.ownerOf(agentId);
  const tokenURI = await registry.tokenURI(agentId);
  const agentWallet = await registry.getAgentWallet(agentId);
  
  console.log(`ownerOf(${agentId}): ${owner}`);
  console.log(`tokenURI(${agentId}): ${tokenURI}`);
  console.log(`getAgentWallet(${agentId}): ${agentWallet}`);
  
  const registeredEvent = regReceipt.logs.find(
    log => log.fragment && log.fragment.name === 'Registered'
  );
  console.log(`Registered event emitted: ${!!registeredEvent}`);
  
  const metadataSetEvent = regReceipt.logs.find(
    log => log.fragment && log.fragment.name === 'MetadataSet' && log.args[1] === 'agentWallet'
  );
  console.log(`MetadataSet for agentWallet emitted: ${!!metadataSetEvent}`);
  
  console.log(`getAgentWallet(agentId) == deployer address: ${agentWallet === deployer.address}`);
  console.log("------------------------------------\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
