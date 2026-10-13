import { describe, it, expect } from 'vitest';
import { monToWei, weiToMon } from '../utils/units';
import { deriveJobId, isValidBytes32Hex } from '../utils/jobId';

describe('Job ID Derivation Test Vectors', () => {
  const clientAgentId = 1;
  const providerAgentId = 2;
  const taskHash = '0x' + 'bb'.repeat(32);
  const acceptanceDeadline = 1800000000;

  it('matches exact canonical derivation test vector without nonce', () => {
    const derived = deriveJobId(clientAgentId, providerAgentId, taskHash, acceptanceDeadline);
    expect(derived).toBe('0x7966c0727a02c75f6c784fd2f48ba1607243bcc6c83d24ebeacd4d1f23aaa173');
  });

  it('matches exact test vector with nonce = 0', () => {
    const derived = deriveJobId(clientAgentId, providerAgentId, taskHash, acceptanceDeadline, 0);
    expect(derived).toBe('0x874e28a56e56555fa53cc2c056031ee6cb0689375d34f25329a05b63f35792d3');
  });

  it('matches exact test vector with nonce = 1', () => {
    const derived = deriveJobId(clientAgentId, providerAgentId, taskHash, acceptanceDeadline, 1);
    expect(derived).toBe('0xa72b432d4c159d82f29d5ba2f84123cbd7cabf1e683643faabe96865c457e2d6');
  });

  it('proves repeat jobs with identical terms produce distinct IDs with nonces', () => {
    const id0 = deriveJobId(clientAgentId, providerAgentId, taskHash, acceptanceDeadline, 0);
    const id1 = deriveJobId(clientAgentId, providerAgentId, taskHash, acceptanceDeadline, 1);
    expect(id0).not.toBe(id1);
    expect(isValidBytes32Hex(id0)).toBe(true);
    expect(isValidBytes32Hex(id1)).toBe(true);
  });

  it('validates 32-byte hex strings', () => {
    expect(isValidBytes32Hex('0x' + '11'.repeat(32))).toBe(true);
    expect(isValidBytes32Hex('0x123')).toBe(false);
    expect(isValidBytes32Hex('not-hex')).toBe(false);
    expect(isValidBytes32Hex('0x' + 'zz'.repeat(32))).toBe(false);
  });
});

describe('Monetary Precision and Unit Conversions', () => {
  it('converts 1 MON to exact 10^18 wei', () => {
    expect(monToWei('1')).toBe('1000000000000000000');
    expect(monToWei('1.0')).toBe('1000000000000000000');
  });

  it('converts 1 MON + 1 wei without IEEE-754 precision loss', () => {
    const oneMonPlusOneWei = '1.000000000000000001';
    const resultWei = monToWei(oneMonPlusOneWei);
    expect(resultWei).toBe('1000000000000000001');
    expect(weiToMon(resultWei)).toBe('1.000000000000000001');
  });

  it('converts 1 wei minimum value', () => {
    expect(monToWei('0.000000000000000001')).toBe('1');
    expect(weiToMon('1')).toBe('0.000000000000000001');
  });

  it('handles zero cleanly', () => {
    expect(monToWei('0')).toBe('0');
    expect(monToWei('0.0')).toBe('0');
    expect(weiToMon('0')).toBe('0');
  });

  it('rejects precision exceeding 18 decimals', () => {
    expect(() => monToWei('1.0000000000000000001')).toThrow(/Invalid precision/);
  });

  it('rejects negative numbers and malformed characters', () => {
    expect(() => monToWei('-5')).toThrow(/cannot be negative/);
    expect(() => monToWei('abc')).toThrow(/Invalid numeric format/);
    expect(() => monToWei('1.2.3')).toThrow(/Invalid numeric format/);
    expect(() => monToWei('')).toThrow(/cannot be empty/);
  });

  it('rejects out of range uint256 values', () => {
    // 2^256 in wei is out of range
    const hugeWei = (1n << 256n).toString();
    expect(() => weiToMon(hugeWei)).toThrow(/exceeds maximum uint256/);
  });
});
