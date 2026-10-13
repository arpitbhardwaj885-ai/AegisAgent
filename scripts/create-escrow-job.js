#!/usr/bin/env node
/**
 * scripts/create-escrow-job.js
 * 
 * Gate 4: Create One Job and Fund Escrow (Phase 5.3.2.5.3I)
 * Creates exactly ONE escrow job with a 0.01 MON deposit on Monad Testnet
 * from authorized Client Signer (0xA82832aB9BD6C11A8156c7273815D631F90D347a)
 * hiring Provider Agent ID 2 (0x0428A965CB2285a84065307C02D8392eCf5ddEBB)
 * with Validator (0x0674Bf234268358B5DcbD2c10cCBAFbef2AA7B1c).
 * 
 * STRICT SAFETY RULES:
 * - Read-only preflight runs first.
 * - Broadcasts at most ONE transaction only when --execute is passed.
 * - Confirms jobId is strictly uninitialized before broadcast.
 * - Never prints private keys, seed phrases, or secrets.
 * - Independently verifies receipt, JobCreated event, getJob() state, and escrow balance.
 */

const fs = require('fs');
const path = require('path');
const dotenv = require(path.resolve(__dirname, '../contracts/node_modules/dotenv'));
const { ethers } = require(path.resolve(__dirname, '../contracts/node_modules/ethers'));

const EXPECTED_CHAIN_ID = 10143n;
const ESCROW_ADDRESS = '0x28243a3EA0c93CD5FbA6614EAff8980B4A8b0f29';
const IDENTITY_REGISTRY_ADDRESS = '0xa7A27f96d4e8f58d701D42229d5097A69694Ca4B';
const VALIDATION_REGISTRY_ADDRESS = '0x802DE575B528453C8208d5201e27464d63970e2b';

const EXPECTED_CLIENT_ADDRESS = '0xA82832aB9BD6C11A8156c7273815D631F90D347a';
const EXPECTED_PROVIDER_ADDRESS = '0x0428A965CB2285a84065307C02D8392eCf5ddEBB';
const EXPECTED_VALIDATOR_ADDRESS = '0x0674Bf234268358B5DcbD2c10cCBAFbef2AA7B1c';
const EXPECTED_DEFAULT_ARBITER = '0xA82832aB9BD6C11A8156c7273815D631F90D347a';

const CLIENT_AGENT_ID = 1n;
const PROVIDER_AGENT_ID = 2n;
const REWARD_AMOUNT_WEI = 10000000000000000n; // 0.01 MON
const VALIDATOR_FEE_BPS = 500n; // 5%
const MIN_ACCEPTANCE_SCORE = 70; // passing score >= 70
const ARBITER_OVERRIDE = ethers.ZeroAddress; // defaults to defaultArbiter

const IDENTITY_ABI = [
  'function ownerOf(uint256 tokenId) external view returns (address)',
  'function getAgentWallet(uint256 agentId) external view returns (address)'
];

const ESCROW_ABI = [
  'function defaultArbiter() external view returns (address)',
  'function identityRegistry() external view returns (address)',
  'function validationRegistry() external view returns (address)',
  'function createJob(bytes32 jobId, uint256 clientAgentId, uint256 providerAgentId, address validatorAddress, uint256 validatorFeeBps, uint8 minAcceptanceScore, uint64 acceptanceDeadline, uint64 submissionDeadline, uint64 validationDeadline, bytes32 taskHash, bytes32 prehireTrustSnapshotHash, address arbiterOverride) external payable returns (bytes32)',
  'function getJob(bytes32 jobId) external view returns (tuple(bytes32 jobId, uint256 clientAgentId, address client, uint256 providerAgentId, address validatorAddress, uint256 rewardAmount, uint256 validatorFeeBps, uint8 minAcceptanceScore, uint64 acceptanceDeadline, uint64 submissionDeadline, uint64 validationDeadline, bytes32 taskHash, bytes32 prehireTrustSnapshotHash, uint8 status, bool settled, bytes32 submissionHash, string submissionURI, uint64 submissionTimestamp, bytes32 validationRequestHash, uint64 failureTimestamp, uint64 challengeDeadline, uint64 disputeTimestamp, address designatedArbiter))',
  'event JobCreated(bytes32 indexed jobId, uint256 indexed clientAgentId, uint256 indexed providerAgentId, address client, address validatorAddress, uint256 rewardAmount, uint256 validatorFeeBps, uint8 minAcceptanceScore, uint64 acceptanceDeadline, uint64 submissionDeadline, uint64 validationDeadline, bytes32 taskHash, bytes32 prehireTrustSnapshotHash, address designatedArbiter)'
];

