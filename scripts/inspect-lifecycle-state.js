const fs = require('fs');
const path = require('path');
const dotenv = require('/home/arpit/AegisAgent/contracts/node_modules/dotenv');
const { ethers } = require('/home/arpit/AegisAgent/contracts/node_modules/ethers');

const EXPECTED_CHAIN_ID = 10143n;
const ESCROW_ADDRESS = '0x28243a3EA0c93CD5FbA6614EAff8980B4A8b0f29';
const IDENTITY_REGISTRY_ADDRESS = '0xa7A27f96d4e8f58d701D42229d5097A69694Ca4B';
const VALIDATION_REGISTRY_ADDRESS = '0x802DE575B528453C8208d5201e27464d63970e2b';
const DESIGNATED_VALIDATOR_ADDRESS = '0x0674Bf234268358B5DcbD2c10cCBAFbef2AA7B1c';
const ACTIVE_JOB_ID = '0xa83e75b7c2701e47e899ba4ab0e5c55eae4a5f74e63a87eb6bc81944621ba2c2';

const ESCROW_ABI = [
  'function getJob(bytes32 jobId) external view returns (tuple(bytes32 jobId, uint256 clientAgentId, address client, uint256 providerAgentId, address validatorAddress, uint256 rewardAmount, uint256 validatorFeeBps, uint8 minAcceptanceScore, uint64 acceptanceDeadline, uint64 submissionDeadline, uint64 validationDeadline, bytes32 taskHash, bytes32 prehireTrustSnapshotHash, uint8 status, bool settled, bytes32 submissionHash, string submissionURI, uint64 submissionTimestamp, bytes32 validationRequestHash, uint64 failureTimestamp, uint64 challengeDeadline, uint64 disputeTimestamp, address designatedArbiter))',
  'function pendingValidatorFees(address validator) external view returns (uint256)',
  'function totalPendingValidatorFees() external view returns (uint256)',
  'function settleCompletedJob(bytes32 jobId) external',
  'function withdrawValidatorFees() external',
  'function claimFailedValidationRefund(bytes32 jobId) external'
];

const VALIDATION_ABI = [
  'function getValidationStatus(bytes32 requestHash) external view returns (address validatorAddress, uint256 agentId, uint8 response, bytes32 responseHash, string memory tag, uint256 lastUpdate)',
  'function validationResponse(bytes32 requestHash, uint8 response, string calldata responseURI, bytes32 responseHash, string calldata tag) external'
];

