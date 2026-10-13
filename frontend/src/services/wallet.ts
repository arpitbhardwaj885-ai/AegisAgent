import {
  MONAD_TESTNET_CHAIN_ID,
  MONAD_TESTNET_CHAIN_ID_HEX,
  MONAD_TESTNET_CONFIG,
} from '../config/constants';
import type { EthereumProvider } from '../types/wallet';
import type { PreparedTransactionParameters } from '../types/escrow';
import { isValidBytes32Hex } from '../utils/jobId';

export class WalletError extends Error {
  code?: number | string;
  constructor(message: string, code?: number | string) {
    super(message);
    this.name = 'WalletError';
    this.code = code;
  }
}

export function getInjectedProvider(): EthereumProvider | null {
  if (typeof window === 'undefined') return null;
  const eth = (window as unknown as { ethereum?: EthereumProvider }).ethereum;
  return eth || null;
}

export async function requestAccounts(): Promise<string[]> {
  const provider = getInjectedProvider();
  if (!provider) {
    throw new WalletError(
      'No injected EVM wallet found. Please install MetaMask or another Web3 browser extension.',
      'PROVIDER_UNAVAILABLE'
    );
  }

  try {
    const accounts = (await provider.request({
      method: 'eth_requestAccounts',
    })) as string[];
    if (!accounts || accounts.length === 0) {
      throw new WalletError('No accounts returned from wallet', 'NO_ACCOUNTS');
    }
    return accounts.map((a) => a.toLowerCase());
  } catch (err: unknown) {
    const e = err as { code?: number; message?: string };
    if (e.code === 4001) {
      throw new WalletError('Wallet connection rejected by user', 4001);
    }
    throw new WalletError(e.message || 'Failed to connect wallet', e.code);
  }
}

export async function getCurrentChainId(): Promise<number> {
  const provider = getInjectedProvider();
  if (!provider) {
    throw new WalletError('No injected EVM wallet found', 'PROVIDER_UNAVAILABLE');
  }

  const chainIdHex = (await provider.request({
    method: 'eth_chainId',
  })) as string;

  return parseInt(chainIdHex, 16);
}

export async function switchToMonadTestnet(): Promise<void> {
  const provider = getInjectedProvider();
  if (!provider) {
    throw new WalletError('No injected EVM wallet found', 'PROVIDER_UNAVAILABLE');
  }

  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: MONAD_TESTNET_CHAIN_ID_HEX }],
    });
  } catch (switchError: unknown) {
    const e = switchError as { code?: number; message?: string };
    // 4902 indicates chain is not yet added to wallet
    if (e.code === 4902) {
      try {
        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [MONAD_TESTNET_CONFIG],
        });
      } catch (addError: unknown) {
        const ae = addError as { code?: number; message?: string };
        if (ae.code === 4001) {
          throw new WalletError('User rejected adding Monad Testnet to wallet', 4001);
        }
        throw new WalletError(`Failed to add Monad Testnet: ${ae.message}`, ae.code);
      }
    } else if (e.code === 4001) {
      throw new WalletError('User rejected switching network', 4001);
    } else {
      throw new WalletError(`Failed to switch to Monad Testnet: ${e.message}`, e.code);
    }
  }
}

export interface TransactionReceipt {
  status: '0x1' | '0x0';
  transactionHash: string;
  blockNumber: number;
  gasUsed: string;
  simulated: boolean;
}

/**
 * Phase 5.3.2.3 Transaction Boundary:
 * Enforces that during this phase, NO real transactions are broadcast to Monad Testnet.
 * Validates transaction target, value, calldata format, and expected chain before user signing simulation.
 */
export async function executeEscrowTransactionSimulation(
  txParams: PreparedTransactionParameters,
  expectedContractAddress: string | null,
  currentChainId: number
): Promise<{ txHash: string; receipt: TransactionReceipt; simulated: boolean }> {
  if (currentChainId !== MONAD_TESTNET_CHAIN_ID) {
    throw new WalletError(
      `Incorrect network (Chain ID: ${currentChainId}). Please switch to Monad Testnet (${MONAD_TESTNET_CHAIN_ID}).`,
      'WRONG_NETWORK'
    );
  }

  if (!txParams.contract) {
    throw new WalletError(
      'Escrow contract address is unconfigured. Transaction creation is blocked.',
      'CONTRACT_UNCONFIGURED'
    );
  }

  if (expectedContractAddress && txParams.contract.toLowerCase() !== expectedContractAddress.toLowerCase()) {
    throw new WalletError(
      `Contract address mismatch: expected ${expectedContractAddress}, got ${txParams.contract}`,
      'ADDRESS_MISMATCH'
    );
  }

  // Validate calldata function and arguments
  if (txParams.function !== 'createJob') {
    throw new WalletError(`Unsupported contract method: ${txParams.function}`, 'INVALID_FUNCTION');
  }

  if (!txParams.value || typeof txParams.value !== 'string' || !/^\d+$/.test(txParams.value) || BigInt(txParams.value) <= 0n) {
    throw new WalletError('Transaction value must be a positive integer wei string', 'INVALID_VALUE');
  }

  const { args } = txParams;
  if (!args || !isValidBytes32Hex(args.jobId)) {
    throw new WalletError('Invalid or missing bytes32 jobId in transaction arguments', 'INVALID_JOB_ID');
  }

  if (!isValidBytes32Hex(args.taskHash)) {
    throw new WalletError('Invalid or missing bytes32 taskHash in transaction arguments', 'INVALID_TASK_HASH');
  }

  if (args.clientAgentId <= 0 || args.providerAgentId <= 0 || args.clientAgentId === args.providerAgentId) {
    throw new WalletError('Invalid counterparties: agent IDs must be positive and non-equal', 'INVALID_AGENTS');
  }

  if (args.validatorFeeBps < 0 || args.validatorFeeBps > 5000) {
    throw new WalletError('Validator fee exceeds maximum allowed 5000 bps', 'INVALID_FEE');
  }

  if (args.minAcceptanceScore < 1 || args.minAcceptanceScore > 100) {
    throw new WalletError('Minimum acceptance score must be between 1 and 100', 'INVALID_SCORE');
  }

  if (args.acceptanceDeadline >= args.submissionDeadline || args.submissionDeadline >= args.validationDeadline) {
    throw new WalletError('Deadlines must follow sequence: acceptance < submission < validation', 'INVALID_DEADLINES');
  }

  // Generate deterministic simulation tx hash based on jobId
  const jobId = args.jobId;
  const mockTxHash = `0xsim_${jobId.slice(2, 34)}`;

  // Simulate network confirmation delay
  await new Promise((resolve) => setTimeout(resolve, 600));

  const mockReceipt: TransactionReceipt = {
    status: '0x1',
    transactionHash: mockTxHash,
    blockNumber: 68450123,
    gasUsed: '142500',
    simulated: true,
  };

  return {
    txHash: mockTxHash,
    receipt: mockReceipt,
    simulated: true,
  };
}
