export const MONAD_TESTNET_CHAIN_ID = 10143;
export const MONAD_TESTNET_CHAIN_ID_HEX = '0x279f';

export const MONAD_TESTNET_CONFIG = {
  chainId: MONAD_TESTNET_CHAIN_ID_HEX,
  chainName: 'Monad Testnet',
  nativeCurrency: {
    name: 'Monad',
    symbol: 'MON',
    decimals: 18,
  },
  rpcUrls: ['https://testnet-rpc.monad.xyz'],
  blockExplorerUrls: ['https://testnet.monadvision.com'],
};

export const DEPLOYED_ESCROW_CONTRACT_ADDRESS =
  import.meta.env.VITE_AEGIS_ESCROW_CONTRACT_ADDRESS || '';

export const DEPLOYED_REGISTRIES = {
  identityRegistry: '0xa7A27f96d4e8f58d701D42229d5097A69694Ca4B',
  validationRegistry: '0x802DE575B528453C8208d5201e27464d63970e2b',
  reputationRegistry: '0x3879a6d4826b5B14B0F2A8325E56a47A2216A4aB',
  hiringEscrow: DEPLOYED_ESCROW_CONTRACT_ADDRESS,
} as const;

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export const JOB_STATUS_MAP: Record<number, string> = {
  0: 'UNINITIALIZED',
  1: 'CREATED',
  2: 'ACCEPTED',
  3: 'SUBMITTED',
  4: 'VALIDATING',
  5: 'COMPLETED',
  6: 'REJECTED',
  7: 'CANCELLED',
  8: 'EXPIRED',
  9: 'EXPIRED_UNSUBMITTED',
  10: 'FAILED_VALIDATION',
  11: 'DISPUTED',
  12: 'REFUNDED',
};

export const TERMINAL_STATUSES = new Set([
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
  'EXPIRED_UNSUBMITTED',
  'REFUNDED',
]);

export interface ResolvedJobStatus {
  statusName: string;
  statusCode?: number;
  isTerminal: boolean;
  isKnown: boolean;
}

/**
 * Authoritatively resolves an escrow status from its numeric code or string name,
 * ensuring UNINITIALIZED and unknown codes/strings are handled explicitly.
 */
export function resolveJobStatus(statusCode?: number, statusStr?: string): ResolvedJobStatus {
  let name: string | undefined = undefined;

  if (statusCode !== undefined && statusCode in JOB_STATUS_MAP) {
    name = JOB_STATUS_MAP[statusCode];
  } else if (statusStr && statusStr.trim()) {
    name = statusStr.trim().toUpperCase();
  }

  if (!name) {
    return {
      statusName: 'UNKNOWN',
      statusCode,
      isTerminal: false,
      isKnown: false,
    };
  }

  const isKnown = Object.values(JOB_STATUS_MAP).includes(name);
  if (!isKnown) {
    return {
      statusName: name,
      statusCode,
      isTerminal: false,
      isKnown: false,
    };
  }

  return {
    statusName: name,
    statusCode: statusCode ?? (Object.entries(JOB_STATUS_MAP).find(([, v]) => v === name)?.[0] ? Number(Object.entries(JOB_STATUS_MAP).find(([, v]) => v === name)![0]) : undefined),
    isTerminal: TERMINAL_STATUSES.has(name),
    isKnown: true,
  };
}
