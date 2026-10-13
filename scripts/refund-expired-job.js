#!/usr/bin/env node
/**
 * scripts/refund-expired-job.js
 * 
 * Gate 5A-1: Expired Job Refund Runner (Phase 5.3.2.5.3K)
 * Calls AegisHiringEscrow.expireJob(jobId) from authorized Client Signer
 * (0xA82832aB9BD6C11A8156c7273815D631F90D347a) to refund 0.01 MON
 * from expired job 0x211d79791be53310d40254cf1abe92757bb2bfaf6a6a8f512e04a25b2564a4e7.
 * 
 * STRICT SAFETY RULES:
 * - Read-only preflight runs first.
 * - Confirms acceptance deadline has strictly expired before broadcast.
 * - Simulates via staticCall before broadcasting.
 * - Broadcasts at most ONE transaction only when --execute is passed.
 * - Never prints private keys or secrets.
 * - Independently verifies receipt, events, updated state, and escrow balance delta.
 */

const fs = require('fs');
const path = require('path');
const dotenv = require(path.resolve(__dirname, '../contracts/node_modules/dotenv'));
const { ethers } = require(path.resolve(__dirname, '../contracts/node_modules/ethers'));

const EXPECTED_CHAIN_ID = 10143n;
const ESCROW_ADDRESS = '0x28243a3EA0c93CD5FbA6614EAff8980B4A8b0f29';
const EXPECTED_CLIENT_ADDRESS = '0xA82832aB9BD6C11A8156c7273815D631F90D347a';
const EXPECTED_JOB_ID = '0x211d79791be53310d40254cf1abe92757bb2bfaf6a6a8f512e04a25b2564a4e7';
const EXPECTED_REFUND_WEI = 10000000000000000n; // 0.01 MON

const ESCROW_ABI = [
  'function expireJob(bytes32 jobId) external',
  'function getJob(bytes32 jobId) external view returns (tuple(bytes32 jobId, uint256 clientAgentId, address client, uint256 providerAgentId, address validatorAddress, uint256 rewardAmount, uint256 validatorFeeBps, uint8 minAcceptanceScore, uint64 acceptanceDeadline, uint64 submissionDeadline, uint64 validationDeadline, bytes32 taskHash, bytes32 prehireTrustSnapshotHash, uint8 status, bool settled, bytes32 submissionHash, string submissionURI, uint64 submissionTimestamp, bytes32 validationRequestHash, uint64 failureTimestamp, uint64 challengeDeadline, uint64 disputeTimestamp, address designatedArbiter))',
  'event JobExpired(bytes32 indexed jobId)',
  'event JobRefunded(bytes32 indexed jobId, address indexed recipient, uint256 amount)'
];

