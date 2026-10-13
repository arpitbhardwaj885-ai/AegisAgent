import React, { useState, useEffect, useCallback } from 'react';
import type {
  WalletState,
  WalletConnectionStatus,
} from '../types/wallet';
import {
  MONAD_TESTNET_CHAIN_ID,
  MONAD_TESTNET_CHAIN_ID_HEX,
} from '../config/constants';
import {
  getInjectedProvider,
  requestAccounts,
  getCurrentChainId,
  switchToMonadTestnet,
  WalletError,
} from '../services/wallet';
import { WalletContext, defaultWalletState } from './WalletContextTypes';

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [walletState, setWalletState] = useState<WalletState>(defaultWalletState);
  const [hasProvider] = useState<boolean>(() => !!getInjectedProvider());

  const handleAccountsChanged = useCallback((accounts: unknown) => {
    const accList = accounts as string[];
    if (!accList || accList.length === 0) {
      setWalletState((prev) => ({
        ...prev,
        status: 'DISCONNECTED',
        account: null,
        errorMessage: null,
      }));
    } else {
      setWalletState((prev) => ({
        ...prev,
        account: accList[0].toLowerCase(),
        status: prev.isMonadTestnet ? 'CONNECTED' : 'WRONG_NETWORK',
        errorMessage: prev.isMonadTestnet ? null : `Wrong network. Please switch to Monad Testnet (${MONAD_TESTNET_CHAIN_ID}).`,
      }));
    }
  }, []);

  const handleChainChanged = useCallback((chainIdHex: unknown) => {
    const hex = chainIdHex as string;
    const chainId = parseInt(hex, 16);
    const isMonad = chainId === MONAD_TESTNET_CHAIN_ID;

    setWalletState((prev) => ({
      ...prev,
      chainId,
      chainIdHex: hex,
      isMonadTestnet: isMonad,
      status: prev.account ? (isMonad ? 'CONNECTED' : 'WRONG_NETWORK') : 'DISCONNECTED',
      errorMessage: isMonad ? null : `Unsupported network. Expected Monad Testnet (${MONAD_TESTNET_CHAIN_ID}).`,
    }));
  }, []);

  // Listen to provider events if connected
  useEffect(() => {
    const provider = getInjectedProvider();
    if (!provider) return;

    provider.on('accountsChanged', handleAccountsChanged);
    provider.on('chainChanged', handleChainChanged);

    return () => {
      provider.removeListener('accountsChanged', handleAccountsChanged);
      provider.removeListener('chainChanged', handleChainChanged);
    };
  }, [handleAccountsChanged, handleChainChanged]);

  const connectWallet = useCallback(async () => {
    setWalletState((prev) => ({ ...prev, status: 'CONNECTING', errorMessage: null }));
    try {
      const accounts = await requestAccounts();
      const chainId = await getCurrentChainId();
      const isMonad = chainId === MONAD_TESTNET_CHAIN_ID;
      const status: WalletConnectionStatus = isMonad ? 'CONNECTED' : 'WRONG_NETWORK';

      setWalletState({
        status,
        account: accounts[0],
        chainId,
        chainIdHex: `0x${chainId.toString(16)}`,
        isMonadTestnet: isMonad,
        errorMessage: isMonad ? null : `Wrong network (Chain ID: ${chainId}). Switch to Monad Testnet (${MONAD_TESTNET_CHAIN_ID}).`,
      });
    } catch (err: unknown) {
      const e = err as WalletError;
      setWalletState((prev) => ({
        ...prev,
        status: 'ERROR',
        errorMessage: e.message || 'Failed to connect wallet',
      }));
    }
  }, []);

  const switchNetwork = useCallback(async () => {
    try {
      await switchToMonadTestnet();
      const chainId = await getCurrentChainId();
      const isMonad = chainId === MONAD_TESTNET_CHAIN_ID;

      setWalletState((prev) => ({
        ...prev,
        chainId,
        chainIdHex: MONAD_TESTNET_CHAIN_ID_HEX,
        isMonadTestnet: isMonad,
        status: prev.account && isMonad ? 'CONNECTED' : prev.status,
        errorMessage: isMonad ? null : prev.errorMessage,
      }));
    } catch (err: unknown) {
      const e = err as WalletError;
      setWalletState((prev) => ({
        ...prev,
        errorMessage: e.message || 'Failed to switch network',
      }));
    }
  }, []);

  const disconnectWallet = useCallback(() => {
    setWalletState(defaultWalletState);
  }, []);

  return (
    <WalletContext.Provider
      value={{
        walletState,
        connectWallet,
        disconnectWallet,
        switchNetwork,
        hasProvider,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};
