import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  getInjectedProvider,
  requestAccounts,
  getCurrentChainId,
  switchToMonadTestnet,
} from '../services/wallet';
import { MONAD_TESTNET_CHAIN_ID, MONAD_TESTNET_CHAIN_ID_HEX } from '../config/constants';
import type { EthereumProvider } from '../types/wallet';

describe('Wallet and Network Service', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('detects when injected EVM provider is unavailable', async () => {
    // Delete window.ethereum
    (window as unknown as { ethereum: unknown }).ethereum = undefined;
    expect(getInjectedProvider()).toBeNull();

    await expect(requestAccounts()).rejects.toThrow('No injected EVM wallet found');
    await expect(getCurrentChainId()).rejects.toThrow('No injected EVM wallet found');
    await expect(switchToMonadTestnet()).rejects.toThrow('No injected EVM wallet found');
  });

  it('handles user rejecting wallet permission (code 4001)', async () => {
    const mockProvider: EthereumProvider = {
      request: vi.fn().mockRejectedValue({ code: 4001, message: 'User rejected' }),
      on: vi.fn(),
      removeListener: vi.fn(),
    };
    (window as unknown as { ethereum: unknown }).ethereum = mockProvider;

    await expect(requestAccounts()).rejects.toThrow('Wallet connection rejected by user');
  });

  it('successfully returns lowercase accounts upon user authorization', async () => {
    const mockAccounts = ['0x1111111111111111111111111111111111111111'];
    const mockProvider: EthereumProvider = {
      request: vi.fn().mockResolvedValue(mockAccounts),
      on: vi.fn(),
      removeListener: vi.fn(),
    };
    (window as unknown as { ethereum: unknown }).ethereum = mockProvider;

    const accounts = await requestAccounts();
    expect(accounts).toEqual(['0x1111111111111111111111111111111111111111']);
    expect(mockProvider.request).toHaveBeenCalledWith({ method: 'eth_requestAccounts' });
  });

  it('identifies expected Monad Testnet Chain ID (10143)', async () => {
    const mockProvider: EthereumProvider = {
      request: vi.fn().mockResolvedValue(MONAD_TESTNET_CHAIN_ID_HEX),
      on: vi.fn(),
      removeListener: vi.fn(),
    };
    (window as unknown as { ethereum: unknown }).ethereum = mockProvider;

    const chainId = await getCurrentChainId();
    expect(chainId).toBe(MONAD_TESTNET_CHAIN_ID);
  });

  it('identifies wrong network (e.g. Ethereum Mainnet Chain ID 1)', async () => {
    const mockProvider: EthereumProvider = {
      request: vi.fn().mockResolvedValue('0x1'),
      on: vi.fn(),
      removeListener: vi.fn(),
    };
    (window as unknown as { ethereum: unknown }).ethereum = mockProvider;

    const chainId = await getCurrentChainId();
    expect(chainId).toBe(1);
    expect(chainId).not.toBe(MONAD_TESTNET_CHAIN_ID);
  });

  it('switches to Monad Testnet via wallet_switchEthereumChain', async () => {
    const mockProvider: EthereumProvider = {
      request: vi.fn().mockResolvedValue(null),
      on: vi.fn(),
      removeListener: vi.fn(),
    };
    (window as unknown as { ethereum: unknown }).ethereum = mockProvider;

    await switchToMonadTestnet();
    expect(mockProvider.request).toHaveBeenCalledWith({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: MONAD_TESTNET_CHAIN_ID_HEX }],
    });
  });

  it('adds Monad Testnet when error 4902 (chain not added) is received', async () => {
    const mockRequest = vi.fn().mockImplementation((args: { method: string }) => {
      if (args.method === 'wallet_switchEthereumChain') {
        return Promise.reject({ code: 4902, message: 'Unrecognized chain' });
      }
      if (args.method === 'wallet_addEthereumChain') {
        return Promise.resolve(null);
      }
      return Promise.resolve(null);
    });

    const mockProvider: EthereumProvider = {
      request: mockRequest,
      on: vi.fn(),
      removeListener: vi.fn(),
    };
    (window as unknown as { ethereum: unknown }).ethereum = mockProvider;

    await switchToMonadTestnet();
    expect(mockRequest).toHaveBeenCalledWith({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: MONAD_TESTNET_CHAIN_ID_HEX }],
    });
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'wallet_addEthereumChain' })
    );
  });
});