async function main() {
  const isExecute = process.argv.includes('--execute');
  console.log('======================================================================');
  console.log('   AegisAgent Gate 4: Client Job Creation & Escrow Funding Runner');
  console.log('======================================================================');
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

  // 1. Verify Chain ID & Latest Block
  const network = await rpcProvider.getNetwork();
  const latestBlock = await rpcProvider.getBlock('latest');
  console.log(`[CHECK 1] Network Chain ID: ${network.chainId.toString()} (Expected: ${EXPECTED_CHAIN_ID.toString()})`);
  if (network.chainId !== EXPECTED_CHAIN_ID) {
    console.error(`[FAIL] Chain ID mismatch: got ${network.chainId}, expected ${EXPECTED_CHAIN_ID}`);
    process.exit(1);
  }
  console.log(`[PASS] Chain ID confirmed: 10143. Latest block: ${latestBlock.number}, block timestamp: ${latestBlock.timestamp}`);

  // 2. Verify Escrow Bytecode & Configured Registries
  const escrowCode = await rpcProvider.getCode(ESCROW_ADDRESS);
  if (!escrowCode || escrowCode === '0x' || escrowCode === '0x0') {
    console.error(`[FAIL] Escrow contract at ${ESCROW_ADDRESS} has empty bytecode.`);
    process.exit(1);
  }
  console.log(`[CHECK 2] Escrow Bytecode: Verified (${(escrowCode.length - 2) / 2} bytes deployed at ${ESCROW_ADDRESS}).`);

  const escrowContract = new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, rpcProvider);
  const onChainIdentity = await escrowContract.identityRegistry();
  const onChainValidation = await escrowContract.validationRegistry();
  const onChainArbiter = await escrowContract.defaultArbiter();

  if (onChainIdentity.toLowerCase() !== IDENTITY_REGISTRY_ADDRESS.toLowerCase()) {
    console.error(`[FAIL] Escrow identity registry mismatch: got ${onChainIdentity}, expected ${IDENTITY_REGISTRY_ADDRESS}`);
    process.exit(1);
  }
  if (onChainValidation.toLowerCase() !== VALIDATION_REGISTRY_ADDRESS.toLowerCase()) {
    console.error(`[FAIL] Escrow validation registry mismatch: got ${onChainValidation}, expected ${VALIDATION_REGISTRY_ADDRESS}`);
    process.exit(1);
  }
  if (onChainArbiter.toLowerCase() !== EXPECTED_DEFAULT_ARBITER.toLowerCase()) {
    console.error(`[FAIL] Escrow default arbiter mismatch: got ${onChainArbiter}, expected ${EXPECTED_DEFAULT_ARBITER}`);
    process.exit(1);
  }
  console.log(`[PASS] Escrow links verified: IdentityRegistry=${onChainIdentity}, ValidationRegistry=${onChainValidation}, defaultArbiter=${onChainArbiter}`);

  // 3. Verify Agent IDs 1 and 2
  const identityContract = new ethers.Contract(IDENTITY_REGISTRY_ADDRESS, IDENTITY_ABI, rpcProvider);
  const owner1 = await identityContract.ownerOf(CLIENT_AGENT_ID);
  const wallet1 = await identityContract.getAgentWallet(CLIENT_AGENT_ID);
  const owner2 = await identityContract.ownerOf(PROVIDER_AGENT_ID);
  const wallet2 = await identityContract.getAgentWallet(PROVIDER_AGENT_ID);

  console.log(`[CHECK 3] Agent ID 1: Owner=${owner1}, Wallet=${wallet1}`);
  console.log(`         Agent ID 2: Owner=${owner2}, Wallet=${wallet2}`);

  if (owner1.toLowerCase() !== EXPECTED_CLIENT_ADDRESS.toLowerCase() || wallet1.toLowerCase() !== EXPECTED_CLIENT_ADDRESS.toLowerCase()) {
    console.error(`[FAIL] Agent ID 1 authorization mismatch: expected ${EXPECTED_CLIENT_ADDRESS}`);
    process.exit(1);
  }
  if (owner2.toLowerCase() !== EXPECTED_PROVIDER_ADDRESS.toLowerCase() || wallet2.toLowerCase() !== EXPECTED_PROVIDER_ADDRESS.toLowerCase()) {
    console.error(`[FAIL] Agent ID 2 authorization mismatch: expected ${EXPECTED_PROVIDER_ADDRESS}`);
    process.exit(1);
  }
  console.log(`[PASS] Agent counterparties confirmed: Client Agent 1 and Provider Agent 2.`);

  // 4. Verify Client Signer Authorization
  const clientSigner = new ethers.Wallet(deployerKey, rpcProvider);
  console.log(`[CHECK 4] Derived Client Signer: ${clientSigner.address}`);
  if (clientSigner.address.toLowerCase() !== EXPECTED_CLIENT_ADDRESS.toLowerCase()) {
    console.error(`[FAIL] Signer mismatch: derived ${clientSigner.address}, expected ${EXPECTED_CLIENT_ADDRESS}`);
    process.exit(1);
  }
  if (clientSigner.address.toLowerCase() !== owner1.toLowerCase()) {
    console.error(`[FAIL] Caller is not owner of Client Agent ID 1.`);
    process.exit(1);
  }
  console.log(`[PASS] Client Signer is authoritatively authorized for Agent ID 1.`);

  // 5. Construct Deterministic Job Parameters
  const blockNow = BigInt(latestBlock.timestamp);
  const acceptanceDeadline = blockNow + 3600n;   // +1 hour
  const submissionDeadline = blockNow + 7200n;   // +2 hours
  const validationDeadline = blockNow + 10800n;  // +3 hours

  const taskDescription = "AegisAgent live testnet verification task";
  const taskHash = ethers.keccak256(ethers.toUtf8Bytes(taskDescription));
  const prehireSnapshotData = "prehire-trust-snapshot-agent-2";
  const prehireTrustSnapshotHash = ethers.keccak256(ethers.toUtf8Bytes(prehireSnapshotData));

  // Canonical jobId derivation: keccak256(abi.encodePacked(clientAgentId, providerAgentId, taskHash, acceptanceDeadline))
  const jobId = ethers.solidityPackedKeccak256(
    ['uint256', 'uint256', 'bytes32', 'uint64'],
    [CLIENT_AGENT_ID, PROVIDER_AGENT_ID, taskHash, acceptanceDeadline]
  );

  console.log(`\n--- Job Parameters ---`);
  console.log(`Job ID:                     ${jobId}`);
  console.log(`Client Agent ID:            ${CLIENT_AGENT_ID.toString()}`);
  console.log(`Provider Agent ID:          ${PROVIDER_AGENT_ID.toString()}`);
  console.log(`Validator Address:          ${EXPECTED_VALIDATOR_ADDRESS}`);
  console.log(`Reward Amount (Deposit):    ${REWARD_AMOUNT_WEI.toString()} wei (${ethers.formatEther(REWARD_AMOUNT_WEI)} MON)`);
  console.log(`Validator Fee Bps:          ${VALIDATOR_FEE_BPS.toString()} (5.00%)`);
  console.log(`Expected Validator Fee:     ${(REWARD_AMOUNT_WEI * VALIDATOR_FEE_BPS / 10000n).toString()} wei (0.0005 MON)`);
  console.log(`Expected Provider Net:      ${(REWARD_AMOUNT_WEI - (REWARD_AMOUNT_WEI * VALIDATOR_FEE_BPS / 10000n)).toString()} wei (0.0095 MON)`);
  console.log(`Min Acceptance Score:       ${MIN_ACCEPTANCE_SCORE}`);
  console.log(`Acceptance Deadline:        ${acceptanceDeadline.toString()} (in 3600s)`);
  console.log(`Submission Deadline:        ${submissionDeadline.toString()} (in 7200s)`);
  console.log(`Validation Deadline:        ${validationDeadline.toString()} (in 10800s)`);
  console.log(`Task Hash:                  ${taskHash}`);
  console.log(`Prehire Trust Snapshot:     ${prehireTrustSnapshotHash}`);
  console.log(`Arbiter Override:           ${ARBITER_OVERRIDE} (resolves to ${EXPECTED_DEFAULT_ARBITER})`);

  // 6. Verify Job ID Uniqueness on Deployed Escrow
  const existingJob = await escrowContract.getJob(jobId);
  console.log(`\n[CHECK 6] Job ID Uniqueness Check:`);
  console.log(`          Existing status: ${existingJob.status} (0 = UNINITIALIZED)`);
  if (existingJob.status !== 0n) {
    console.error(`[FAIL] Job ID ${jobId} already exists on-chain! Status is ${existingJob.status}`);
    process.exit(1);
  }
  console.log(`[PASS] Job ID is strictly UNINITIALIZED and ready for creation.`);

  // 7. Estimate Gas & Verify Client Solvency
  const escrowWithSigner = new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, clientSigner);
  console.log(`\n[CHECK 7] Simulating createJob with live eth_estimateGas...`);
  
  const estimatedGas = await escrowWithSigner.createJob.estimateGas(
    jobId,
    CLIENT_AGENT_ID,
    PROVIDER_AGENT_ID,
    EXPECTED_VALIDATOR_ADDRESS,
    VALIDATOR_FEE_BPS,
    MIN_ACCEPTANCE_SCORE,
    acceptanceDeadline,
    submissionDeadline,
    validationDeadline,
    taskHash,
    prehireTrustSnapshotHash,
    ARBITER_OVERRIDE,
    { value: REWARD_AMOUNT_WEI }
  );

  const feeData = await rpcProvider.getFeeData();
  const gasPrice = feeData.gasPrice || 102000000000n;
  const estimatedGasCostWei = estimatedGas * gasPrice;
  const totalRequiredWei = REWARD_AMOUNT_WEI + estimatedGasCostWei;
  const clientBal = await rpcProvider.getBalance(clientSigner.address);
  const preEscrowBal = await rpcProvider.getBalance(ESCROW_ADDRESS);

  console.log(`Estimated Gas Units:        ${estimatedGas.toString()}`);
  console.log(`Current Gas Price:          ${gasPrice.toString()} wei (${ethers.formatUnits(gasPrice, 'gwei')} gwei)`);
  console.log(`Estimated Gas Cost:         ${estimatedGasCostWei.toString()} wei (~${ethers.formatEther(estimatedGasCostWei)} MON)`);
  console.log(`Total Outlay (Deposit+Gas): ${totalRequiredWei.toString()} wei (~${ethers.formatEther(totalRequiredWei)} MON)`);
  console.log(`Client Balance:             ${clientBal.toString()} wei (${ethers.formatEther(clientBal)} MON)`);
  console.log(`Pre-job Escrow Balance:     ${preEscrowBal.toString()} wei (${ethers.formatEther(preEscrowBal)} MON)`);

  if (clientBal < totalRequiredWei) {
    console.error(`[FAIL] Client balance insufficient: has ${clientBal}, needs ${totalRequiredWei}`);
    process.exit(1);
  }
  const surplus = clientBal - totalRequiredWei;
  console.log(`[PASS] Client solvency confirmed. Surplus: ${ethers.formatEther(surplus)} MON.`);

  // 8. Present Decoded Transaction Payload Summary
  console.log(`\n--- Decoded Transaction Calldata Summary ---`);
  console.log(`To (Target Escrow):         ${ESCROW_ADDRESS}`);
  console.log(`From (Caller):              ${clientSigner.address}`);
  console.log(`Value:                      ${REWARD_AMOUNT_WEI.toString()} wei (0.01 MON)`);
  console.log(`Method:                     createJob(bytes32,uint256,uint256,address,uint256,uint8,uint64,uint64,uint64,bytes32,bytes32,address)`);
  console.log(`Gas Limit Allocated:        ${(estimatedGas * 12n / 10n).toString()} (estimated + 20% buffer)`);

  if (!isExecute) {
    console.log(`\n[PREFLIGHT RESULT] All 8 preflight checks PASSED cleanly.`);
    console.log(`To execute this exact transaction live on Monad Testnet, rerun with --execute.`);
    return;
  }

  // --- LIVE EXECUTION ---
  console.log(`\n>>> BROADCASTING EXACTLY ONE createJob TRANSACTION <<<`);
  const nonce = await rpcProvider.getTransactionCount(clientSigner.address, 'latest');
  console.log(`Client Nonce: ${nonce}`);

  const tx = await escrowWithSigner.createJob(
    jobId,
    CLIENT_AGENT_ID,
    PROVIDER_AGENT_ID,
    EXPECTED_VALIDATOR_ADDRESS,
    VALIDATOR_FEE_BPS,
    MIN_ACCEPTANCE_SCORE,
    acceptanceDeadline,
    submissionDeadline,
    validationDeadline,
    taskHash,
    prehireTrustSnapshotHash,
    ARBITER_OVERRIDE,
    {
      value: REWARD_AMOUNT_WEI,
      gasLimit: estimatedGas * 12n / 10n,
      gasPrice: gasPrice
    }
  );

  console.log(`Transaction submitted!`);
  console.log(`Transaction Hash: ${tx.hash}`);
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

  // Parse JobCreated event
  const escrowInterface = new ethers.Interface(ESCROW_ABI);
  let eventFound = false;
  for (const log of receipt.logs) {
    try {
      const parsed = escrowInterface.parseLog(log);
      if (parsed && parsed.name === 'JobCreated') {
        console.log(`\n[EVENT EMITTED] JobCreated:`);
        console.log(`  jobId:                    ${parsed.args.jobId}`);
        console.log(`  clientAgentId:            ${parsed.args.clientAgentId.toString()}`);
        console.log(`  providerAgentId:          ${parsed.args.providerAgentId.toString()}`);
        console.log(`  client:                   ${parsed.args.client}`);
        console.log(`  validatorAddress:         ${parsed.args.validatorAddress}`);
        console.log(`  rewardAmount:             ${parsed.args.rewardAmount.toString()} wei`);
        console.log(`  validatorFeeBps:          ${parsed.args.validatorFeeBps.toString()}`);
        console.log(`  minAcceptanceScore:       ${parsed.args.minAcceptanceScore}`);
        console.log(`  designatedArbiter:        ${parsed.args.designatedArbiter}`);
        eventFound = true;
      }
    } catch (e) {
      // not an escrow log or non-matching event
    }
  }

  if (!eventFound) {
    console.error(`[WARN] JobCreated event was not parsed from logs.`);
  }

  // Independent Post-Execution On-Chain State Verification
  console.log(`\n======================================================================`);
  console.log(`             INDEPENDENT ON-CHAIN STATE VERIFICATION                  `);
  console.log(`======================================================================`);

  const createdJob = await escrowContract.getJob(jobId);
  console.log(`1. Job ID Check:            ${createdJob.jobId} (Matches: ${createdJob.jobId === jobId})`);
  console.log(`2. Status Check:            ${createdJob.status.toString()} (1 = CREATED)`);
  console.log(`3. Settled Check:           ${createdJob.settled} (Expected: false)`);
  console.log(`4. Reward Amount:           ${createdJob.rewardAmount.toString()} wei (${ethers.formatEther(createdJob.rewardAmount)} MON)`);
  console.log(`5. Client Address:          ${createdJob.client}`);
  console.log(`6. Client Agent ID:         ${createdJob.clientAgentId.toString()}`);
  console.log(`7. Provider Agent ID:       ${createdJob.providerAgentId.toString()}`);
  console.log(`8. Validator Address:       ${createdJob.validatorAddress}`);
  console.log(`9. Validator Fee Bps:       ${createdJob.validatorFeeBps.toString()}`);
  console.log(`10. Min Acceptance Score:   ${createdJob.minAcceptanceScore}`);
  console.log(`11. Designated Arbiter:     ${createdJob.designatedArbiter}`);

  if (createdJob.status !== 1n) {
    console.error(`[FAIL] Job status is not CREATED (1)! Got ${createdJob.status}`);
    process.exit(1);
  }
  if (createdJob.settled !== false) {
    console.error(`[FAIL] Job is marked settled!`);
    process.exit(1);
  }
  if (createdJob.rewardAmount !== REWARD_AMOUNT_WEI) {
    console.error(`[FAIL] Job reward amount mismatch: got ${createdJob.rewardAmount}, expected ${REWARD_AMOUNT_WEI}`);
    process.exit(1);
  }

  // Verify Escrow Contract Balance
  const postEscrowBal = await rpcProvider.getBalance(ESCROW_ADDRESS);
  const escrowDelta = postEscrowBal - preEscrowBal;
  console.log(`\nEscrow Contract Post Balance: ${postEscrowBal.toString()} wei (${ethers.formatEther(postEscrowBal)} MON)`);
  console.log(`Escrow Balance Delta:        +${escrowDelta.toString()} wei (+${ethers.formatEther(escrowDelta)} MON)`);

  if (escrowDelta !== REWARD_AMOUNT_WEI) {
    console.error(`[FAIL] Escrow contract balance delta mismatch: expected +${REWARD_AMOUNT_WEI}, got +${escrowDelta}`);
    process.exit(1);
  }

  const postClientBal = await rpcProvider.getBalance(clientSigner.address);
  console.log(`Client Post Balance:         ${postClientBal.toString()} wei (${ethers.formatEther(postClientBal)} MON)`);

  console.log(`\n[SUCCESS] Gate 4 Job Creation & Escrow Funding Verified On-Chain!`);
}

main().catch(err => {
  console.error('[ERROR] Fatal failure:', err.message);
  process.exit(1);
});
