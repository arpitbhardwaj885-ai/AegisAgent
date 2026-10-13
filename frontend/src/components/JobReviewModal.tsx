import React, { useState } from 'react';
import type { JobPrepareResponse, LifecycleStage } from '../types/escrow';
import { useWallet } from '../context/useWallet';
import { formatTimestamp, truncateAddress, bpsToPercent } from '../utils/format';
import { MONAD_TESTNET_CHAIN_ID } from '../config/constants';
import { executeEscrowTransactionSimulation, WalletError } from '../services/wallet';
import { AlertBanner } from './AlertBanner';

interface JobReviewModalProps {
  preparedJob: JobPrepareResponse;
  onClose: () => void;
  onSuccess: (txHash: string, jobId: string) => void;
  onReprepareWithNewNonce?: () => void;
}

export const JobReviewModal: React.FC<JobReviewModalProps> = ({
  preparedJob,
  onClose,
  onSuccess,
  onReprepareWithNewNonce,
}) => {
  const { walletState, switchNetwork } = useWallet();
  const [confirmedByUser, setConfirmedByUser] = useState<boolean>(false);
  const [lifecycleStage, setLifecycleStage] = useState<LifecycleStage>('PREPARED_UNSUBMITTED');
  const [txError, setTxError] = useState<string | null>(null);
  const [confirmedTxHash, setConfirmedTxHash] = useState<string | null>(null);

  const isContractConfigured = Boolean(
    preparedJob.escrow_contract_address &&
    preparedJob.escrow_contract_address !== '0x0000000000000000000000000000000000000000'
  );

  const handleSignAndSubmit = async () => {
    if (!confirmedByUser) {
      setTxError('Please confirm that you have reviewed the specifications.');
      return;
    }

    if (walletState.status !== 'CONNECTED') {
      setTxError('Please connect your EVM wallet before signing.');
      return;
    }

    if (!walletState.isMonadTestnet) {
      setTxError(`Incorrect network. Please switch to Monad Testnet (${MONAD_TESTNET_CHAIN_ID}).`);
      return;
    }

    if (!isContractConfigured) {
      setTxError('Escrow contract is not configured on this environment. Transaction submission is disabled.');
      return;
    }

    setTxError(null);
    setLifecycleStage('SIGNING');

    try {
      // Simulate signing delay
      await new Promise((resolve) => setTimeout(resolve, 400));
      setLifecycleStage('TX_PENDING');

      // Execute simulated local transaction boundary
      const result = await executeEscrowTransactionSimulation(
        preparedJob.transaction_parameters,
        preparedJob.escrow_contract_address,
        walletState.chainId || MONAD_TESTNET_CHAIN_ID
      );

      if (result.receipt.status === '0x1') {
        setLifecycleStage('TX_SIMULATED');
        setConfirmedTxHash(result.txHash);
        onSuccess(result.txHash, preparedJob.job_id);
      } else {
        setLifecycleStage('TX_REVERTED');
        setTxError('Transaction was reverted (status: 0x0).');
      }
    } catch (err: unknown) {
      const e = err as WalletError;
      setLifecycleStage('ERROR');
      if (e.code === 4001) {
        setTxError('User rejected the transaction in wallet.');
      } else {
        setTxError(e.message || 'Transaction submission failed.');
      }
    }
  };

  return (
    <div
      id="modal-job-review"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(4, 9, 20, 0.85)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: '20px',
        overflowY: 'auto',
      }}
    >
      <div
        className="glass-card"
        style={{
          width: '100%',
          maxWidth: '780px',
          maxHeight: '90vh',
          overflowY: 'auto',
          backgroundColor: '#070B19',
          border: '1px solid rgba(0, 240, 255, 0.3)',
          boxShadow: '0 16px 48px rgba(0, 0, 0, 0.8)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <h3 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#FFFFFF', margin: 0 }}>
              Review Proposal & Sign Escrow
            </h3>
            <div style={{ fontSize: '0.8rem', color: '#94A3B8', marginTop: '4px' }}>
              Step 2 of 2: Transaction Boundary Verification
            </div>
          </div>
          <button
            id="btn-close-modal"
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#94A3B8',
              fontSize: '1.4rem',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Lifecycle Stage Indicator */}
        <div
          id="lifecycle-stage-indicator"
          style={{
            padding: '10px 16px',
            borderRadius: '8px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor:
              lifecycleStage === 'TX_CONFIRMED'
                ? 'rgba(16, 185, 129, 0.15)'
                : lifecycleStage === 'ERROR' || lifecycleStage === 'TX_REVERTED'
                ? 'rgba(239, 68, 68, 0.15)'
                : 'rgba(0, 240, 255, 0.08)',
            border:
              lifecycleStage === 'TX_CONFIRMED'
                ? '1px solid rgba(16, 185, 129, 0.4)'
                : lifecycleStage === 'ERROR' || lifecycleStage === 'TX_REVERTED'
                ? '1px solid rgba(239, 68, 68, 0.4)'
                : '1px solid rgba(0, 240, 255, 0.25)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.1rem' }}>
              {lifecycleStage === 'TX_CONFIRMED' ? '✅' : lifecycleStage === 'ERROR' ? '❌' : '📋'}
            </span>
            <span style={{ fontWeight: 600, fontSize: '0.88rem', color: '#FFFFFF' }}>
              Status: {lifecycleStage.replace('_', ' ')}
            </span>
          </div>
          <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>
            {lifecycleStage === 'PREPARED_UNSUBMITTED' && 'Not yet broadcast to blockchain'}
            {lifecycleStage === 'SIGNING' && 'Awaiting wallet authorization...'}
            {lifecycleStage === 'TX_PENDING' && 'Transaction pending confirmation...'}
            {lifecycleStage === 'TX_SIMULATED' && 'Transaction simulation verified locally (not broadcast on-chain)'}
            {lifecycleStage === 'TX_CONFIRMED' && 'Transaction confirmed on Monad Testnet'}
          </span>
        </div>

        <AlertBanner
          type="info"
          message="Notice: Monad Testnet tokens hold no commercial or monetary value. Transaction signing remains strictly client-side inside your browser wallet."
        />

        {txError && (
          <AlertBanner
            type="error"
            title="Transaction Rejection or Error"
            message={txError}
            onDismiss={() => setTxError(null)}
          />
        )}

        {/* Parameters Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px', fontSize: '0.85rem' }}>
          <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <div style={{ color: '#94A3B8', fontSize: '0.75rem' }}>Job ID (bytes32)</div>
            <div id="review-job-id" style={{ fontFamily: 'monospace', color: '#00F0FF', wordBreak: 'break-all', marginTop: '2px' }}>
              {preparedJob.job_id}
            </div>
            {preparedJob.nonce !== null && (
              <div style={{ color: '#A78BFA', fontSize: '0.72rem', marginTop: '4px' }}>
                Nonce included: <strong>{preparedJob.nonce}</strong>
              </div>
            )}
          </div>

          <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <div style={{ color: '#94A3B8', fontSize: '0.75rem' }}>Task Hash (bytes32)</div>
            <div id="review-task-hash" style={{ fontFamily: 'monospace', color: '#FFFFFF', wordBreak: 'break-all', marginTop: '2px' }}>
              {preparedJob.task_hash}
            </div>
          </div>

          <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <div style={{ color: '#94A3B8', fontSize: '0.75rem' }}>Counterparties</div>
            <div style={{ color: '#FFFFFF', marginTop: '2px' }}>
              Client Agent ID: <strong style={{ color: '#00F0FF' }}>{preparedJob.client_agent_id}</strong> → Provider Agent ID: <strong style={{ color: '#A78BFA' }}>{preparedJob.provider_agent_id}</strong>
            </div>
            <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '4px' }}>
              Pre-flight Identity: {preparedJob.preflight_identity_verified === true ? (
                <span style={{ color: '#10B981' }}>✓ Verified On-Chain</span>
              ) : preparedJob.preflight_identity_verified === false ? (
                <span style={{ color: '#EF4444' }}>✕ Agent Nonexistent</span>
              ) : (
                <span style={{ color: '#FBBF24' }}>⚠️ Skipped (RPC Outage)</span>
              )}
            </div>
          </div>

          <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <div style={{ color: '#94A3B8', fontSize: '0.75rem' }}>Authoritative Reward & Fee</div>
            <div style={{ color: '#FFFFFF', marginTop: '2px' }}>
              <strong>{preparedJob.reward_amount_mon} MON</strong> ({preparedJob.reward_amount_wei} wei)
            </div>
            <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '4px' }}>
              Validator Fee: {bpsToPercent(preparedJob.validator_fee_bps)} ({preparedJob.validator_fee_bps} bps)
            </div>
          </div>

          <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <div style={{ color: '#94A3B8', fontSize: '0.75rem' }}>Validation Requirements</div>
            <div style={{ color: '#FFFFFF', marginTop: '2px' }}>
              Validator: {truncateAddress(preparedJob.validator_address)}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '4px' }}>
              Min Passing Score: <strong>{preparedJob.min_acceptance_score}/100</strong>
            </div>
          </div>

          <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <div style={{ color: '#94A3B8', fontSize: '0.75rem' }}>Target Escrow Contract</div>
            <div id="review-contract-address" style={{ fontFamily: 'monospace', color: isContractConfigured ? '#10B981' : '#F87171', marginTop: '2px' }}>
              {preparedJob.escrow_contract_address || 'UNCONFIGURED (Disabled)'}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '4px' }}>
              Target Network: Monad Testnet ({MONAD_TESTNET_CHAIN_ID})
            </div>
          </div>
        </div>

        {/* Deadlines Section */}
        <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)', marginBottom: '16px', fontSize: '0.8rem' }}>
          <div style={{ fontWeight: 600, color: '#CBD5E1', marginBottom: '6px' }}>Enforced Deadlines:</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
            <div>
              <span style={{ color: '#94A3B8' }}>Accept:</span> {formatTimestamp(preparedJob.acceptance_deadline)}
            </div>
            <div>
              <span style={{ color: '#94A3B8' }}>Submit:</span> {formatTimestamp(preparedJob.submission_deadline)}
            </div>
            <div>
              <span style={{ color: '#94A3B8' }}>Validate:</span> {formatTimestamp(preparedJob.validation_deadline)}
            </div>
          </div>
        </div>

        {/* AI Prehire Trust Assessment (Advisory Badge) */}
        {preparedJob.prehire_trust_summary && (
          <div
            id="advisory-trust-assessment"
            style={{
              padding: '12px 16px',
              borderRadius: '8px',
              backgroundColor: 'rgba(139, 92, 246, 0.08)',
              border: '1px solid rgba(139, 92, 246, 0.25)',
              marginBottom: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.9rem' }}>🤖</span>
                <span style={{ fontWeight: 600, color: '#A78BFA', fontSize: '0.85rem' }}>
                  AI Trust Engine Assessment
                </span>
              </div>
              <span
                style={{
                  fontSize: '0.65rem',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  backgroundColor: 'rgba(139, 92, 246, 0.2)',
                  color: '#C4B5FD',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                }}
              >
                Advisory Only
              </span>
            </div>
            <div style={{ display: 'flex', gap: '16px', fontSize: '0.8rem', color: '#E2E8F0' }}>
              <div>Global Trust: <strong>{preparedJob.prehire_trust_summary.global_trust}/100</strong></div>
              <div>Risk Score: <strong>{preparedJob.prehire_trust_summary.risk}/100</strong></div>
              <div>Task Fit: <strong>{preparedJob.prehire_trust_summary.task_fit}/100</strong></div>
              <div>Recommendation: <strong>{preparedJob.prehire_trust_summary.recommendation}</strong></div>
            </div>
          </div>
        )}

        {/* User Confirmation Checkbox */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', color: '#CBD5E1', cursor: 'pointer' }}>
            <input
              id="checkbox-confirm-review"
              type="checkbox"
              checked={confirmedByUser}
              onChange={(e) => setConfirmedByUser(e.target.checked)}
              disabled={lifecycleStage === 'SIGNING' || lifecycleStage === 'TX_PENDING' || lifecycleStage === 'TX_CONFIRMED'}
              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
            />
            <span>
              I have reviewed all specifications and confirm locking testnet MON under the on-chain AegisHiringEscrow rules.
            </span>
          </label>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div>
            {onReprepareWithNewNonce && lifecycleStage === 'PREPARED_UNSUBMITTED' && (
              <button
                id="btn-reprepare-nonce"
                type="button"
                onClick={onReprepareWithNewNonce}
                style={{
                  padding: '8px 14px',
                  borderRadius: '6px',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  color: '#CBD5E1',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                }}
              >
                🔄 Re-generate Nonce
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              id="btn-cancel-modal"
              type="button"
              onClick={onClose}
              className="btn-outline"
              disabled={lifecycleStage === 'SIGNING' || lifecycleStage === 'TX_PENDING'}
              style={{ padding: '10px 18px', fontSize: '0.88rem' }}
            >
              Cancel / Edit
            </button>

            {walletState.status !== 'CONNECTED' ? (
              <button
                id="btn-modal-connect-wallet"
                type="button"
                disabled
                className="btn-primary"
                style={{ opacity: 0.5, cursor: 'not-allowed', padding: '10px 20px', fontSize: '0.88rem' }}
              >
                Connect Wallet First
              </button>
            ) : !walletState.isMonadTestnet ? (
              <button
                id="btn-modal-switch-network"
                type="button"
                onClick={switchNetwork}
                className="btn-primary"
                style={{ padding: '10px 20px', fontSize: '0.88rem', backgroundColor: '#F59E0B' }}
              >
                Switch to Monad ({MONAD_TESTNET_CHAIN_ID})
              </button>
            ) : (
              <button
                id="btn-sign-submit-tx"
                type="button"
                onClick={handleSignAndSubmit}
                disabled={
                  !confirmedByUser ||
                  !isContractConfigured ||
                  lifecycleStage === 'SIGNING' ||
                  lifecycleStage === 'TX_PENDING' ||
                  lifecycleStage === 'TX_SIMULATED' ||
                  lifecycleStage === 'TX_CONFIRMED'
                }
                className="btn-primary"
                style={{
                  padding: '10px 24px',
                  fontSize: '0.88rem',
                  opacity: !confirmedByUser || !isContractConfigured || lifecycleStage === 'TX_SIMULATED' || lifecycleStage === 'TX_CONFIRMED' ? 0.5 : 1,
                  cursor: !confirmedByUser || !isContractConfigured ? 'not-allowed' : 'pointer',
                }}
              >
                {lifecycleStage === 'SIGNING'
                  ? 'Requesting Signature...'
                  : lifecycleStage === 'TX_PENDING'
                  ? 'Confirming Transaction...'
                  : lifecycleStage === 'TX_SIMULATED'
                  ? '✓ Simulation Verified (0x1)'
                  : lifecycleStage === 'TX_CONFIRMED'
                  ? '✓ Transaction Confirmed'
                  : 'Sign & Submit (Simulation) →'}
              </button>
            )}
          </div>
        </div>

        {confirmedTxHash && (
          <div
            id="confirmed-tx-receipt-banner"
            style={{
              marginTop: '16px',
              padding: '12px 16px',
              borderRadius: '8px',
              backgroundColor: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              fontSize: '0.85rem',
              color: '#A7F3D0',
            }}
          >
            <div>
              <strong>Simulation Verified (Status: 0x1)</strong>
              <div style={{ marginTop: '2px', fontSize: '0.8rem', opacity: 0.9 }}>
                Mock transaction receipt validated locally. This transaction was NOT broadcast to Monad Testnet and does not exist on-chain.
              </div>
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: '0.78rem', marginTop: '6px' }}>
              Mock Tx Hash: {confirmedTxHash}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
