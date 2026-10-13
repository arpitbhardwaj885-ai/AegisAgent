import React, { useState } from 'react';
import { getJob, EscrowApiError } from '../services/api';
import type { JobResponse } from '../types/escrow';
import { StatusBadge } from './StatusBadge';
import { formatTimestamp, truncateAddress, bpsToPercent } from '../utils/format';
import { AlertBanner } from './AlertBanner';
import { isValidBytes32Hex } from '../utils/jobId';

interface JobStatusLookupProps {
  initialJobId?: string;
}

export const JobStatusLookup: React.FC<JobStatusLookupProps> = ({ initialJobId = '' }) => {
  const [jobIdInput, setJobIdInput] = useState<string>(initialJobId);
  const [jobData, setJobData] = useState<JobResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLookup = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanId = jobIdInput.trim();

    if (!cleanId) {
      setErrorMsg('Please enter a Job ID.');
      return;
    }

    if (!isValidBytes32Hex(cleanId)) {
      setErrorMsg('Job ID must be a valid 32-byte hex string (0x followed by 64 hex characters).');
      return;
    }

    setErrorMsg(null);
    setIsLoading(true);

    try {
      const data = await getJob(cleanId);
      setJobData(data);
    } catch (err) {
      setJobData(null);
      if (err instanceof EscrowApiError) {
        if (err.statusCode === 404) {
          setErrorMsg(
            'Job Not Found on Escrow Contract. The job may be prepared off-chain but not yet submitted on-chain, or the ID is incorrect.'
          );
        } else if (err.statusCode === 503) {
          setErrorMsg('Escrow contract is currently not configured in the backend environment.');
        } else {
          setErrorMsg(`Backend [${err.code}]: ${err.message}`);
        }
      } else {
        setErrorMsg((err as Error).message || 'Failed to query job');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="glass-card" style={{ maxWidth: '840px', margin: '0 auto' }}>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#FFFFFF', marginBottom: '6px' }}>
          On-Chain Escrow Job Lookup
        </h2>
        <p style={{ color: '#94A3B8', fontSize: '0.88rem' }}>
          Query authoritative lifecycle status, locked funds, and attestation hashes directly from the deployed contract.
        </p>
      </div>

      {/* Search Input Bar */}
      <form onSubmit={handleLookup} style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <input
          id="input-lookup-job-id"
          type="text"
          value={jobIdInput}
          onChange={(e) => setJobIdInput(e.target.value)}
          placeholder="Enter 32-byte Job ID (0x...)"
          style={{
            flex: 1,
            padding: '12px 16px',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            color: '#FFFFFF',
            fontFamily: 'monospace',
            fontSize: '0.9rem',
          }}
        />
        <button
          id="btn-query-job"
          type="submit"
          disabled={isLoading}
          className="btn-primary"
          style={{
            padding: '12px 20px',
            whiteSpace: 'nowrap',
            opacity: isLoading ? 0.7 : 1,
            cursor: isLoading ? 'not-allowed' : 'pointer',
          }}
        >
          {isLoading ? 'Querying...' : 'Query On-Chain'}
        </button>
      </form>

      {errorMsg && (
        <AlertBanner
          type="warning"
          title="Lookup Status"
          message={errorMsg}
          onDismiss={() => setErrorMsg(null)}
        />
      )}

      {/* Results View */}
      {jobData && (
        <div id="job-details-card" style={{ marginTop: '24px' }}>
          {/* Header Row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px',
              borderRadius: '10px',
              backgroundColor: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              marginBottom: '16px',
            }}
          >
            <div>
              <div style={{ fontSize: '0.78rem', color: '#94A3B8' }}>On-Chain Lifecycle State</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
                <StatusBadge
                  status={jobData.status}
                  statusCode={jobData.status_code}
                  isTerminal={jobData.is_terminal}
                />
                <span style={{ fontSize: '0.8rem', color: '#CBD5E1' }}>
                  {jobData.settled ? '(Settled)' : '(Active)'}
                </span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.78rem', color: '#94A3B8' }}>Authoritative Reward</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#00F0FF' }}>
                {jobData.reward_amount_mon} MON
              </div>
              <div style={{ fontSize: '0.72rem', color: '#94A3B8', fontFamily: 'monospace' }}>
                {jobData.reward_amount_wei} wei
              </div>
            </div>
          </div>

          {/* Details Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '0.85rem' }}>
            <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <div style={{ color: '#94A3B8', fontSize: '0.75rem' }}>Job ID</div>
              <div style={{ fontFamily: 'monospace', color: '#00F0FF', wordBreak: 'break-all', marginTop: '2px' }}>
                {jobData.job_id}
              </div>
            </div>

            <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <div style={{ color: '#94A3B8', fontSize: '0.75rem' }}>Client Counterparty</div>
              <div style={{ color: '#FFFFFF', marginTop: '2px' }}>
                Agent ID: <strong>{jobData.client_agent_id}</strong> ({truncateAddress(jobData.client)})
              </div>
            </div>

            <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <div style={{ color: '#94A3B8', fontSize: '0.75rem' }}>Provider Agent</div>
              <div style={{ color: '#FFFFFF', marginTop: '2px' }}>
                Provider Agent ID: <strong>{jobData.provider_agent_id}</strong>
              </div>
            </div>

            <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <div style={{ color: '#94A3B8', fontSize: '0.75rem' }}>Designated Validator</div>
              <div style={{ color: '#FFFFFF', marginTop: '2px' }}>
                {truncateAddress(jobData.validator_address)} (Fee: {bpsToPercent(jobData.validator_fee_bps)})
              </div>
              <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>
                Min Acceptance Score: {jobData.min_acceptance_score}/100
              </div>
            </div>

            <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <div style={{ color: '#94A3B8', fontSize: '0.75rem' }}>Task Hash</div>
              <div style={{ fontFamily: 'monospace', color: '#FFFFFF', wordBreak: 'break-all', marginTop: '2px' }}>
                {jobData.task_hash}
              </div>
            </div>

            <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <div style={{ color: '#94A3B8', fontSize: '0.75rem' }}>Prehire Trust Snapshot Hash (AUDIT-01)</div>
              <div id="lookup-prehire-hash" style={{ fontFamily: 'monospace', color: '#FFFFFF', wordBreak: 'break-all', marginTop: '2px' }}>
                {jobData.prehire_trust_snapshot_hash}
              </div>
            </div>
          </div>

          {/* Lifecycle Timestamps */}
          <div
            style={{
              marginTop: '12px',
              padding: '12px',
              borderRadius: '8px',
              backgroundColor: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              fontSize: '0.8rem',
            }}
          >
            <div style={{ fontWeight: 600, color: '#CBD5E1', marginBottom: '8px' }}>Lifecycle Deadlines & Timestamps</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              <div><span style={{ color: '#94A3B8' }}>Acceptance:</span> {formatTimestamp(jobData.acceptance_deadline)}</div>
              <div><span style={{ color: '#94A3B8' }}>Submission:</span> {formatTimestamp(jobData.submission_deadline)}</div>
              <div><span style={{ color: '#94A3B8' }}>Validation:</span> {formatTimestamp(jobData.validation_deadline)}</div>
            </div>
            {jobData.submission_hash && jobData.submission_hash !== '0x' + '00'.repeat(32) && (
              <div style={{ marginTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '8px' }}>
                <div><span style={{ color: '#94A3B8' }}>Submission Hash:</span> <span style={{ fontFamily: 'monospace' }}>{jobData.submission_hash}</span></div>
                <div><span style={{ color: '#94A3B8' }}>Validation Request Hash:</span> <span style={{ fontFamily: 'monospace' }}>{jobData.validation_request_hash}</span></div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
