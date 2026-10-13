#!/usr/bin/env node
/**
 * scripts/register-provider-agent.js
 * 
 * Gate 2: Provider Agent ID 2 Registration Script (Phase 5.3.2.5.3G)
 * Registers Agent ID 2 on AegisIdentityRegistry using Provider EOA
 * (0x0428A965CB2285a84065307C02D8392eCf5ddEBB).
 * 
 * STRICT SAFETY RULES:
 * - Read-only preflight runs first.
 * - Broadcasts at most ONE registration transaction.
 * - Confirms Agent ID 2 does not already exist before broadcast.
 * - Never prints private keys, seed phrases, or secrets.
 * - Independently verifies ownerOf(2), getAgentWallet(2), and tokenURI(2).
 */

const fs = require('fs');
const path = require('path');
const dotenv = require(path.resolve(__dirname, '../contracts/node_modules/dotenv'));
const { ethers } = require(path.resolve(__dirname, '../contracts/node_modules/ethers'));

const EXPECTED_CHAIN_ID = 10143n;
const IDENTITY_REGISTRY_ADDRESS = '0xa7A27f96d4e8f58d701D42229d5097A69694Ca4B';
const EXPECTED_PROVIDER_ADDRESS = '0x0428A965CB2285a84065307C02D8392eCf5ddEBB';
const REGISTRATION_URI = 'aegisagent://provider-agent-2';
const EXPECTED_AGENT_ID = 2n;

const IDENTITY_ABI = [
  'function register(string calldata agentURI) external returns (uint256 agentId)',
  'function ownerOf(uint256 tokenId) external view returns (address)',
  'function getAgentWallet(uint256 agentId) external view returns (address)',
  'function tokenURI(uint256 tokenId) external view returns (string memory)'
];

