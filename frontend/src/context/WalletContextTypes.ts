import { createContext } from 'react';
import type { WalletState } from '../types/wallet';

export interface WalletContextType {
  walletState: WalletState;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
  switchNetwork: () => Promise<void>;
  hasProvider: boolean;
}

export const defaultWalletState: WalletState = {
  status: 'DISCONNECTED',
  account: null,
  chainId: null,
  chainIdHex: null,
  isMonadTestnet: false,
  errorMessage: null,
};

export const WalletContext = createContext<WalletContextType>({
  walletState: defaultWalletState,
  connectWallet: async () => {},
  disconnectWallet: () => {},
  switchNetwork: async () => {},
  hasProvider: false,
});
