const fs = require('fs');
const path = require('path');
const dotenv = require('/home/arpit/AegisAgent/contracts/node_modules/dotenv');
const { ethers } = require('/home/arpit/AegisAgent/contracts/node_modules/ethers');

const EXPECTED_CHAIN_ID = 10143n;
const ESCROW_ADDRESS = '0x28243a3EA0c93CD5FbA6614EAff8980B4A8b0f29';
const ACTIVE_JOB_ID = '0xa83e75b7c2701e47e899ba4ab0e5c55eae4a5f74e63a87eb6bc81944621ba2c2';

const ESCROW_ABI = [
  'function getJob(bytes32 jobId) external view returns (tuple(bytes32 jobId, uint256 clientAgentId, address client, uint256 providerAgentId, address validatorAddress, uint256 rewardAmount, uint256 validatorFeeBps, uint8 minAcceptanceScore, uint64 acceptanceDeadline, uint64 submissionDeadline, uint64 validationDeadline, bytes32 taskHash, bytes32 prehireTrustSnapshotHash, uint8 status, bool settled, bytes32 submissionHash, string submissionURI, uint64 submissionTimestamp, bytes32 validationRequestHash, uint64 failureTimestamp, uint64 challengeDeadline, uint64 disputeTimestamp, address designatedArbiter))',
  'function raiseDispute(bytes32 jobId, string calldata justificationURI) external',
  'function resolveDispute(bytes32 jobId, uint8 ruling, string calldata rulingURI) external',
  'function pendingValidatorFees(address validator) external view returns (uint256)',
  'function totalPendingValidatorFees() external view returns (uint256)',
  'event JobDisputed(bytes32 indexed jobId, address indexed disputer, string justificationURI)',
  'event DisputeResolved(bytes32 indexed jobId, uint8 indexed ruling, address clientOrProvider, uint256 amountPaid, address validatorAddress, uint256 validatorFee, string rulingURI)',
  'event JobCompleted(bytes32 indexed jobId, uint256 indexed providerAgentId, address providerWallet, uint256 providerPayout, address validatorAddress, uint256 validatorFee)',
  'event ValidatorFeeAccrued(bytes32 indexed jobId, address indexed validator, uint256 feeAmount)'
];