async function main() {
  const isExecute = process.argv.includes('--execute');
  console.log(`=== Gate 2: Provider Agent ID 2 Registration Preflight & Execution ===`);
  console.log(`Mode: ${isExecute ? 'LIVE EXECUTION' : 'DRY-RUN PREFLIGHT ONLY'}\n`);

  const rootDir = path.resolve(__dirname, '..');
  const envPath = path.resolve(rootDir, '.env');

  if (!fs.existsSync(envPath)) {
    console.error('[FAIL] Root .env file does not exist.');
    process.exit(1);
  }

  const envConfig = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
  const providerKey = (envConfig.PROVIDER_PRIVATE_KEY || '').trim();
  const providerPub = (envConfig.PROVIDER_PUBLIC_ADDRESS || '').trim();
  const rpcUrl = envConfig.MONAD_TESTNET_RPC_URL || 'https://testnet-rpc.monad.xyz';

  if (!providerKey) {
    console.error('[FAIL] PROVIDER_PRIVATE_KEY is missing in .env.');
    process.exit(1);
  }

  if (!providerPub) {
    console.error('[FAIL] PROVIDER_PUBLIC_ADDRESS is missing in .env.');
    process.exit(1);
  }

  const rpcProvider = new ethers.JsonRpcProvider(rpcUrl, 10143);

  // 1. Verify Chain ID
  const network = await rpcProvider.getNetwork();
  console.log(`[CHECK 1] Network Chain ID: ${network.chainId.toString()} (Expected: ${EXPECTED_CHAIN_ID.toString()})`);
  if (network.chainId !== EXPECTED_CHAIN_ID) {
    console.error(`[FAIL] Chain ID mismatch: got ${network.chainId}, expected ${EXPECTED_CHAIN_ID}`);
    process.exit(1);
  }

  // 2. Verify Identity Registry Bytecode
  const code = await rpcProvider.getCode(IDENTITY_REGISTRY_ADDRESS);
  console.log(`[CHECK 2] Identity Registry Address: ${IDENTITY_REGISTRY_ADDRESS}`);
  if (!code || code === '0x' || code === '0x0') {
    console.error(`[FAIL] Identity Registry has empty bytecode at ${IDENTITY_REGISTRY_ADDRESS}`);
    process.exit(1);
  }
  console.log(`[PASS] Bytecode verified (${(code.length - 2) / 2} bytes deployed).`);

  // 3. Confirm Agent ID 2 does not already exist
  const identityContract = new ethers.Contract(IDENTITY_REGISTRY_ADDRESS, IDENTITY_ABI, rpcProvider);
  let agent2Exists = false;
  try {
    const existingOwner = await identityContract.ownerOf(EXPECTED_AGENT_ID);
    console.log(`[ALERT] Agent ID 2 already exists on-chain! Owner: ${existingOwner}`);
    agent2Exists = true;
  } catch (err) {
    console.log(`[CHECK 3] Agent ID 2 existence check: Verified nonexistent (ownerOf(2) reverted as expected).`);
  }

  if (agent2Exists) {
    console.error(`[FAIL] Agent ID 2 already exists. Refusing duplicate registration.`);
    process.exit(1);
  }

  // 4. Verify Provider Signer Address
  const wallet = new ethers.Wallet(providerKey, rpcProvider);
  console.log(`[CHECK 4] Derived Signer Address: ${wallet.address}`);
  if (wallet.address.toLowerCase() !== EXPECTED_PROVIDER_ADDRESS.toLowerCase()) {
    console.error(`[FAIL] Signer address mismatch: derived ${wallet.address}, expected ${EXPECTED_PROVIDER_ADDRESS}`);
    process.exit(1);
  }
  if (providerPub.toLowerCase() !== EXPECTED_PROVIDER_ADDRESS.toLowerCase()) {
    console.error(`[FAIL] Configured address mismatch: got ${providerPub}, expected ${EXPECTED_PROVIDER_ADDRESS}`);
    process.exit(1);
  }
  console.log(`[PASS] Signer identity matches authorized Provider public address.`);

  // 5. Verify Solvency & Balance
  const balance = await rpcProvider.getBalance(wallet.address);
  const feeData = await rpcProvider.getFeeData();
  const gasPrice = feeData.gasPrice || 102000000000n;
  const estimatedGas = 160000n; // upper bound estimate
  const estimatedGasCostWei = estimatedGas * gasPrice;

  console.log(`\n--- Provider Solvency Preflight ---`);
  console.log(`Provider Balance:    ${balance.toString()} wei (${ethers.formatEther(balance)} MON)`);
  console.log(`Current Gas Price:   ${gasPrice.toString()} wei (${ethers.formatUnits(gasPrice, 'gwei')} gwei)`);
  console.log(`Estimated Max Gas:   ${estimatedGas.toString()} units`);
  console.log(`Estimated Gas Cost:  ${estimatedGasCostWei.toString()} wei (~${ethers.formatEther(estimatedGasCostWei)} MON)`);

  if (balance < estimatedGasCostWei) {
    console.error(`[FAIL] Provider balance insufficient: has ${balance}, needs estimated ${estimatedGasCostWei}`);
    process.exit(1);
  }
  console.log(`[PASS] Provider balance covers registration with surplus: ${ethers.formatEther(balance - estimatedGasCostWei)} MON.`);

  // 6. Registration Parameters
  console.log(`\n--- Target Registration Parameters ---`);
  console.log(`Target Contract:     ${IDENTITY_REGISTRY_ADDRESS}`);
  console.log(`Calling Method:      register(string calldata agentURI)`);
  console.log(`Calldata URI:        "${REGISTRATION_URI}"`);
  console.log(`Expected Token ID:   ${EXPECTED_AGENT_ID.toString()}`);

  if (!isExecute) {
    console.log(`\n[PREFLIGHT RESULT] All preflight checks PASSED.`);
    console.log(`To broadcast the single registration transaction, run with --execute.`);
    return;
  }

  // --- LIVE REGISTRATION BROADCAST ---
  console.log(`\n>>> BROADCASTING EXACTLY 1 REGISTRATION CALL <<<`);
  const contractWithSigner = identityContract.connect(wallet);
  const nonce = await rpcProvider.getTransactionCount(wallet.address, 'latest');
  console.log(`Provider Nonce: ${nonce}`);

  const tx = await contractWithSigner.register(REGISTRATION_URI, {
    gasLimit: 200000n,
    gasPrice: gasPrice
  });

  console.log(`Transaction submitted!`);
  console.log(`Transaction Hash: ${tx.hash}`);
  console.log(`Waiting for confirmation...`);

  const receipt = await tx.wait(1);
  console.log(`\n--- Confirmation Receipt ---`);
  console.log(`Block Number:        ${receipt.blockNumber}`);
  console.log(`Status:              ${receipt.status === 1 ? 'SUCCESS (1)' : 'FAILED (0)'}`);
  console.log(`Gas Used:            ${receipt.gasUsed.toString()} units`);
  console.log(`Effective Gas Price: ${receipt.gasPrice.toString()} wei (${ethers.formatUnits(receipt.gasPrice, 'gwei')} gwei)`);
  const actualGasCostWei = receipt.gasUsed * receipt.gasPrice;
  console.log(`Actual Gas Cost:     ${actualGasCostWei.toString()} wei (${ethers.formatEther(actualGasCostWei)} MON)`);

  if (receipt.status !== 1) {
    console.error(`[FAIL] Transaction reverted on-chain!`);
    process.exit(1);
  }

  // --- INDEPENDENT POST-REGISTRATION VERIFICATION ---
  console.log(`\n--- Independent On-Chain State Verification ---`);
  const owner = await identityContract.ownerOf(EXPECTED_AGENT_ID);
  console.log(`ownerOf(2):          ${owner}`);
  if (owner.toLowerCase() !== EXPECTED_PROVIDER_ADDRESS.toLowerCase()) {
    console.error(`[FAIL] ownerOf(2) mismatch: expected ${EXPECTED_PROVIDER_ADDRESS}, got ${owner}`);
    process.exit(1);
  }
  console.log(`[PASS] ownerOf(2) matches Provider address.`);

  const agentWallet = await identityContract.getAgentWallet(EXPECTED_AGENT_ID);
  console.log(`getAgentWallet(2):   ${agentWallet}`);
  if (agentWallet.toLowerCase() !== EXPECTED_PROVIDER_ADDRESS.toLowerCase()) {
    console.error(`[FAIL] getAgentWallet(2) mismatch: expected ${EXPECTED_PROVIDER_ADDRESS}, got ${agentWallet}`);
    process.exit(1);
  }
  console.log(`[PASS] getAgentWallet(2) matches Provider address.`);

  const uri = await identityContract.tokenURI(EXPECTED_AGENT_ID);
  console.log(`tokenURI(2):         ${uri}`);
  if (uri !== REGISTRATION_URI) {
    console.error(`[FAIL] tokenURI(2) mismatch: expected "${REGISTRATION_URI}", got "${uri}"`);
    process.exit(1);
  }
  console.log(`[PASS] tokenURI(2) matches registration URI.`);

  const postBalance = await rpcProvider.getBalance(wallet.address);
  console.log(`Post-Registration Provider Balance: ${postBalance.toString()} wei (${ethers.formatEther(postBalance)} MON)`);

  console.log(`\n[SUCCESS] Gate 2 Provider Agent ID 2 Registration completed and independently verified!`);
}

main().catch(err => {
  console.error('[ERROR] Fatal failure:', err.message);
  process.exit(1);
});
