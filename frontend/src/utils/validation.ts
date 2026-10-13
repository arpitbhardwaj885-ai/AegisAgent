import { UINT256_MAX } from './units';
import { ZERO_ADDRESS } from '../config/constants';

export function isValidAddress(address: string): boolean {
  if (typeof address !== 'string') return false;
  return /^0x[0-9a-fA-F]{40}$/.test(address.trim());
}

export function isNonZeroAddress(address: string): boolean {
  if (!isValidAddress(address)) return false;
  return address.trim().toLowerCase() !== ZERO_ADDRESS.toLowerCase();
}

export function isValidAgentId(id: unknown): boolean {
  if (typeof id === 'number') {
    return Number.isInteger(id) && id > 0 && BigInt(id) <= UINT256_MAX;
  }
  if (typeof id === 'string') {
    if (!/^\d+$/.test(id.trim())) return false;
    try {
      const big = BigInt(id.trim());
      return big > 0n && big <= UINT256_MAX;
    } catch {
      return false;
    }
  }
  return false;
}

export function isValidFeeBps(bps: unknown): boolean {
  if (typeof bps !== 'number' || !Number.isInteger(bps)) return false;
  return bps >= 0 && bps <= 5000;
}

export function isValidAcceptanceScore(score: unknown): boolean {
  if (typeof score !== 'number' || !Number.isInteger(score)) return false;
  return score >= 1 && score <= 100;
}

export interface DeadlineValidationResult {
  valid: boolean;
  error?: string;
}

export function validateDeadlines(
  acceptance: number,
  submission: number,
  validation: number,
  nowSeconds = Math.floor(Date.now() / 1000)
): DeadlineValidationResult {
  if (acceptance <= nowSeconds) {
    return {
      valid: false,
      error: `Acceptance deadline (${acceptance}) must be in the future (current: ${nowSeconds})`,
    };
  }
  if (submission <= acceptance) {
    return {
      valid: false,
      error: 'Submission deadline must strictly follow acceptance deadline',
    };
  }
  if (validation <= submission) {
    return {
      valid: false,
      error: 'Validation deadline must strictly follow submission deadline',
    };
  }
  return { valid: true };
}
