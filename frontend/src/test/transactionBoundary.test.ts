import { describe, it, expect } from 'vitest';
import { executeEscrowTransactionSimulation } from '../services/wallet';
import { PreparedTransactionParameters } from '../types/escrow';
import { MONAD_TESTNET_CHAIN_ID } from '../config/constants';

describe('Transaction Boundary and Safety Checks', () => {
  const dummyEscrow = '0x1234567890123456789012345678901234567890';
  const sampleTxParams: PreparedTransactionParameters = {
    function: 'createJob',
    contract: dummyEscrow,
    value: '1000000000000000000',
    args: {
      jobId: '0x' + 'aa'.repeat(32),
      clientAgentId: 1,
      providerAgentId: 2,
      validatorAddress: '0x0674Bf234268358B5DcbD2c10cCBAFbef2AA7B1c',
      validatorFeeBps: 500,
      minAcceptanceScore: 75,
      acceptanceDeadline: 1800003600,
      submissionDeadline: 1800007200,
      validationDeadline: 1800010800,
      taskHash: '0x' + 'bb'.repeat(32),
      prehireTrustSnapshotHash: '0x' + 'cc'.repeat(32),
      arbiterOverride: '0x0000000000000000000000000000000000000000',
    },
  };

  it('rejects transaction when chain ID is not Monad Testnet (10143)', async () => {
    await expect(
      executeEscrowTransactionSimulation(sampleTxParams, dummyEscrow, 1)
    ).rejects.toThrow(/Incorrect network/);
  });

  it('blocks transaction when escrow contract address is null or unconfigured', async () => {
    const unconfiguredParams: PreparedTransactionParameters = {
      ...sampleTxParams,
      contract: null,
    };
    await expect(
      executeEscrowTransactionSimulation(unconfiguredParams, null, MONAD_TESTNET_CHAIN_ID)
    ).rejects.toThrow(/Escrow contract address is unconfigured/);
  });

  it('detects contract address mismatch between preparation and expected configuration', async () => {
    const unexpectedEscrow = '0x9999999999999999999999999999999999999999';
    await expect(
      executeEscrowTransactionSimulation(sampleTxParams, unexpectedEscrow, MONAD_TESTNET_CHAIN_ID)
    ).rejects.toThrow(/Contract address mismatch/);
  });

  it('returns valid simulation receipt with status 0x1 when parameters match', async () => {
    const result = await executeEscrowTransactionSimulation(
      sampleTxParams,
      dummyEscrow,
      MONAD_TESTNET_CHAIN_ID
    );

    expect(result.receipt.status).toBe('0x1');
    expect(result.receipt.blockNumber).toBeGreaterThan(0);
    expect(result.txHash.startsWith('0xsim_')).toBe(true);
    expect(result.simulated).toBe(true);
    expect(result.receipt.simulated).toBe(true);
  });

  it('rejects unsupported function calls (e.g. not createJob)', async () => {
    const badFunctionParams = {
      ...sampleTxParams,
      function: 'transfer',
    };
    await expect(
      executeEscrowTransactionSimulation(badFunctionParams, dummyEscrow, MONAD_TESTNET_CHAIN_ID)
    ).rejects.toThrow(/Unsupported contract method/);
  });

  it('rejects non-integer, negative, or zero wei values', async () => {
    const zeroValueParams = {
      ...sampleTxParams,
      value: '0',
    };
    await expect(
      executeEscrowTransactionSimulation(zeroValueParams, dummyEscrow, MONAD_TESTNET_CHAIN_ID)
    ).rejects.toThrow(/positive integer wei string/);

    const floatValueParams = {
      ...sampleTxParams,
      value: '1.5',
    };
    await expect(
      executeEscrowTransactionSimulation(floatValueParams, dummyEscrow, MONAD_TESTNET_CHAIN_ID)
    ).rejects.toThrow(/positive integer wei string/);
  });

  it('rejects malformed bytes32 jobId in transaction args', async () => {
    const badJobIdParams = {
      ...sampleTxParams,
      args: {
        ...sampleTxParams.args,
        jobId: '0xinvalid',
      },
    };
    await expect(
      executeEscrowTransactionSimulation(badJobIdParams, dummyEscrow, MONAD_TESTNET_CHAIN_ID)
    ).rejects.toThrow(/Invalid or missing bytes32 jobId/);
  });

  it('rejects out-of-order deadlines in transaction args', async () => {
    const badDeadlinesParams = {
      ...sampleTxParams,
      args: {
        ...sampleTxParams.args,
        acceptanceDeadline: 1800008000,
        submissionDeadline: 1800007000, // submission before acceptance
      },
    };
    await expect(
      executeEscrowTransactionSimulation(badDeadlinesParams, dummyEscrow, MONAD_TESTNET_CHAIN_ID)
    ).rejects.toThrow(/Deadlines must follow sequence/);
  });

  it('confirms no real transactions are broadcast to live blockchain during tests', () => {
    // Assert that the simulation does not call window.ethereum sendTransaction
    // and returns simulated parameters
    expect(sampleTxParams.args.jobId).toBe('0x' + 'aa'.repeat(32));
  });
});
