import { keccak_256 } from '@noble/hashes/sha3.js';
import { UINT256_MAX } from './units';

/**
 * Converts a non-negative integer/bigint into a 32-byte big-endian Uint8Array (uint256).
 */
export function uint256ToBytes(value: number | bigint): Uint8Array {
  const big = BigInt(value);
  if (big < 0n || big > UINT256_MAX) {
    throw new Error('Value out of range for uint256');
  }
  const bytes = new Uint8Array(32);
  let temp = big;
  for (let i = 31; i >= 0; i--) {
    bytes[i] = Number(temp & 0xffn);
    temp >>= 8n;
  }
  return bytes;
}

/**
 * Converts a non-negative integer into an 8-byte big-endian Uint8Array (uint64).
 */
export function uint64ToBytes(value: number | bigint): Uint8Array {
  const big = BigInt(value);
  if (big < 0n || big > 0xffffffffffffffffn) {
    throw new Error('Value out of range for uint64');
  }
  const bytes = new Uint8Array(8);
  let temp = big;
  for (let i = 7; i >= 0; i--) {
    bytes[i] = Number(temp & 0xffn);
    temp >>= 8n;
  }
  return bytes;
}

/**
 * Parses a 32-byte hex string (with or without 0x prefix) into a 32-byte Uint8Array.
 */
export function hexToBytes32(hex: string): Uint8Array {
  let clean = hex.trim();
  if (clean.startsWith('0x') || clean.startsWith('0X')) {
    clean = clean.slice(2);
  }
  if (clean.length !== 64 || !/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error('Input must be a valid 32-byte hex string (64 hex characters)');
  }
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Validates whether a string is a canonical 32-byte hex string (0x + 64 hex characters).
 */
export function isValidBytes32Hex(str: string): boolean {
  if (typeof str !== 'string') return false;
  const trimmed = str.trim();
  return /^0x[0-9a-fA-F]{64}$/.test(trimmed);
}

/**
 * Derives the canonical or nonce-augmented Job ID according to AegisAgent escrow rules:
 * - With nonce: keccak256(abi.encodePacked(clientAgentId, providerAgentId, taskHash, acceptanceDeadline, nonce))
 * - Without nonce: keccak256(abi.encodePacked(clientAgentId, providerAgentId, taskHash, acceptanceDeadline))
 */
export function deriveJobId(
  clientAgentId: number,
  providerAgentId: number,
  taskHash: string,
  acceptanceDeadline: number,
  nonce?: number | null
): string {
  const clientBytes = uint256ToBytes(clientAgentId);
  const providerBytes = uint256ToBytes(providerAgentId);
  const taskBytes = hexToBytes32(taskHash);
  const deadlineBytes = uint64ToBytes(acceptanceDeadline);

  const hasNonce = nonce !== undefined && nonce !== null && nonce >= 0;
  const totalLength = hasNonce ? 32 + 32 + 32 + 8 + 32 : 32 + 32 + 32 + 8;
  const packed = new Uint8Array(totalLength);

  let offset = 0;
  packed.set(clientBytes, offset);
  offset += 32;
  packed.set(providerBytes, offset);
  offset += 32;
  packed.set(taskBytes, offset);
  offset += 32;
  packed.set(deadlineBytes, offset);
  offset += 8;

  if (hasNonce) {
    const nonceBytes = uint256ToBytes(nonce);
    packed.set(nonceBytes, offset);
  }

  const hashBytes = keccak_256(packed);
  let hexStr = '0x';
  for (let i = 0; i < hashBytes.length; i++) {
    hexStr += hashBytes[i].toString(16).padStart(2, '0');
  }
  return hexStr.toLowerCase();
}