async function main() {
  console.log('=== AUDIT & LIVE ON-CHAIN VERIFICATION ===');
  const rootDir = '/home/arpit/AegisAgent';
  const envPath = path.resolve(rootDir, '.env');
  const envConfig = dotenv.parse(fs.readFileSync(envPath, 'utf8'));

  const rpcUrl = envConfig.MONAD_TESTNET_RPC_URL || 'https://testnet-rpc.monad.xyz';
  const provider = new ethers.JsonRpcProvider(rpcUrl, 10143);

  // 1. Check Network
  const net = await provider.getNetwork();
  const latestBlock = await provider.getBlock('latest');
  console.log(`Connected to Monad Testnet: ChainId = ${net.chainId.toString()}, Block = ${latestBlock.number}, Timestamp = ${latestBlock.timestamp}`);

  // 2. Audit Signers in .env
  console.log('\n--- 1. Local Signer Key Audit ---');
  let validatorSigner = null;
  for (const [k, v] of Object.entries(envConfig)) {
    if (typeof v === 'string' && (v.startsWith('0x') && v.length === 66 || v.length === 64)) {
      try {
        const w = new ethers.Wallet(v.startsWith('0x') ? v : '0x' + v, provider);
        const matchesValidator = w.address.toLowerCase() === DESIGNATED_VALIDATOR_ADDRESS.toLowerCase();
        console.log(`Variable ${k}: Derives to ${w.address} | Matches Validator? ${matchesValidator}`);
        if (matchesValidator) {
          validatorSigner = w;
        }
      } catch (e) {
        console.log(`Variable ${k}: Not a valid secp256k1 key`);
      }
    }
  }

  console.log(`Validator Signer Available in .env: ${validatorSigner !== null}`);

  // 3. Inspect Job on Escrow
  console.log('\n--- 2. On-Chain Job Inspection ---');
  const escrow = new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, provider);
  const valRegistry = new ethers.Contract(VALIDATION_REGISTRY_ADDRESS, VALIDATION_ABI, provider);

  const job = await escrow.getJob(ACTIVE_JOB_ID);
  console.log(`Job ID:               ${job.jobId}`);
  console.log(`Status:               ${job.status} (4 = VALIDATING)`);
  console.log(`Settled:              ${job.settled}`);
  console.log(`Client Agent ID:      ${job.clientAgentId.toString()}`);
  console.log(`Client Address:       ${job.client}`);
  console.log(`Provider Agent ID:    ${job.providerAgentId.toString()}`);
  console.log(`Validator Address:    ${job.validatorAddress}`);
  console.log(`Reward Amount:        ${job.rewardAmount.toString()} wei (${ethers.formatEther(job.rewardAmount)} MON)`);
  console.log(`Validator Fee Bps:    ${job.validatorFeeBps.toString()} (${Number(job.validatorFeeBps) / 100}%)`);
  console.log(`Min Acceptance Score: ${job.minAcceptanceScore}`);
  console.log(`Validation Deadline:  ${job.validationDeadline.toString()}`);
  console.log(`Current Timestamp:    ${latestBlock.timestamp}`);
  console.log(`Remaining Time (s):   ${Number(job.validationDeadline) - latestBlock.timestamp}s (~${((Number(job.validationDeadline) - latestBlock.timestamp) / 3600).toFixed(2)}h)`);
  console.log(`Submission Hash:      ${job.submissionHash}`);
  console.log(`Validation Req Hash:  ${job.validationRequestHash}`);

  // 4. Inspect Validation Registry Status
  console.log('\n--- 3. Validation Registry Record ---');
  const valRecord = await valRegistry.getValidationStatus(job.validationRequestHash);
  console.log(`Registry Validator:   ${valRecord.validatorAddress}`);
  console.log(`Registry Agent ID:    ${valRecord.agentId.toString()}`);
  console.log(`Registry Response:    ${valRecord.response}`);
  console.log(`Registry Last Update: ${valRecord.lastUpdate.toString()}`);

  // 5. Check Timeout Refund Eligibility
  console.log('\n--- 4. Timeout Refund Eligibility Check ---');
  const isExpired = latestBlock.timestamp > Number(job.validationDeadline);
  console.log(`Is Validation Deadline Expired? ${isExpired}`);
  if (!isExpired) {
    console.log(`[SAFETY INVARIANT] Timeout refund is NOT eligible. Calling claimFailedValidationRefund now would revert.`);
  }

  // 6. Balances
  console.log('\n--- 5. Current Live Balances ---');
  const escrowBal = await provider.getBalance(ESCROW_ADDRESS);
  const clientBal = await provider.getBalance(job.client);
  const providerWallet = await provider.getBalance('0x0428A965CB2285a84065307C02D8392eCf5ddEBB');
  const validatorBal = await provider.getBalance(DESIGNATED_VALIDATOR_ADDRESS);
  const pendingFee = await escrow.pendingValidatorFees(DESIGNATED_VALIDATOR_ADDRESS);
  const totalPendingFee = await escrow.totalPendingValidatorFees();

  console.log(`Escrow Balance:        ${escrowBal.toString()} wei (${ethers.formatEther(escrowBal)} MON)`);
  console.log(`Client Balance:        ${clientBal.toString()} wei (${ethers.formatEther(clientBal)} MON)`);
  console.log(`Provider Balance:      ${providerWallet.toString()} wei (${ethers.formatEther(providerWallet)} MON)`);
  console.log(`Validator Balance:     ${validatorBal.toString()} wei (${ethers.formatEther(validatorBal)} MON)`);
  console.log(`Pending Validator Fee: ${pendingFee.toString()} wei`);
  console.log(`Total Pending Fee:     ${totalPendingFee.toString()} wei`);

  // 7. Simulation of Unauthorized Calls
  console.log('\n--- 6. Simulation of Unauthorized Calls (Security Proofs) ---');
  const deployerSigner = new ethers.Wallet(envConfig.DEPLOYER_PRIVATE_KEY, provider);
  const valWithDeployer = new ethers.Contract(VALIDATION_REGISTRY_ADDRESS, VALIDATION_ABI, deployerSigner);
  try {
    await valWithDeployer.validationResponse.staticCall(
      job.validationRequestHash,
      85,
      'https://aegisagent.io/attestation',
      ethers.keccak256(ethers.toUtf8Bytes('test')),
      'audit'
    );
    console.log('[WARN] Deployer was able to call validationResponse!');
  } catch (err) {
    console.log(`[CONFIRMED SECURITY RULE] Deployer cannot call validationResponse: ${err.message.slice(0, 85)}...`);
  }

  // Try settleCompletedJob before validation response
  const escrowWithDeployer = new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, deployerSigner);
  try {
    await escrowWithDeployer.settleCompletedJob.staticCall(ACTIVE_JOB_ID);
    console.log('[WARN] settleCompletedJob succeeded prematurely!');
  } catch (err) {
    console.log(`[CONFIRMED SECURITY RULE] settleCompletedJob cannot be called before attestation: ${err.message.slice(0, 85)}...`);
  }

  // Try timeout refund prematurely
  try {
    await escrowWithDeployer.claimFailedValidationRefund.staticCall(ACTIVE_JOB_ID);
    console.log('[WARN] claimFailedValidationRefund succeeded prematurely!');
  } catch (err) {
    console.log(`[CONFIRMED SECURITY RULE] claimFailedValidationRefund reverts prematurely: ${err.message.slice(0, 85)}...`);
  }
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
