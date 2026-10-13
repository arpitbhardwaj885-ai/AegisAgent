#!/usr/bin/env node
/**
 * scripts/verify-provider-wallet.js
 * 
 * Safe Provider Wallet Verification Utility (Phase 5.3.2.5.3C)
 * Inspects provider wallet configuration, cryptographic integrity,
 * role independence, and on-chain funding solvency without exposing secrets.
 * 
 * STRICT SECURITY CONSTRAINTS:
 * - NEVER prints or logs private keys or secrets.
 * - Read-only inspection of environment and on-chain RPC.
 */

const fs = require('fs');
const path = require('path');
const dotenv = require(path.resolve(__dirname, '../contracts/node_modules/dotenv'));
const { ethers } = require(path.resolve(__dirname, '../contracts/node_modules/ethers'));

async function main() {
  const rootDir = path.resolve(__dirname, '..');
  const envPath = path.resolve(rootDir, '.env');

  console.log('=== AegisAgent Provider Wallet Verification ===\n');

  if (!fs.existsSync(envPath)) {
    console.error('[FAIL] Root .env file does not exist at:', envPath);
    process.exit(1);
  }

  // Load environment variables without printing contents
  const envConfig = dotenv.parse(fs.readFileSync(envPath, 'utf8'));

  const providerPub = (envConfig.PROVIDER_PUBLIC_ADDRESS || '').trim();
  const providerKey = (envConfig.PROVIDER_PRIVATE_KEY || '').trim();
  const deployerPub = (envConfig.DEPLOYER_PUBLIC_ADDRESS || '0xA82832aB9BD6C11A8156c7273815D631F90D347a').trim();
  const validatorPub = '0x0674Bf234268358B5DcbD2c10cCBAFbef2AA7B1c';
  const rpcUrl = envConfig.MONAD_TESTNET_RPC_URL || 'https://testnet-rpc.monad.xyz';

  let hasErrors = false;

  // 1. Presence check
  if (!providerPub) {
    console.log('[-] PROVIDER_PUBLIC_ADDRESS: NOT CONFIGURED in .env');
    hasErrors = true;
  } else if (!ethers.isAddress(providerPub)) {
    console.log(`[FAIL] PROVIDER_PUBLIC_ADDRESS is invalid address format: ${providerPub}`);
    hasErrors = true;
  } else {
    console.log(`[PASS] PROVIDER_PUBLIC_ADDRESS: ${ethers.getAddress(providerPub)}`);
  }

  if (!providerKey) {
    console.log('[-] PROVIDER_PRIVATE_KEY: NOT CONFIGURED in .env');
    hasErrors = true;
  } else {
    console.log('[PASS] PROVIDER_PRIVATE_KEY: Configured (Length: ' + providerKey.length + ' chars, not displayed)');
  }

  if (hasErrors) {
    console.log('\n[SUMMARY] Provider wallet is NOT configured. Run scripts/generate-provider-wallet.js to generate.');
    return;
  }

  // 2. Cryptographic key-pair match check
  try {
    const derivedAddress = ethers.computeAddress(providerKey);
    if (derivedAddress.toLowerCase() === providerPub.toLowerCase()) {
      console.log('[PASS] Cryptographic Match: Private key derives configured public address.');
    } else {
      console.error(`[FAIL] Mismatch: Private key derives ${derivedAddress}, but public address is configured as ${providerPub}`);
      hasErrors = true;
    }
  } catch (err) {
    console.error('[FAIL] Invalid private key format:', err.message);
    hasErrors = true;
  }

  // 3. Role separation check
  if (providerPub.toLowerCase() === deployerPub.toLowerCase()) {
    console.error(`[FAIL] Role Collision: Provider public address matches Deployer/Client address (${deployerPub})!`);
    hasErrors = true;
  } else {
    console.log(`[PASS] Role Separation: Provider is distinct from Client/Deployer (${deployerPub})`);
  }

  if (providerPub.toLowerCase() === validatorPub.toLowerCase()) {
    console.error(`[FAIL] Role Collision: Provider public address matches Validator address (${validatorPub})!`);
    hasErrors = true;
  } else {
    console.log(`[PASS] Role Separation: Provider is distinct from Validator (${validatorPub})`);
  }

  // 4. On-chain live balance check
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl, 10143);
    const balanceWei = await provider.getBalance(providerPub);
    const balanceMon = ethers.formatEther(balanceWei);
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice || 102000000000n;

    console.log(`\n--- Live On-Chain Solvency Status (Monad Testnet) ---`);
    console.log(`Provider Balance: ${balanceWei.toString()} wei (${balanceMon} MON)`);
    console.log(`Live Gas Price:   ${gasPrice.toString()} wei (${ethers.formatUnits(gasPrice, 'gwei')} gwei)`);

    const minGasCostWei = 57727512000000000n; // 565,956 gas @ 102 gwei
    const bufferGasCostWei = 69273096000000000n; // +20% margin (~0.0693 MON)
    const prudentGasCostWei = 120000000000000000n; // Recommended buffer (0.12 MON)

    if (balanceWei >= prudentGasCostWei) {
      console.log(`[PASS] Solvency: FULLY FUNDED (Meets recommended 0.12 MON buffer).`);
    } else if (balanceWei >= bufferGasCostWei) {
      console.log(`[WARN] Solvency: BARE MINIMUM FUNDED (${balanceMon} MON). Meets 20% margin, but a 0.12 MON buffer is recommended.`);
    } else if (balanceWei >= minGasCostWei) {
      console.log(`[WARN] Solvency: TIGHT FUNDING (${balanceMon} MON). Below recommended 20% margin.`);
    } else {
      const shortfallWei = prudentGasCostWei - balanceWei;
      console.log(`[DEFICIT] Solvency: INSUFFICIENT BALANCE. Shortfall of ${ethers.formatEther(shortfallWei)} MON to reach recommended 0.12 MON.`);
    }
  } catch (rpcErr) {
    console.warn(`[WARN] Could not query live RPC: ${rpcErr.message}`);
  }

  console.log('\n=== Verification Complete ===');
}

main().catch(err => {
  console.error('[ERROR] Unexpected failure:', err.message);
  process.exit(1);
});