async function main() {
  const isExecute = process.argv.includes('--execute');
  console.log('======================================================================');
  console.log('   AegisAgent: Stalled Job Dispute Resolution & Final Settlement');
  console.log('======================================================================');
  console.log(`Active Job ID: ${ACTIVE_JOB_ID}`);
  console.log(`Mode:          ${isExecute ? 'LIVE BROADCAST (--execute)' : 'DRY-RUN SIMULATION ONLY'}\n`);

  const rootDir = '/home/arpit/AegisAgent';
  const envConfig = dotenv.parse(fs.readFileSync(path.resolve(rootDir, '.env'), 'utf8'));

  const rpcUrl = envConfig.MONAD_TESTNET_RPC_URL || 'https://testnet-rpc.monad.xyz';
  const provider = new ethers.JsonRpcProvider(rpcUrl, 10143);

  // Network verification
  const net = await provider.getNetwork();
  const latestBlock = await provider.getBlock('latest');
  console.log(`[CHECK 1] Network: Chain ID ${net.chainId.toString()} (Expected: 10143)`);
  console.log(`          Block: ${latestBlock.number}, Timestamp: ${latestBlock.timestamp}`);
  if (net.chainId !== EXPECTED_CHAIN_ID) {
    throw new Error(`Chain ID mismatch: ${net.chainId}`);
  }

  const clientSigner = new ethers.Wallet(envConfig.DEPLOYER_PRIVATE_KEY, provider);
  const providerSigner = new ethers.Wallet(envConfig.PROVIDER_PRIVATE_KEY, provider);
  console.log(`[CHECK 2] Signers Configured:`);
  console.log(`          Client / Arbiter Address: ${clientSigner.address}`);
  console.log(`          Provider Address:         ${providerSigner.address}`);

  const escrowRead = new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, provider);
  const job = await escrowRead.getJob(ACTIVE_JOB_ID);

  console.log(`\n[CHECK 3] On-Chain Job State:`);
  console.log(`          Job ID:             ${job.jobId}`);
  console.log(`          Current Status:     ${job.status} (Expected: 4 = VALIDATING or 11 = DISPUTED)`);
  console.log(`          Settled:            ${job.settled}`);
  console.log(`          Reward Amount:      ${job.rewardAmount.toString()} wei (${ethers.formatEther(job.rewardAmount)} MON)`);
  console.log(`          Client:             ${job.client}`);
  console.log(`          Designated Arbiter: ${job.designatedArbiter}`);
  console.log(`          Provider Agent ID:  ${job.providerAgentId.toString()}`);
  console.log(`          Validator Address:  ${job.validatorAddress}`);

  if (job.client.toLowerCase() !== clientSigner.address.toLowerCase()) {
    throw new Error(`Client mismatch: job.client ${job.client} !== ${clientSigner.address}`);
  }
  if (job.designatedArbiter.toLowerCase() !== clientSigner.address.toLowerCase()) {
    throw new Error(`Arbiter mismatch: job.designatedArbiter ${job.designatedArbiter} !== ${clientSigner.address}`);
  }

  // Pre-state Balances
  const preEscrowBal = await provider.getBalance(ESCROW_ADDRESS);
  const preClientBal = await provider.getBalance(clientSigner.address);
  const preProviderBal = await provider.getBalance(providerSigner.address);
  const preValidatorPending = await escrowRead.pendingValidatorFees(job.validatorAddress);
  const preTotalPending = await escrowRead.totalPendingValidatorFees();

  console.log(`\n[CHECK 4] Pre-Execution Balances:`);
  console.log(`          Escrow Balance:          ${ethers.formatEther(preEscrowBal)} MON (${preEscrowBal.toString()} wei)`);
  console.log(`          Client Balance:          ${ethers.formatEther(preClientBal)} MON (${preClientBal.toString()} wei)`);
  console.log(`          Provider Balance:        ${ethers.formatEther(preProviderBal)} MON (${preProviderBal.toString()} wei)`);
  console.log(`          Validator Pending Fees:  ${ethers.formatEther(preValidatorPending)} MON (${preValidatorPending.toString()} wei)`);
  console.log(`          Total Pending Fees:      ${ethers.formatEther(preTotalPending)} MON (${preTotalPending.toString()} wei)`);

  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice || 102000000000n;

  const justificationURI = 'https://aegisagent.io/disputes/0xa83e75b7c2701e47e899ba4ab0e5c55eae4a5f74e63a87eb6bc81944621ba2c2/reason';
  const rulingURI = 'https://aegisagent.io/disputes/0xa83e75b7c2701e47e899ba4ab0e5c55eae4a5f74e63a87eb6bc81944621ba2c2/ruling';
  const rulingEnum = 1; // 1 = PROVIDER_WINS

  let raiseDisputeReceipt = null;
  let resolveDisputeReceipt = null;

  // -------------------------------------------------------------------------
  // STEP A: raiseDispute (if status == 4 / VALIDATING)
  // -------------------------------------------------------------------------
  if (Number(job.status) === 4) {
    console.log(`\n======================================================================`);
    console.log(`   ACTION 1: raiseDispute`);
    console.log(`======================================================================`);
    console.log(`Caller: Client Signer (${clientSigner.address})`);
    console.log(`Justification URI: ${justificationURI}`);
    console.log(`Truthful Reason: "Designated validator key unavailable; independent validation response cannot be submitted."`);

    const escrowWithClient = new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, clientSigner);

    console.log(`Simulating raiseDispute via staticCall...`);
    await escrowWithClient.raiseDispute.staticCall(ACTIVE_JOB_ID, justificationURI);
    const estGasRaise = await escrowWithClient.raiseDispute.estimateGas(ACTIVE_JOB_ID, justificationURI);
    console.log(`[PASS] raiseDispute simulation succeeded! Estimated Gas: ${estGasRaise.toString()}`);

    if (isExecute) {
      console.log(`>>> Broadcasting raiseDispute...`);
      const tx = await escrowWithClient.raiseDispute(ACTIVE_JOB_ID, justificationURI, {
        gasLimit: estGasRaise * 12n / 10n,
        gasPrice: gasPrice
      });
      console.log(`Transaction broadcast: ${tx.hash}`);
      raiseDisputeReceipt = await tx.wait(1);
      console.log(`Confirmed in block ${raiseDisputeReceipt.blockNumber}, status: ${raiseDisputeReceipt.status === 1 ? 'SUCCESS' : 'FAIL'}, Gas used: ${raiseDisputeReceipt.gasUsed.toString()}`);
      if (raiseDisputeReceipt.status !== 1) {
        throw new Error('raiseDispute transaction reverted on-chain!');
      }

      // Verify status updated to DISPUTED (11)
      const jobAfterRaise = await escrowRead.getJob(ACTIVE_JOB_ID);
      console.log(`Post-raise Status: ${jobAfterRaise.status} (Expected: 11 = DISPUTED)`);
      if (Number(jobAfterRaise.status) !== 11) {
        throw new Error(`Expected status 11 (DISPUTED), found: ${jobAfterRaise.status}`);
      }
    }
  } else if (Number(job.status) === 11) {
    console.log(`[SKIP ACTION 1] Job is already in status 11 (DISPUTED).`);
  } else {
    throw new Error(`Job is in unexpected status: ${job.status}. Cannot raise dispute.`);
  }

  // -------------------------------------------------------------------------
  // STEP B: resolveDispute (ruling = PROVIDER_WINS)
  // -------------------------------------------------------------------------
  const currentJob = await escrowRead.getJob(ACTIVE_JOB_ID);
  if (Number(currentJob.status) === 11 || (!isExecute && Number(job.status) === 4)) {
    console.log(`\n======================================================================`);
    console.log(`   ACTION 2: resolveDispute (PROVIDER_WINS)`);
    console.log(`======================================================================`);
    console.log(`Caller: Designated Arbiter (${clientSigner.address})`);
    console.log(`Ruling: 1 (PROVIDER_WINS)`);
    console.log(`Expected Payout to Provider: 0.0095 MON (9,500,000,000,000,000 wei)`);
    console.log(`Expected Fee to Validator:   0.0005 MON (500,000,000,000,000 wei accrued)`);
    console.log(`Ruling URI: ${rulingURI}`);

    const escrowWithArbiter = new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, clientSigner);

    if (Number(currentJob.status) === 11) {
      console.log(`Simulating resolveDispute via staticCall...`);
      await escrowWithArbiter.resolveDispute.staticCall(ACTIVE_JOB_ID, rulingEnum, rulingURI);
      const estGasResolve = await escrowWithArbiter.resolveDispute.estimateGas(ACTIVE_JOB_ID, rulingEnum, rulingURI);
      console.log(`[PASS] resolveDispute simulation succeeded! Estimated Gas: ${estGasResolve.toString()}`);

      if (isExecute) {
        console.log(`>>> Broadcasting resolveDispute...`);
        const tx = await escrowWithArbiter.resolveDispute(ACTIVE_JOB_ID, rulingEnum, rulingURI, {
          gasLimit: estGasResolve * 12n / 10n,
          gasPrice: gasPrice
        });
        console.log(`Transaction broadcast: ${tx.hash}`);
        resolveDisputeReceipt = await tx.wait(1);
        console.log(`Confirmed in block ${resolveDisputeReceipt.blockNumber}, status: ${resolveDisputeReceipt.status === 1 ? 'SUCCESS' : 'FAIL'}, Gas used: ${resolveDisputeReceipt.gasUsed.toString()}`);
        if (resolveDisputeReceipt.status !== 1) {
          throw new Error('resolveDispute transaction reverted on-chain!');
        }
      }
    } else {
      console.log(`[DRY-RUN NOTE] resolveDispute staticCall will be executed after raiseDispute in live mode.`);
    }
  }

  // -------------------------------------------------------------------------
  // FINAL STATE & BALANCES VERIFICATION
  // -------------------------------------------------------------------------
  console.log(`\n======================================================================`);
  console.log(`   INDEPENDENT FINAL ON-CHAIN STATE VERIFICATION`);
  console.log(`======================================================================`);

  const finalJob = await escrowRead.getJob(ACTIVE_JOB_ID);
  const postEscrowBal = await provider.getBalance(ESCROW_ADDRESS);
  const postClientBal = await provider.getBalance(clientSigner.address);
  const postProviderBal = await provider.getBalance(providerSigner.address);
  const postValidatorPending = await escrowRead.pendingValidatorFees(job.validatorAddress);
  const postTotalPending = await escrowRead.totalPendingValidatorFees();

  console.log(`Final Job Status:        ${finalJob.status} (5 = COMPLETED)`);
  console.log(`Final Settled Flag:      ${finalJob.settled} (Expected: true)`);
  console.log(`Final Escrow Balance:    ${ethers.formatEther(postEscrowBal)} MON (${postEscrowBal.toString()} wei)`);
  console.log(`Final Client Balance:    ${ethers.formatEther(postClientBal)} MON (${postClientBal.toString()} wei)`);
  console.log(`Final Provider Balance:  ${ethers.formatEther(postProviderBal)} MON (${postProviderBal.toString()} wei)`);
  console.log(`Provider Balance Delta:  +${ethers.formatEther(postProviderBal - preProviderBal)} MON (+${(postProviderBal - preProviderBal).toString()} wei)`);
  console.log(`Final Validator Pending: ${ethers.formatEther(postValidatorPending)} MON (${postValidatorPending.toString()} wei)`);
  console.log(`Validator Pending Delta: +${ethers.formatEther(postValidatorPending - preValidatorPending)} MON (+${(postValidatorPending - preValidatorPending).toString()} wei)`);
  console.log(`Total Pending Fees:      ${ethers.formatEther(postTotalPending)} MON (${postTotalPending.toString()} wei)`);

  const results = {
    jobId: ACTIVE_JOB_ID,
    finalStatus: finalJob.status.toString(),
    settled: finalJob.settled,
    raiseDisputeTx: raiseDisputeReceipt ? {
      hash: raiseDisputeReceipt.hash,
      block: raiseDisputeReceipt.blockNumber,
      gasUsed: raiseDisputeReceipt.gasUsed.toString(),
      gasCostMon: ethers.formatEther(raiseDisputeReceipt.gasUsed * raiseDisputeReceipt.gasPrice)
    } : null,
    resolveDisputeTx: resolveDisputeReceipt ? {
      hash: resolveDisputeReceipt.hash,
      block: resolveDisputeReceipt.blockNumber,
      gasUsed: resolveDisputeReceipt.gasUsed.toString(),
      gasCostMon: ethers.formatEther(resolveDisputeReceipt.gasUsed * resolveDisputeReceipt.gasPrice)
    } : null,
    balances: {
      escrow: postEscrowBal.toString(),
      client: postClientBal.toString(),
      provider: postProviderBal.toString(),
      providerDelta: (postProviderBal - preProviderBal).toString(),
      validatorPending: postValidatorPending.toString()
    }
  };

  console.log('\nFinal Execution Evidence:');
  console.log(JSON.stringify(results, null, 2));
}

main().catch(err => {
  console.error('[FATAL ERROR]', err.message || err);
  process.exit(1);
});
