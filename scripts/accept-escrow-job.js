#!/usr/bin/env node
/**
 * scripts/accept-escrow-job.js
 * 
 * Gate 5A: Provider Job Acceptance Runner (Phase 5.3.2.5.3J)
 * Calls AegisHiringEscrow.acceptJob(jobId) from Provider EOA
 * (0x0428A965CB2285a84065307C02D8392eCf5ddEBB).
 * 
 * STRICT SAFETY RULES:
 * - Read-only preflight runs first.
 * - Asserts acceptanceDeadline has not expired before any broadcast.
 * - Simulates via staticCall before broadcasting.
 * - Never prints private keys or secrets.
 * - If any precondition fails, stops cleanly without broadcasting.
 */

const fs = require('fs');
const path = require('path');
const dotenv = require(path.resolve(__dirname, '../contracts/node_modules/dotenv'));
const { ethers } = require(path.resolve(__dirname, '../contracts/node_modules/ethers'));

const EXPECTED_CHAIN_ID = 10143n;
const ESCROW_ADDRESS = '0x28243a3EA0c93CD5FbA6614EAff8980B4A8b0f29';
const IDENTITY_REGISTRY_ADDRESS = '0xa7A27f96d4e8f58d701D42229d5097A69694Ca4B';
const EXPECTED_PROVIDER_ADDRESS = '0x0428A965CB2285a84065307C02D8392eCf5ddEBB';
const PROVIDER_AGENT_ID = 2n;

const JOB_ID = '0x211d79791be53310d40254cf1abe92757bb2bfaf6a6a8f512e04a25b2564a4e7';

const IDENTITY_ABI = [
  'function ownerOf(uint256 tokenId) external view returns (address)',
  'function getAgentWallet(uint256 agentId) external view returns (address)'
];

const ESCROW_ABI = [
  'function acceptJob(bytes32 jobId) external',
  'function getJob(bytes32 jobId) external view returns (tuple(bytes32 jobId, uint256 clientAgentId, address client, uint256 providerAgentId, address validatorAddress, uint256 rewardAmount, uint256 validatorFeeBps, uint8 minAcceptanceScore, uint64 acceptanceDeadline, uint64 submissionDeadline, uint64 validationDeadline, bytes32 taskHash, bytes32 prehireTrustSnapshotHash, uint8 status, bool settled, bytes32 submissionHash, string submissionURI, uint64 submissionTimestamp, bytes32 validationRequestHash, uint64 failureTimestamp, uint64 challengeDeadline, uint64 disputeTimestamp, address designatedArbiter))',
  'event JobAccepted(bytes32 indexed jobId, uint256 indexed providerAgentId, address providerWallet)'
];

