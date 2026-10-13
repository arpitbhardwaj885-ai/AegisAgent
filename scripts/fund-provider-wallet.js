#!/usr/bin/env node
/**
 * scripts/fund-provider-wallet.js
 * 
 * Gate 1: Provider Wallet Funding Script (Phase 5.3.2.5.3F)
 * Transfers exactly 0.12 MON (120,000,000,000,000,000 wei) from
 * Deployer (0xA82832aB9BD6C11A8156c7273815D631F90D347a) to
 * Provider (0x0428A965CB2285a84065307C02D8392eCf5ddEBB).
 * 
 * STRICT SAFETY RULES:
 * - Read-only preflight runs first.
 * - Broadcasts at most ONE native token transfer.
 * - Never prints private keys or secrets.
 * - Confirms receipt on-chain and verifies post-transfer balances.
 */

const fs = require('fs');
const path = require('path');
const dotenv = require(path.resolve(__dirname, '../contracts/node_modules/dotenv'));
const { ethers } = require(path.resolve(__dirname, '../contracts/node_modules/ethers'));

const EXPECTED_CHAIN_ID = 10143n;
const EXPECTED_SENDER = '0xA82832aB9BD6C11A8156c7273815D631F90D347a';
const EXPECTED_RECIPIENT = '0x0428A965CB2285a84065307C02D8392eCf5ddEBB';
const TRANSFER_AMOUNT_WEI = 120000000000000000n; // 0.12 MON

