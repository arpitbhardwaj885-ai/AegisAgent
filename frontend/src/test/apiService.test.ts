import { describe, it, expect, vi, afterEach } from 'vitest';
import { prepareJob, getJob } from '../services/api';
import type { JobPrepareRequest, JobPrepareResponse } from '../types/escrow';

describe('Escrow API Service', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  const samplePrepareRequest: JobPrepareRequest = {
    client_agent_id: 1,
    provider_agent_id: 2,
    validator_address: '0x0674Bf234268358B5DcbD2c10cCBAFbef2AA7B1c',
    reward_amount_wei: '1000000000000000000',
    validator_fee_bps: 500,
    min_acceptance_score: 75,
    acceptance_deadline: 1800003600,
    submission_deadline: 1800007200,
    validation_deadline: 1800010800,
    task_description: 'Test proposal',
    nonce: 0,
  };

  it('successfully parses prepareJob 200 response with snake_case prehire_trust_snapshot_hash', async () => {
    const mockResponse: JobPrepareResponse = {
      job_id: '0x' + 'aa'.repeat(32),
      client_agent_id: 1,
      provider_agent_id: 2,
      validator_address: '0x0674Bf234268358B5DcbD2c10cCBAFbef2AA7B1c',
      reward_amount_wei: '1000000000000000000',
      reward_amount_mon: 1.0,
      validator_fee_bps: 500,
      validator_fee_percent: 5.0,
      min_acceptance_score: 75,
      acceptance_deadline: 1800003600,
      submission_deadline: 1800007200,
      validation_deadline: 1800010800,
      task_hash: '0x' + 'bb'.repeat(32),
      prehire_trust_snapshot_hash: '0x' + 'cc'.repeat(32),
      designated_arbiter: '0x0000000000000000000000000000000000000000',
      escrow_contract_address: '0x1234567890123456789012345678901234567890',
      nonce: 0,
      preflight_identity_verified: true,
      transaction_parameters: {
        function: 'createJob',
        contract: '0x1234567890123456789012345678901234567890',
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
      },
      broadcast: false,
      instructions: 'Sign and broadcast call directly from your wallet.',
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await prepareJob(samplePrepareRequest);
    expect(result.job_id).toBe('0x' + 'aa'.repeat(32));
    expect(result.prehire_trust_snapshot_hash).toBe('0x' + 'cc'.repeat(32));
    expect(result.broadcast).toBe(false);
  });

  it('handles backend 400 INVALID_REQUEST error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Client agent cannot hire self',
        },
      }),
    });

    await expect(prepareJob(samplePrepareRequest)).rejects.toMatchObject({
      name: 'EscrowApiError',
      code: 'INVALID_REQUEST',
      statusCode: 400,
      message: 'Client agent cannot hire self',
    });
  });

  it('handles backend 422 VALIDATION_ERROR detail array', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        detail: [
          { msg: 'Input should be greater than 0', loc: ['body', 'client_agent_id'] },
        ],
      }),
    });

    await expect(prepareJob(samplePrepareRequest)).rejects.toMatchObject({
      name: 'EscrowApiError',
      statusCode: 422,
      message: expect.stringContaining('greater than 0'),
    });
  });

  it('handles backend 404 JOB_NOT_FOUND in getJob', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({
        error: {
          code: 'JOB_NOT_FOUND',
          message: 'Job not found on contract',
        },
      }),
    });

    await expect(getJob('0x' + 'aa'.repeat(32))).rejects.toMatchObject({
      name: 'EscrowApiError',
      code: 'JOB_NOT_FOUND',
      statusCode: 404,
      message: 'Job not found on contract',
    });
  });

  it('handles backend 503 ESCROW_NOT_CONFIGURED', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({
        error: {
          code: 'ESCROW_NOT_CONFIGURED',
          message: 'Escrow contract address is not configured',
        },
      }),
    });

    await expect(getJob('0x' + 'aa'.repeat(32))).rejects.toMatchObject({
      name: 'EscrowApiError',
      code: 'ESCROW_NOT_CONFIGURED',
      statusCode: 503,
    });
  });

  it('handles backend 502 RPC_ERROR', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({
        error: {
          code: 'RPC_ERROR',
          message: 'RPC node connection refused',
        },
      }),
    });

    await expect(getJob('0x' + 'aa'.repeat(32))).rejects.toMatchObject({
      name: 'EscrowApiError',
      code: 'RPC_ERROR',
      statusCode: 502,
    });
  });

  it('handles network failure (fetch throws)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'));

    await expect(prepareJob(samplePrepareRequest)).rejects.toMatchObject({
      name: 'EscrowApiError',
      code: 'NETWORK_ERROR',
      statusCode: 0,
      message: expect.stringContaining('Network error'),
    });
  });
});
