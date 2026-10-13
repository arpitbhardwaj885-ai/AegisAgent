#!/usr/bin/env node
/**
 * scripts/generate-provider-wallet.js
 * 
 * Secure Provider Wallet Generation Utility (Phase 5.3.2.5.3C)
 * Generates an isolated, independent EOA keypair for the Provider role.
 * 
 * STRICT SECURITY CONSTRAINTS:
 * - NEVER prints or logs private keys or seed phrases to stdout, stderr, or logfiles.
 * - Appends PROVIDER_PUBLIC_ADDRESS and PROVIDER_PRIVATE_KEY directly to root .env if not present.
 * - Protects .env file permissions (0600 - owner read/write only).
 * - Reports ONLY the public address and configuration status upon completion.
 */

const fs = require('fs');
const path = require('path');
const { ethers } = require(path.resolve(__dirname, '../contracts/node_modules/ethers'));

function main() {
  const rootDir = path.resolve(__dirname, '..');
  const envPath = path.resolve(rootDir, '.env');

  console.log('=== AegisAgent Provider Wallet Provisioning ===');

  if (!fs.existsSync(envPath)) {
    console.error('[ERROR] Root .env file does not exist at:', envPath);
    process.exit(1);
  }

  const envContent = fs.readFileSync(envPath, 'utf8');

  // Check if PROVIDER_PUBLIC_ADDRESS or PROVIDER_PRIVATE_KEY already exists
  const hasProviderPub = /^PROVIDER_PUBLIC_ADDRESS\s*=/m.test(envContent);
  const hasProviderKey = /^PROVIDER_PRIVATE_KEY\s*=/m.test(envContent);

  if (hasProviderPub || hasProviderKey) {
    console.log('[STATUS] Provider wallet configuration already exists in .env.');
    const matchPub = envContent.match(/^PROVIDER_PUBLIC_ADDRESS\s*=\s*(.+)$/m);
    if (matchPub && matchPub[1]) {
      console.log('Configured Provider Public Address:', matchPub[1].trim());
    }
    console.log('No modifications made. To regenerate, manually clear existing PROVIDER_* entries.');
    return;
  }

  // Generate an independent cryptographically secure random EOA wallet
  const wallet = ethers.Wallet.createRandom();
  const publicAddress = wallet.address;
  const privateKey = wallet.privateKey;

  // Append safely to .env
  const appendBlock = [
    '',
    '# Provider Operational Account (Phase 5.3.2.5.3C - Isolated Role)',
    `PROVIDER_PUBLIC_ADDRESS=${publicAddress}`,
    `PROVIDER_PRIVATE_KEY=${privateKey}`,
    ''
  ].join('\n');

  fs.appendFileSync(envPath, appendBlock, 'utf8');

  // Set file permissions to 0600 (owner read/write only)
  try {
    fs.chmodSync(envPath, 0o600);
  } catch (err) {
    console.warn('[WARN] Could not update .env permissions to 0600:', err.message);
  }

  console.log('[SUCCESS] Independent Provider wallet generated successfully.');
  console.log('Provider Public Address:', publicAddress);
  console.log('Storage: Appended to .env with restricted permissions (0600).');
  console.log('Security: Private key was written directly to file and NEVER printed or logged.');
}

try {
  main();
} catch (error) {
  console.error('[ERROR] Failed to generate provider wallet:', error.message);
  process.exit(1);
}