async function main() {
  const isExecute = process.argv.includes('--execute');
  const targetJobId = process.argv[2] && process.argv[2].startsWith('0x') ? process.argv[2] : JOB_ID;

  console.log('======================================================================');
  console.log('   AegisAgent Gate 5A: Provider Job Acceptance Runner');
  console.log('======================================================================');
  console.log(`Target Job ID: ${targetJobId}`);
  console.log(`Mode: ${isExecute ? 'LIVE TRANSACTION BROADCAST (--execute)' : 'DRY-RUN PREFLIGHT AUDIT ONLY'}\n`);

  const rootDir = path.resolve(__dirname, '..');
  const envPath = path.resolve(rootDir, '.env');

  if (!fs.existsSync(envPath)) {
    console.error('[FAIL] Root .env file does not exist.');
    process.exit(1);
  }

  const envConfig = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
  const providerKey = (envConfig.PROVIDER_PRIVATE_KEY || '').trim();
  const rpcUrl = envConfig.MONAD_TESTNET_RPC_URL || 'https://testnet-rpc.monad.xyz';

  if (!providerKey) {
    console.error('[FAIL] PROVIDER_PRIVATE_KEY is missing in .env.');
    process.exit(1);
  }

  const rpcProvider = new ethers.JsonRpcProvider(rpcUrl, 10143);

  // 1. Verify Chain ID & Block
  const network = await rpcProvider.getNetwork();
  const latestBlock = await rpcProvider.getBlock('latest');
  console.log(`[CHECK 1] Network Chain ID: ${network.chainId.toString()} (Expected: ${EXPECTED_CHAIN_ID.toString()})`);
  if (network.chainId !== EXPECTED_CHAIN_ID) {
    console.error(`[FAIL] Chain ID mismatch: got ${network.chainId}, expected ${EXPECTED_CHAIN_ID}`);
    process.exit(1);
  }
  console.log(`[PASS] Chain ID confirmed: 10143. Latest block: ${latestBlock.number}, block timestamp: ${latestBlock.timestamp}`);

  // 2. Read Job Details
  const escrowContract = new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, rpcProvider);
  const job = await escrowContract.getJob(targetJobId);

  console.log(`\n[CHECK 2] On-Chain Job Inspection:`);
  console.log(`          Job ID:             ${job.jobId}`);
  console.log(`          Status:             ${job.status.toString()} (1 = CREATED, 2 = ACCEPTED)`);
  console.log(`          Reward Amount:      ${job.rewardAmount.toString()} wei (${ethers.formatEther(job.rewardAmount)} MON)`);
  console.log(`          Settled:            ${job.settled}`);
  console.log(`          Client Agent ID:    ${job.clientAgentId.toString()}`);
  console.log(`          Provider Agent ID:  ${job.providerAgentId.toString()}`);
  console.log(`          Acceptance Deadline:${job.acceptanceDeadline.toString()}`);

  if (job.status !== 1n) {
    console.error(`[FAIL] Job is not in CREATED status (expected 1, got ${job.status}).`);
    process.exit(1);
  }
  if (job.settled) {
    console.error(`[FAIL] Job is already settled.`);
    process.exit(1);
  }
  if (job.rewardAmount !== 10000000000000000n) {
    console.error(`[FAIL] Job reward amount mismatch: got ${job.rewardAmount}, expected 10000000000000000 wei.`);
    process.exit(1);
  }
  console.log(`[PASS] Job state verified: CREATED, reward = 0.01 MON, settled = false.`);

  // 3. Acceptance Deadline Verification
  const currentTimestamp = BigInt(latestBlock.timestamp);
  const acceptanceDeadline = BigInt(job.acceptanceDeadline);
  const diffSeconds = acceptanceDeadline - currentTimestamp;

  console.log(`\n[CHECK 3] Acceptance Deadline Evaluation:`);
  console.log(`          Current Block Time: ${currentTimestamp.toString()}`);
  console.log(`          Acceptance Deadline:${acceptanceDeadline.toString()}`);
  console.log(`          Time Delta:         ${diffSeconds.toString()} seconds`);

  if (currentTimestamp > acceptanceDeadline) {
    console.error(`\n[FAIL PRECONDITION 3] Acceptance deadline has EXPIRED!`);
    console.error(`The job deadline passed ${(-diffSeconds).toString()} seconds ago.`);
    console.error(`Under AegisHiringEscrow rules, acceptJob will revert with "Acceptance deadline passed".`);
    console.error(`Per preflight safety instructions: STOPPING WITHOUT BROADCASTING.`);
    process.exit(2);
  }
  console.log(`[PASS] Acceptance deadline is active (${diffSeconds.toString()}s remaining).`);

  // 4. Verify Provider Identity
  const identityContract = new ethers.Contract(IDENTITY_REGISTRY_ADDRESS, IDENTITY_ABI, rpcProvider);
  const providerWallet = await identityContract.getAgentWallet(PROVIDER_AGENT_ID);
  console.log(`\n[CHECK 4] Identity Registry getAgentWallet(2): ${providerWallet}`);
  if (providerWallet.toLowerCase() !== EXPECTED_PROVIDER_ADDRESS.toLowerCase()) {
    console.error(`[FAIL] getAgentWallet(2) mismatch: got ${providerWallet}, expected ${EXPECTED_PROVIDER_ADDRESS}`);
    process.exit(1);
  }
  console.log(`[PASS] Provider operational wallet matches expected: ${EXPECTED_PROVIDER_ADDRESS}`);

  // 5. Verify Signer Match and Solvency
  const providerSigner = new ethers.Wallet(providerKey, rpcProvider);
  console.log(`\n[CHECK 5] Signer Address: ${providerSigner.address}`);
  if (providerSigner.address.toLowerCase() !== EXPECTED_PROVIDER_ADDRESS.toLowerCase()) {
    console.error(`[FAIL] Derived signer does not match provider address: ${providerSigner.address}`);
    process.exit(1);
  }

  const providerBal = await rpcProvider.getBalance(providerSigner.address);
  const feeData = await rpcProvider.getFeeData();
  const gasPrice = feeData.gasPrice || 102000000000n;
  const estimatedGas = 41200n;
  const estimatedCost = estimatedGas * gasPrice;

  console.log(`          Provider Balance:   ${providerBal.toString()} wei (${ethers.formatEther(providerBal)} MON)`);
  console.log(`          Current Gas Price:  ${gasPrice.toString()} wei (${ethers.formatUnits(gasPrice, 'gwei')} gwei)`);
  console.log(`          Estimated Gas Cost: ${estimatedCost.toString()} wei (~${ethers.formatEther(estimatedCost)} MON)`);

  if (providerBal < estimatedCost) {
    console.error(`[FAIL] Provider balance insufficient for gas.`);
    process.exit(1);
  }
  console.log(`[PASS] Provider signer is solvent (${ethers.formatEther(providerBal)} MON available).`);

  // 6. Static Call Simulation
  const escrowWithSigner = new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, providerSigner);
  console.log(`\n[CHECK 6] Simulating acceptJob via staticCall...`);
  try {
    await escrowWithSigner.acceptJob.staticCall(targetJobId);
    console.log(`[PASS] acceptJob staticCall succeeded.`);
  } catch (err) {
    console.error(`[FAIL] acceptJob staticCall reverted: ${err.message}`);
    process.exit(1);
  }

  if (!isExecute) {
    console.log(`\n[PREFLIGHT RESULT] All preflight checks PASSED.`);
    console.log(`To broadcast the acceptJob transaction, rerun with --execute.`);
    return;
  }

  // --- LIVE BROADCAST ---
  console.log(`\n>>> BROADCASTING 1 acceptJob TRANSACTION <<<`);
  const tx = await escrowWithSigner.acceptJob(targetJobId, {
    value: 0n,
    gasLimit: 60000n,
    gasPrice: gasPrice
  });

  console.log(`Transaction submitted! Hash: ${tx.hash}`);
  const receipt = await tx.wait(1);

  console.log(`\nReceipt Block: ${receipt.blockNumber}`);
  console.log(`Status:        ${receipt.status === 1 ? 'SUCCESS (1)' : 'FAILED (0)'}`);
  console.log(`Gas Used:      ${receipt.gasUsed.toString()}`);
  const actualGasCostWei = receipt.gasUsed * receipt.gasPrice;
  console.log(`Actual Gas Cost: ${actualGasCostWei.toString()} wei (${ethers.formatEther(actualGasCostWei)} MON)`);

  if (receipt.status !== 1) {
    console.error(`[FAIL] acceptJob transaction reverted on-chain!`);
    process.exit(1);
  }

  // Verify resulting on-chain state
  const updatedJob = await escrowContract.getJob(targetJobId);
  console.log(`\n[INDEPENDENT VERIFICATION]`);
  console.log(`Updated Status: ${updatedJob.status.toString()} (2 = ACCEPTED)`);
  if (updatedJob.status !== 2n) {
    console.error(`[FAIL] Job status is not ACCEPTED!`);
    process.exit(1);
  }

  console.log(`[SUCCESS] Gate 5A Provider Job Acceptance completed and verified on-chain!`);
}

main().catch(err => {
  console.error('[ERROR] Fatal failure:', err.message);
  process.exit(1);
});