async function main() {
  const isExecute = process.argv.includes('--execute');
  console.log(`=== Gate 1: Provider Wallet Funding Preflight & Execution ===`);
  console.log(`Mode: ${isExecute ? 'LIVE EXECUTION' : 'DRY-RUN PREFLIGHT ONLY'}\n`);

  const rootDir = path.resolve(__dirname, '..');
  const envPath = path.resolve(rootDir, '.env');

  if (!fs.existsSync(envPath)) {
    console.error('[FAIL] Root .env file does not exist.');
    process.exit(1);
  }

  const envConfig = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
  const deployerKey = (envConfig.DEPLOYER_PRIVATE_KEY || '').trim();
  const providerPub = (envConfig.PROVIDER_PUBLIC_ADDRESS || '').trim();
  const rpcUrl = envConfig.MONAD_TESTNET_RPC_URL || 'https://testnet-rpc.monad.xyz';

  if (!deployerKey) {
    console.error('[FAIL] DEPLOYER_PRIVATE_KEY is missing in .env.');
    process.exit(1);
  }

  if (!providerPub) {
    console.error('[FAIL] PROVIDER_PUBLIC_ADDRESS is missing in .env.');
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl, 10143);

  // 1. Check Chain ID
  const network = await provider.getNetwork();
  console.log(`[CHECK 1] Network Chain ID: ${network.chainId.toString()} (Expected: ${EXPECTED_CHAIN_ID.toString()})`);
  if (network.chainId !== EXPECTED_CHAIN_ID) {
    console.error(`[FAIL] Chain ID mismatch: got ${network.chainId}, expected ${EXPECTED_CHAIN_ID}`);
    process.exit(1);
  }

  // 2. Sender Check
  const wallet = new ethers.Wallet(deployerKey, provider);
  console.log(`[CHECK 2] Derived Signer Address: ${wallet.address}`);
  if (wallet.address.toLowerCase() !== EXPECTED_SENDER.toLowerCase()) {
    console.error(`[FAIL] Signer address mismatch: derived ${wallet.address}, expected ${EXPECTED_SENDER}`);
    process.exit(1);
  }

  // 3. Recipient Check
  console.log(`[CHECK 3] Configured Recipient Address: ${providerPub}`);
  if (providerPub.toLowerCase() !== EXPECTED_RECIPIENT.toLowerCase()) {
    console.error(`[FAIL] Recipient address mismatch: got ${providerPub}, expected ${EXPECTED_RECIPIENT}`);
    process.exit(1);
  }

  // 4. Role Separation Check
  if (wallet.address.toLowerCase() === providerPub.toLowerCase()) {
    console.error(`[FAIL] Collision: Sender and recipient are identical address!`);
    process.exit(1);
  }

  // 5. Read-only Balances & Solvency
  const senderBal = await provider.getBalance(wallet.address);
  const recipientBal = await provider.getBalance(providerPub);
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice || 102000000000n;

  console.log(`\n--- Live Pre-Transfer Balances ---`);
  console.log(`Sender (${wallet.address}):   ${senderBal.toString()} wei (${ethers.formatEther(senderBal)} MON)`);
  console.log(`Recipient (${providerPub}): ${recipientBal.toString()} wei (${ethers.formatEther(recipientBal)} MON)`);
  console.log(`Current Gas Price:                  ${gasPrice.toString()} wei (${ethers.formatUnits(gasPrice, 'gwei')} gwei)`);

  const estimatedGas = 21000n;
  const estimatedGasCostWei = estimatedGas * gasPrice;
  const totalRequiredWei = TRANSFER_AMOUNT_WEI + estimatedGasCostWei;

  console.log(`\n--- Transfer Requirements ---`);
  console.log(`Transfer Amount:     ${TRANSFER_AMOUNT_WEI.toString()} wei (0.12 MON)`);
  console.log(`Estimated Gas Cost:  ${estimatedGasCostWei.toString()} wei (~${ethers.formatEther(estimatedGasCostWei)} MON)`);
  console.log(`Total Outlay:        ${totalRequiredWei.toString()} wei (~${ethers.formatEther(totalRequiredWei)} MON)`);

  if (senderBal < totalRequiredWei) {
    console.error(`[FAIL] Sender has insufficient balance: has ${senderBal.toString()} wei, needs ${totalRequiredWei.toString()} wei`);
    process.exit(1);
  }

  console.log(`[PASS] Sender has sufficient balance (Surplus: ${ethers.formatEther(senderBal - totalRequiredWei)} MON).`);

  if (!isExecute) {
    console.log(`\n[PREFLIGHT RESULT] All preflight checks PASSED.`);
    console.log(`To broadcast the single 0.12 MON transfer, run with --execute.`);
    return;
  }

  // --- LIVE BROADCAST ---
  console.log(`\n>>> BROADCASTING 1 NATIVE TOKEN TRANSFER <<<`);
  const nonce = await provider.getTransactionCount(wallet.address, 'latest');
  console.log(`Sender Nonce: ${nonce}`);

  const tx = await wallet.sendTransaction({
    to: EXPECTED_RECIPIENT,
    value: TRANSFER_AMOUNT_WEI,
    gasLimit: 21000n,
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

  // Post-Transfer Verification
  const postSenderBal = await provider.getBalance(wallet.address);
  const postRecipientBal = await provider.getBalance(providerPub);

  console.log(`\n--- Post-Transfer Live Balances ---`);
  console.log(`Sender (${wallet.address}):   ${postSenderBal.toString()} wei (${ethers.formatEther(postSenderBal)} MON)`);
  console.log(`Recipient (${providerPub}): ${postRecipientBal.toString()} wei (${ethers.formatEther(postRecipientBal)} MON)`);

  const deltaRecipient = postRecipientBal - recipientBal;
  console.log(`Recipient Delta:                    +${deltaRecipient.toString()} wei (+${ethers.formatEther(deltaRecipient)} MON)`);

  if (deltaRecipient !== TRANSFER_AMOUNT_WEI) {
    console.error(`[FAIL] Balance delta mismatch: expected +${TRANSFER_AMOUNT_WEI}, got +${deltaRecipient}`);
    process.exit(1);
  }

  console.log(`\n[SUCCESS] Gate 1 Provider Wallet Funding completed and independently verified!`);
}

main().catch(err => {
  console.error('[ERROR] Fatal failure:', err.message);
  process.exit(1);
});
