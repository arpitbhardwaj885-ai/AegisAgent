export interface EthereumProvider {
  isMetaMask?: boolean;
  request: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>;
  on: (event: string, callback: (...args: unknown[]) => void) => void;
  removeListener: (event: string, callback: (...args: unknown[]) => void) => void;
}

export type WalletConnectionStatus =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'WRONG_NETWORK'
  | 'ERROR';

export interface WalletState {
  status: WalletConnectionStatus;
  account: string | null;
  chainId: number | null;
  chainIdHex: string | null;
  isMonadTestnet: boolean;
  errorMessage: string | null;
}
