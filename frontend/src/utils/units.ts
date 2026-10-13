export const UINT256_MAX = (1n << 256n) - 1n;

/**
 * Converts a human-entered MON decimal string to an authoritative integer wei string.
 * Strictly avoids IEEE-754 floating-point arithmetic (never uses parseFloat or * 1e18).
 *
 * @param monStr Input MON amount (e.g., "1.5", "0.000000000000000001", "100")
 * @returns Exact wei string (e.g., "1500000000000000000")
 * @throws Error on invalid format, negative values, > 18 decimals, or uint256 overflow
 */
export function monToWei(monStr: string): string {
  if (typeof monStr !== 'string') {
    throw new Error('Input must be a string');
  }

  const trimmed = monStr.trim();
  if (!trimmed) {
    throw new Error('Amount cannot be empty');
  }

  if (trimmed.startsWith('-')) {
    throw new Error('Amount cannot be negative');
  }

  if (!/^\d*(\.\d*)?$/.test(trimmed) || trimmed === '.') {
    throw new Error('Invalid numeric format');
  }

  const parts = trimmed.split('.');
  const wholePart = parts[0] ? parts[0].replace(/^0+(?=\d)/, '') || '0' : '0';
  const fracPart = parts[1] || '';

  if (fracPart.length > 18) {
    throw new Error(`Invalid precision: MON has 18 decimal places, received ${fracPart.length}`);
  }

  const paddedFrac = fracPart.padEnd(18, '0');
  const combined = wholePart + paddedFrac;
  const weiBigInt = BigInt(combined);

  if (weiBigInt > UINT256_MAX) {
    throw new Error('Amount exceeds maximum uint256 value');
  }

  return weiBigInt.toString();
}

/**
 * Converts an authoritative integer wei string to a display MON string.
 * Uses exact BigInt decimal slicing; never uses floating-point division.
 *
 * @param weiStr Authoritative integer wei string (e.g., "1000000000000000001")
 * @returns Formatted MON string (e.g., "1.000000000000000001")
 */
export function weiToMon(weiStr: string): string {
  if (typeof weiStr !== 'string' || !/^\d+$/.test(weiStr.trim())) {
    throw new Error('Invalid wei string: must be non-negative integer digits');
  }

  const trimmed = weiStr.trim();
  const weiBigInt = BigInt(trimmed);

  if (weiBigInt > UINT256_MAX) {
    throw new Error('Wei amount exceeds maximum uint256');
  }

  if (weiBigInt === 0n) {
    return '0';
  }

  const padded = trimmed.padStart(19, '0');
  const wholePart = padded.slice(0, padded.length - 18).replace(/^0+(?=\d)/, '') || '0';
  const fracPart = padded.slice(padded.length - 18).replace(/0+$/, '');

  return fracPart.length > 0 ? `${wholePart}.${fracPart}` : wholePart;
}
