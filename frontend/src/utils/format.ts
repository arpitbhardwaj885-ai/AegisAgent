/**
 * Formats an Ethereum address to truncated form (0x1234...5678).
 */
export function truncateAddress(address: string, start = 6, end = 4): string {
  if (!address || typeof address !== 'string') return '';
  const trimmed = address.trim();
  if (trimmed.length <= start + end) return trimmed;
  return `${trimmed.slice(0, start)}...${trimmed.slice(-end)}`;
}

/**
 * Formats a Unix timestamp (seconds) into a readable date string.
 */
export function formatTimestamp(seconds: number): string {
  if (!seconds || seconds <= 0) return 'None';
  const date = new Date(seconds * 1000);
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });
}

/**
 * Converts basis points (e.g. 500) to human-readable percentage (e.g. "5.0%").
 */
export function bpsToPercent(bps: number): string {
  if (typeof bps !== 'number') return '0.0%';
  return `${(bps / 100).toFixed(1)}%`;
}