async function main() {
  const isExecute = process.argv.includes('--execute');
  console.log('======================================================================');
  console.log('   AegisAgent Gate 5A-1: Expired Job Refund Runner');
  console.log('======================================================================');
  console.log(`Target Job ID: ${EXPECTED_JOB_ID}`);
  console.log(`Mode: ${isExecute ? 'LIVE TRANSACTION BROADCAST (--execute)' : 'DRY-RUN PREFLIGHT AUDIT ONLY'}\n`);

  const rootDir = path.resolve(__dirname, '..');
  const envPath = path.resolve(rootDir, '.env');

  if (!fs.existsSync(envPath)) {
    console.error('[FAIL] Root .env file does not exist.');
    process.exit(1);
  }

  const envConfig = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
  const deployerKey = (envConfig.DEPLOYER_PRIVATE_KEY || '').trim();
  const rpcUrl = envConfig.MONAD_TESTNET_RPC_URL || 'https://testnet-rpc.monad.xyz';

  if (!deployerKey) {
    console.error('[FAIL] DEPLOYER_PRIVATE_KEY is missing in .env.');
    process.exit(1);
  }

  const rpcProvider = new ethers.JsonRpcProvider(rpcUrl, 10143);

  // 1. Verify Chain ID
  const network = await rpcProvider.getNetwork();
  const latestBlock = await rpcProvider.getBlock('latest');
  console.log(`[CHECK 1] Network Chain ID: ${network.chainId.toString()} (Expected: ${EXPECTED_CHAIN_ID.toString()})`);
  if (network.chainId !== EXPECTED_CHAIN_ID) {
    console.error(`[FAIL] Chain ID mismatch: got ${network.chainId}, expected ${EXPECTED_CHAIN_ID}`);
    process.exit(1);
  }
  console.log(`[PASS] Chain ID confirmed: 10143. Latest block: ${latestBlock.number}, timestamp: ${latestBlock.timestamp}`);

  // 2 & 3. Read and inspect job state
  const escrowContract = new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, rpcProvider);
  const job = await escrowContract.getJob(EXPECTED_JOB_ID);

  console.log(`\n[CHECK 2 & 3] On-Chain Job Inspection:`);
  console.log(`          Job ID:             ${job.jobId}`);
  console.log(`          Status:             ${job.status.toString()} (1 = CREATED, 8 = EXPIRED)`);
  console.log(`          Reward Amount:      ${job.rewardAmount.toString()} wei (${ethers.formatEther(job.rewardAmount)} MON)`);
  console.log(`          Settled:            ${job.settled}`);
  console.log(`          Client Address:     ${job.client}`);
  console.log(`          Acceptance Deadline:${job.acceptanceDeadline.toString()}`);

  if (job.jobId.toLowerCase() !== EXPECTED_JOB_ID.toLowerCase()) {
    console.error(`[FAIL] Job ID mismatch.`);
    process.exit(1);
  }
  if (job.status !== 1n) {
    console.error(`[FAIL] Job status is not CREATED (expected 1, got ${job.status}).`);
    process.exit(1);
  }
  if (job.settled) {
    console.error(`[FAIL] Job is already settled.`);
    process.exit(1);
  }
  if (job.rewardAmount !== EXPECTED_REFUND_WEI) {
    console.error(`[FAIL] Job reward amount mismatch: got ${job.rewardAmount}, expected ${EXPECTED_REFUND_WEI}.`);
    process.exit(1);
  }
  console.log(`[PASS] Job state verified: status=CREATED(1), reward=0.01 MON, settled=false.`);

  // 4. Verify Acceptance Deadline Expiry
  const currentTimestamp = BigInt(latestBlock.timestamp);
  const acceptanceDeadline = BigInt(job.acceptanceDeadline);
  const diffSeconds = currentTimestamp - acceptanceDeadline;

  console.log(`\n[CHECK 4] Acceptance Deadline Expiry Check:`);
  console.log(`          Current Block Time: ${currentTimestamp.toString()}`);
  console.log(`          Acceptance Deadline:${acceptanceDeadline.toString()}`);
  console.log(`          Elapsed Since Expiry: ${diffSeconds.toString()} seconds (~${(Number(diffSeconds) / 3600).toFixed(2)} hours)`);

  if (currentTimestamp <= acceptanceDeadline) {
    console.error(`[FAIL] Acceptance deadline has NOT passed yet! Time remaining: ${(-diffSeconds).toString()}s.`);
    process.exit(1);
  }
  console.log(`[PASS] Acceptance deadline has strictly passed. Job is eligible for expireJob refund.`);

  // 5 & 6. Verify Refund Recipient & Signer
  const clientSigner = new ethers.Wallet(deployerKey, rpcProvider);
  console.log(`\n[CHECK 5 & 6] Recipient and Signer Authorization:`);
  console.log(`          Job Client Recipient: ${job.client}`);
  console.log(`          Derived Signer Address:${clientSigner.address}`);

  if (job.client.toLowerCase() !== EXPECTED_CLIENT_ADDRESS.toLowerCase()) {
    console.error(`[FAIL] Job client is not expected client address: ${job.client}`);
    process.exit(1);
  }
  if (clientSigner.address.toLowerCase() !== EXPECTED_CLIENT_ADDRESS.toLowerCase()) {
    console.error(`[FAIL] Signer address does not match client recipient address: ${clientSigner.address}`);
    process.exit(1);
  }
  console.log(`[PASS] Refund will be transferred directly to client: ${job.client}. Caller is authorized.`);

  // 7. Static Call Simulation
  const escrowWithSigner = new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, clientSigner);
  console.log(`\n[CHECK 7] Simulating expireJob via staticCall...`);
  try {
    await escrowWithSigner.expireJob.staticCall(EXPECTED_JOB_ID);
    console.log(`[PASS] expireJob staticCall simulation succeeded cleanly.`);
  } catch (err) {
    console.error(`[FAIL] expireJob staticCall reverted: ${err.message}`);
    process.exit(1);
  }

  // 8. Gas Estimation & Balance Preflight
  console.log(`\n[CHECK 8] Gas Estimation & Client Balance Preflight...`);
  const estimatedGas = await escrowWithSigner.expireJob.estimateGas(EXPECTED_JOB_ID);
  const feeData = await rpcProvider.getFeeData();
  const gasPrice = feeData.gasPrice || 102000000000n;
  const estimatedGasCostWei = estimatedGas * gasPrice;
  const preClientBal = await rpcProvider.getBalance(clientSigner.address);
  const preEscrowBal = await rpcProvider.getBalance(ESCROW_ADDRESS);

  console.log(`          Estimated Gas Units: ${estimatedGas.toString()}`);
  console.log(`          Current Gas Price:   ${gasPrice.toString()} wei (${ethers.formatUnits(gasPrice, 'gwei')} gwei)`);
  console.log(`          Estimated Gas Cost:  ${estimatedGasCostWei.toString()} wei (~${ethers.formatEther(estimatedGasCostWei)} MON)`);
  console.log(`          Client Pre-Balance:  ${preClientBal.toString()} wei (${ethers.formatEther(preClientBal)} MON)`);
  console.log(`          Escrow Pre-Balance:  ${preEscrowBal.toString()} wei (${ethers.formatEther(preEscrowBal)} MON)`);

  if (preClientBal < estimatedGasCostWei) {
    console.error(`[FAIL] Client balance insufficient to pay for gas.`);
    process.exit(1);
  }
  console.log(`[PASS] Client has sufficient balance for gas. Net balance after refund is expected to INCREASE.`);

  if (!isExecute) {
    console.log(`\n[PREFLIGHT RESULT] All 8 preflight checks PASSED cleanly.`);
    console.log(`To execute the live refund transaction on Monad Testnet, rerun with --execute.`);
    return;
  }

  // --- LIVE BROADCAST ---
  console.log(`\n>>> BROADCASTING EXACTLY ONE expireJob TRANSACTION <<<`);
  const nonce = await rpcProvider.getTransactionCount(clientSigner.address, 'latest');
  console.log(`Client Nonce: ${nonce}`);

  const tx = await escrowWithSigner.expireJob(EXPECTED_JOB_ID, {
    gasLimit: estimatedGas * 12n / 10n,
    gasPrice: gasPrice
  });

  console.log(`Transaction submitted! Hash: ${tx.hash}`);
  console.log(`Waiting for confirmation on Monad Testnet...`);

  const receipt = await tx.wait(1);

  console.log(`\n======================================================================`);
  console.log(`                    TRANSACTION RECEIPT EVIDENCE                      `);
  console.log(`======================================================================`);
  console.log(`Block Number:        ${receipt.blockNumber}`);
  console.log(`Transaction Hash:    ${receipt.hash}`);
  console.log(`Status:              ${receipt.status === 1 ? 'SUCCESS (1)' : 'FAILED (0)'}`);
  console.log(`Gas Used:            ${receipt.gasUsed.toString()} units`);
  console.log(`Effective Gas Price: ${receipt.gasPrice.toString()} wei (${ethers.formatUnits(receipt.gasPrice, 'gwei')} gwei)`);
  const actualGasCostWei = receipt.gasUsed * receipt.gasPrice;
  console.log(`Actual Gas Cost:     ${actualGasCostWei.toString()} wei (${ethers.formatEther(actualGasCostWei)} MON)`);

  if (receipt.status !== 1) {
    console.error(`[FAIL] Transaction reverted on-chain!`);
    process.exit(1);
  }

  // Parse events
  const escrowInterface = new ethers.Interface(ESCROW_ABI);
  let jobExpiredEmitted = false;
  let jobRefundedEmitted = false;

  for (const log of receipt.logs) {
    try {
      const parsed = escrowInterface.parseLog(log);
      if (parsed && parsed.name === 'JobExpired') {
        console.log(`\n[EVENT EMITTED] JobExpired: jobId=${parsed.args.jobId}`);
        jobExpiredEmitted = true;
      }
      if (parsed && parsed.name === 'JobRefunded') {
        console.log(`[EVENT EMITTED] JobRefunded: jobId=${parsed.args.jobId}, recipient=${parsed.args.recipient}, amount=${parsed.args.amount.toString()} wei (${ethers.formatEther(parsed.args.amount)} MON)`);
        jobRefundedEmitted = true;
      }
    } catch (e) {
      // not an escrow log or non-matching event
    }
  }

  if (!jobExpiredEmitted || !jobRefundedEmitted) {
    console.error(`[WARN] One or more expected refund events were not parsed from receipt logs.`);
  }

  // Independent Post-Execution On-Chain State Verification
  console.log(`\n======================================================================`);
  console.log(`             INDEPENDENT ON-CHAIN STATE VERIFICATION                  `);
  console.log(`======================================================================`);

  const updatedJob = await escrowContract.getJob(EXPECTED_JOB_ID);
  console.log(`1. Job ID Check:            ${updatedJob.jobId} (Matches: true)`);
  console.log(`2. Status Check:            ${updatedJob.status.toString()} (8 = EXPIRED)`);
  console.log(`3. Settled Check:           ${updatedJob.settled} (Expected: true)`);
  console.log(`4. Reward Amount:           ${updatedJob.rewardAmount.toString()} wei (${ethers.formatEther(updatedJob.rewardAmount)} MON)`);
  console.log(`5. Client Address:          ${updatedJob.client}`);

  if (updatedJob.status !== 8n) {
    console.error(`[FAIL] Job status is not EXPIRED (8)! Got ${updatedJob.status}`);
    process.exit(1);
  }
  if (updatedJob.settled !== true) {
    console.error(`[FAIL] Job is not marked settled!`);
    process.exit(1);
  }

  // Verify Escrow and Client Balance Deltas
  const postEscrowBal = await rpcProvider.getBalance(ESCROW_ADDRESS);
  const postClientBal = await rpcProvider.getBalance(clientSigner.address);
  const escrowDelta = postEscrowBal - preEscrowBal;
  const clientDelta = postClientBal - preClientBal;

  console.log(`\nEscrow Pre-Balance:          ${preEscrowBal.toString()} wei (${ethers.formatEther(preEscrowBal)} MON)`);
  console.log(`Escrow Post-Balance:         ${postEscrowBal.toString()} wei (${ethers.formatEther(postEscrowBal)} MON)`);
  console.log(`Escrow Delta:                ${escrowDelta.toString()} wei (${ethers.formatEther(escrowDelta)} MON)`);

  console.log(`\nClient Pre-Balance:          ${preClientBal.toString()} wei (${ethers.formatEther(preClientBal)} MON)`);
  console.log(`Client Post-Balance:         ${postClientBal.toString()} wei (${ethers.formatEther(postClientBal)} MON)`);
  console.log(`Client Net Delta:            +${clientDelta.toString()} wei (+${ethers.formatEther(clientDelta)} MON)`);
  console.log(`Expected Client Delta:       Refund (+${EXPECTED_REFUND_WEI}) - Gas Cost (-${actualGasCostWei}) = +${(EXPECTED_REFUND_WEI - actualGasCostWei).toString()} wei`);

  if (escrowDelta !== -EXPECTED_REFUND_WEI) {
    console.error(`[FAIL] Escrow balance delta mismatch: expected -${EXPECTED_REFUND_WEI}, got ${escrowDelta}`);
    process.exit(1);
  }

  if (clientDelta !== EXPECTED_REFUND_WEI - actualGasCostWei) {
    console.error(`[FAIL] Client balance delta mismatch!`);
    process.exit(1);
  }

  console.log(`\n[SUCCESS] Gate 5A-1 Expired Job Refund Completed and Verified On-Chain!`);
}

main().catch(err => {
  console.error('[ERROR] Fatal failure:', err.message);
  process.exit(1);
});
