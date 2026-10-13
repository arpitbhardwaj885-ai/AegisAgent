import React, { useState, useId } from 'react';
import { monToWei } from '../utils/units';
import { deriveJobId, isValidBytes32Hex } from '../utils/jobId';
import {
  isValidAddress,
  isNonZeroAddress,
  isValidAgentId,
  isValidFeeBps,
  isValidAcceptanceScore,
} from '../utils/validation';
import { prepareJob, EscrowApiError } from '../services/api';
import type { JobPrepareRequest, JobPrepareResponse } from '../types/escrow';
import { AlertBanner } from './AlertBanner';
import { bpsToPercent } from '../utils/format';

interface JobFormProps {
  onJobPrepared: (prepared: JobPrepareResponse) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

export const JobForm: React.FC<JobFormProps> = ({
  onJobPrepared,
  isLoading,
  setIsLoading,
}) => {
  // Generate unique IDs for all form fields
  const clientAgentIdInputId = useId();
  const providerAgentIdInputId = useId();
  const validatorAddressInputId = useId();
  const rewardMonInputId = useId();
  const validatorFeeBpsInputId = useId();
  const minAcceptanceScoreInputId = useId();
  const acceptDurationInputId = useId();
  const subDurationInputId = useId();
  const valDurationInputId = useId();
  const taskDescInputId = useId();
  const taskHashInputId = useId();
  const prehireHashInputId = useId();
  const arbiterOverrideInputId = useId();
  const nonceInputId = useId();
  const customJobIdInputId = useId();

  // Form field state
  const [clientAgentId, setClientAgentId] = useState<string>('1');
  const [providerAgentId, setProviderAgentId] = useState<string>('2');
  const [validatorAddress, setValidatorAddress] = useState<string>(
    '0x0674Bf234268358B5DcbD2c10cCBAFbef2AA7B1c'
  );
  const [rewardMon, setRewardMon] = useState<string>('1.0');
  const [validatorFeeBps, setValidatorFeeBps] = useState<number>(500);
  const [minAcceptanceScore, setMinAcceptanceScore] = useState<number>(75);

  // Relative deadline offsets in hours from submission
  const [acceptHours, setAcceptHours] = useState<number>(1);
  const [subHours, setSubHours] = useState<number>(2);
  const [valHours, setValHours] = useState<number>(3);

  // Task specification
  const [taskDescription, setTaskDescription] = useState<string>(
    'Smart contract audit deliverable for AegisAgent protocol.'
  );
  const [taskHash, setTaskHash] = useState<string>('');
  const [prehireSnapshotHash, setPrehireSnapshotHash] = useState<string>('');
  const [arbiterOverride, setArbiterOverride] = useState<string>('');

  // Uniqueness / Nonce mode
  const [idMode, setIdMode] = useState<'nonce' | 'custom'>('nonce');
  const [nonce, setNonce] = useState<number>(0);
  const [customJobId, setCustomJobId] = useState<string>('');

  // UI feedback state
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);

  // Live wei calculation & validation
  let computedWei = '';
  let weiError = '';
  try {
    computedWei = monToWei(rewardMon);
  } catch (err) {
    weiError = (err as Error).message;
  }

  const [baseTimestamp] = useState<number>(() => Math.floor(Date.now() / 1000));

  // Live estimated Job ID preview
  let previewJobId = '';
  try {
    const mockAcceptDeadline = baseTimestamp + acceptHours * 3600;
    const cleanTaskHash = taskHash.trim() || '0x' + 'bb'.repeat(32);
    if (isValidBytes32Hex(cleanTaskHash)) {
      if (idMode === 'nonce') {
        previewJobId = deriveJobId(
          parseInt(clientAgentId) || 1,
          parseInt(providerAgentId) || 2,
          cleanTaskHash,
          mockAcceptDeadline,
          nonce
        );
      } else if (isValidBytes32Hex(customJobId.trim())) {
        previewJobId = customJobId.trim().toLowerCase();
      }
    }
  } catch {
    // Ignore preview derivation errors
  }

  const handleRandomizeNonce = () => {
    const randomNonce = Math.floor(Math.random() * 1000000);
    setNonce(randomNonce);
  };

  const handleIncrementNonce = () => {
    setNonce((n) => n + 1);
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!isValidAgentId(clientAgentId)) {
      errors.clientAgentId = 'Client Agent ID must be a positive integer.';
    }
    if (!isValidAgentId(providerAgentId)) {
      errors.providerAgentId = 'Provider Agent ID must be a positive integer.';
    }
    if (clientAgentId && providerAgentId && clientAgentId === providerAgentId) {
      errors.providerAgentId = 'Client agent cannot hire self (must be distinct IDs).';
    }

    if (!isValidAddress(validatorAddress)) {
      errors.validatorAddress = 'Validator address must be a valid 40-character hex address.';
    } else if (!isNonZeroAddress(validatorAddress)) {
      errors.validatorAddress = 'Validator cannot be the zero address.';
    }

    if (weiError) {
      errors.rewardMon = weiError;
    } else if (computedWei === '0') {
      errors.rewardMon = 'Reward amount must be greater than 0.';
    }

    if (!isValidFeeBps(validatorFeeBps)) {
      errors.validatorFeeBps = 'Validator fee must be between 0 and 5000 bps (0% - 50%).';
    }

    if (!isValidAcceptanceScore(minAcceptanceScore)) {
      errors.minAcceptanceScore = 'Minimum acceptance score must be between 1 and 100.';
    }

    if (acceptHours <= 0) {
      errors.deadlines = 'Acceptance deadline must be at least 1 hour in the future.';
    } else if (subHours <= acceptHours) {
      errors.deadlines = 'Submission deadline must follow acceptance deadline.';
    } else if (valHours <= subHours) {
      errors.deadlines = 'Validation deadline must follow submission deadline.';
    }

    if (!taskDescription.trim() && !taskHash.trim()) {
      errors.task = 'Either task description or a pre-computed 32-byte task hash must be provided.';
    }

    if (taskHash.trim() && !isValidBytes32Hex(taskHash.trim())) {
      errors.taskHash = 'Task hash must be a 32-byte hex string (0x + 64 hex characters).';
    }

    if (prehireSnapshotHash.trim() && !isValidBytes32Hex(prehireSnapshotHash.trim())) {
      errors.prehireSnapshotHash = 'Pre-hire snapshot hash must be 32-byte hex (0x + 64 hex characters).';
    }

    if (arbiterOverride.trim() && !isValidAddress(arbiterOverride.trim())) {
      errors.arbiterOverride = 'Arbiter override must be a valid address or left blank.';
    }

    if (idMode === 'custom') {
      if (!isValidBytes32Hex(customJobId.trim())) {
        errors.customJobId = 'Custom Job ID must be a valid 32-byte hex string (0x + 64 hex characters).';
      }
    } else {
      if (typeof nonce !== 'number' || isNaN(nonce) || nonce < 0) {
        errors.nonce = 'Nonce must be a non-negative integer (>= 0).';
      }
    }

    setClientErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      const now = Math.floor(Date.now() / 1000);
      const acceptanceDeadline = now + acceptHours * 3600;
      const submissionDeadline = now + subHours * 3600;
      const validationDeadline = now + valHours * 3600;

      // Construct preparation payload
      const payload: JobPrepareRequest = {
        client_agent_id: parseInt(clientAgentId, 10),
        provider_agent_id: parseInt(providerAgentId, 10),
        validator_address: validatorAddress.trim(),
        reward_amount_wei: computedWei,
        validator_fee_bps: validatorFeeBps,
        min_acceptance_score: minAcceptanceScore,
        acceptance_deadline: acceptanceDeadline,
        submission_deadline: submissionDeadline,
        validation_deadline: validationDeadline,
        task_description: taskDescription.trim() || undefined,
        task_hash: taskHash.trim() || undefined,
        prehire_trust_snapshot_hash: prehireSnapshotHash.trim() || undefined,
        arbiter_override: arbiterOverride.trim() || undefined,
        nonce: idMode === 'nonce' ? nonce : undefined,
        job_id: idMode === 'custom' ? customJobId.trim().toLowerCase() : undefined,
      };

      const prepared = await prepareJob(payload);
      onJobPrepared(prepared);
    } catch (err) {
      if (err instanceof EscrowApiError) {
        setApiError(`Backend [${err.code}]: ${err.message}`);
      } else {
        setApiError((err as Error).message || 'Failed to prepare job');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form id="form-create-job" onSubmit={handleSubmit} className="glass-card" style={{ maxWidth: '840px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#FFFFFF', marginBottom: '8px' }}>
          Create Agent Hiring Proposal
        </h2>
        <p style={{ color: '#94A3B8', fontSize: '0.9rem' }}>
          Configure escrow terms, validator requirements, and deliverable deadlines. The AegisAgent backend prepares the deterministic on-chain transaction parameters.
        </p>
      </div>

      <AlertBanner
        type="info"
        message="Notice: All transactions occur in Monad Testnet native tokens (MON) with zero real monetary value. Transaction signing is performed exclusively inside your connected wallet."
      />

      {apiError && (
        <AlertBanner
          type="error"
          title="Preparation Error"
          message={apiError}
          onDismiss={() => setApiError(null)}
        />
      )}

      {/* Grid: Counterparty Agent IDs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
        <div>
          <label htmlFor={clientAgentIdInputId} style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#CBD5E1', marginBottom: '6px' }}>
            Client Agent ID *
          </label>
          <input
            id={clientAgentIdInputId}
            type="number"
            min="1"
            value={clientAgentId}
            onChange={(e) => setClientAgentId(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: '8px',
              border: clientErrors.clientAgentId ? '1px solid #EF4444' : '1px solid rgba(255, 255, 255, 0.12)',
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              color: '#FFFFFF',
              fontSize: '0.95rem',
            }}
          />
          {clientErrors.clientAgentId && (
            <div style={{ color: '#F87171', fontSize: '0.78rem', marginTop: '4px' }}>{clientErrors.clientAgentId}</div>
          )}
        </div>

        <div>
          <label htmlFor={providerAgentIdInputId} style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#CBD5E1', marginBottom: '6px' }}>
            Provider Agent ID *
          </label>
          <input
            id={providerAgentIdInputId}
            type="number"
            min="1"
            value={providerAgentId}
            onChange={(e) => setProviderAgentId(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: '8px',
              border: clientErrors.providerAgentId ? '1px solid #EF4444' : '1px solid rgba(255, 255, 255, 0.12)',
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              color: '#FFFFFF',
              fontSize: '0.95rem',
            }}
          />
          {clientErrors.providerAgentId && (
            <div style={{ color: '#F87171', fontSize: '0.78rem', marginTop: '4px' }}>{clientErrors.providerAgentId}</div>
          )}
        </div>
      </div>

      {/* Validator Address */}
      <div style={{ marginBottom: '20px' }}>
        <label htmlFor={validatorAddressInputId} style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#CBD5E1', marginBottom: '6px' }}>
          Designated Validator Address *
        </label>
        <input
          id={validatorAddressInputId}
          type="text"
          value={validatorAddress}
          onChange={(e) => setValidatorAddress(e.target.value)}
          placeholder="0x..."
          style={{
            width: '100%',
            padding: '10px 14px',
            borderRadius: '8px',
            border: clientErrors.validatorAddress ? '1px solid #EF4444' : '1px solid rgba(255, 255, 255, 0.12)',
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            color: '#FFFFFF',
            fontFamily: 'monospace',
            fontSize: '0.9rem',
          }}
        />
        {clientErrors.validatorAddress && (
          <div style={{ color: '#F87171', fontSize: '0.78rem', marginTop: '4px' }}>{clientErrors.validatorAddress}</div>
        )}
      </div>

      {/* Reward and Fees */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '20px', marginBottom: '20px' }}>
        <div>
          <label htmlFor={rewardMonInputId} style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#CBD5E1', marginBottom: '6px' }}>
            Reward Amount (MON) *
          </label>
          <input
            id={rewardMonInputId}
            type="text"
            value={rewardMon}
            onChange={(e) => setRewardMon(e.target.value)}
            placeholder="1.0"
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: '8px',
              border: clientErrors.rewardMon ? '1px solid #EF4444' : '1px solid rgba(255, 255, 255, 0.12)',
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              color: '#FFFFFF',
              fontSize: '0.95rem',
            }}
          />
          <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '4px', wordBreak: 'break-all' }}>
            Exact wei: <span style={{ fontFamily: 'monospace', color: '#00F0FF' }}>{computedWei || '0'}</span>
          </div>
          {clientErrors.rewardMon && (
            <div style={{ color: '#F87171', fontSize: '0.78rem', marginTop: '4px' }}>{clientErrors.rewardMon}</div>
          )}
        </div>

        <div>
          <label htmlFor={validatorFeeBpsInputId} style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#CBD5E1', marginBottom: '6px' }}>
            Validator Fee (bps) *
          </label>
          <input
            id={validatorFeeBpsInputId}
            type="number"
            min="0"
            max="5000"
            step="50"
            value={validatorFeeBps}
            onChange={(e) => setValidatorFeeBps(parseInt(e.target.value, 10) || 0)}
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: '8px',
              border: clientErrors.validatorFeeBps ? '1px solid #EF4444' : '1px solid rgba(255, 255, 255, 0.12)',
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              color: '#FFFFFF',
              fontSize: '0.95rem',
            }}
          />
          <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '4px' }}>
            Rate: <span style={{ color: '#10B981', fontWeight: 600 }}>{bpsToPercent(validatorFeeBps)}</span> (max 50%)
          </div>
        </div>

        <div>
          <label htmlFor={minAcceptanceScoreInputId} style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#CBD5E1', marginBottom: '6px' }}>
            Min Score (1-100) *
          </label>
          <input
            id={minAcceptanceScoreInputId}
            type="number"
            min="1"
            max="100"
            value={minAcceptanceScore}
            onChange={(e) => setMinAcceptanceScore(parseInt(e.target.value, 10) || 70)}
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: '8px',
              border: clientErrors.minAcceptanceScore ? '1px solid #EF4444' : '1px solid rgba(255, 255, 255, 0.12)',
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              color: '#FFFFFF',
              fontSize: '0.95rem',
            }}
          />
          <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '4px' }}>
            Required for COMPLETED
          </div>
        </div>
      </div>

      {/* Deadlines Section */}
      <div style={{ marginBottom: '20px', padding: '16px', borderRadius: '12px', backgroundColor: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#FFFFFF', marginBottom: '12px' }}>
          Chronological Lifecycle Deadlines (Relative Hours from Creation)
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
          <div>
            <label htmlFor={acceptDurationInputId} style={{ display: 'block', fontSize: '0.8rem', color: '#CBD5E1', marginBottom: '4px' }}>
              1. Acceptance Deadline (+hours)
            </label>
            <input
              id={acceptDurationInputId}
              type="number"
              min="1"
              value={acceptHours}
              onChange={(e) => setAcceptHours(parseInt(e.target.value, 10) || 1)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                backgroundColor: 'rgba(0, 0, 0, 0.25)',
                color: '#FFFFFF',
              }}
            />
          </div>
          <div>
            <label htmlFor={subDurationInputId} style={{ display: 'block', fontSize: '0.8rem', color: '#CBD5E1', marginBottom: '4px' }}>
              2. Submission Deadline (+hours)
            </label>
            <input
              id={subDurationInputId}
              type="number"
              min={acceptHours + 1}
              value={subHours}
              onChange={(e) => setSubHours(parseInt(e.target.value, 10) || acceptHours + 1)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                backgroundColor: 'rgba(0, 0, 0, 0.25)',
                color: '#FFFFFF',
              }}
            />
          </div>
          <div>
            <label htmlFor={valDurationInputId} style={{ display: 'block', fontSize: '0.8rem', color: '#CBD5E1', marginBottom: '4px' }}>
              3. Validation Deadline (+hours)
            </label>
            <input
              id={valDurationInputId}
              type="number"
              min={subHours + 1}
              value={valHours}
              onChange={(e) => setValHours(parseInt(e.target.value, 10) || subHours + 1)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                backgroundColor: 'rgba(0, 0, 0, 0.25)',
                color: '#FFFFFF',
              }}
            />
          </div>
        </div>
        {clientErrors.deadlines && (
          <div style={{ color: '#F87171', fontSize: '0.8rem', marginTop: '8px' }}>{clientErrors.deadlines}</div>
        )}
      </div>

      {/* Task Specification */}
      <div style={{ marginBottom: '20px' }}>
        <label htmlFor={taskDescInputId} style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#CBD5E1', marginBottom: '6px' }}>
          Task Description
        </label>
        <textarea
          id={taskDescInputId}
          rows={3}
          value={taskDescription}
          onChange={(e) => setTaskDescription(e.target.value)}
          placeholder="Detailed task instructions. Used to compute canonical task_hash..."
          style={{
            width: '100%',
            padding: '10px 14px',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            color: '#FFFFFF',
            fontSize: '0.9rem',
          }}
        />
        {clientErrors.task && (
          <div style={{ color: '#F87171', fontSize: '0.78rem', marginTop: '4px' }}>{clientErrors.task}</div>
        )}
      </div>

      {/* Optional Hashes (Task Hash, Prehire Trust Hash, Arbiter Override) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
        <div>
          <label htmlFor={taskHashInputId} style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#CBD5E1', marginBottom: '6px' }}>
            Pre-computed Task Hash (Optional 32-byte hex)
          </label>
          <input
            id={taskHashInputId}
            type="text"
            value={taskHash}
            onChange={(e) => setTaskHash(e.target.value)}
            placeholder="0x..."
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: '8px',
              border: clientErrors.taskHash ? '1px solid #EF4444' : '1px solid rgba(255, 255, 255, 0.12)',
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              color: '#FFFFFF',
              fontFamily: 'monospace',
              fontSize: '0.85rem',
            }}
          />
        </div>

        <div>
          <label htmlFor={prehireHashInputId} style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#CBD5E1', marginBottom: '6px' }}>
            Pre-hire Trust Snapshot Hash (Optional)
          </label>
          <input
            id={prehireHashInputId}
            type="text"
            value={prehireSnapshotHash}
            onChange={(e) => setPrehireSnapshotHash(e.target.value)}
            placeholder="Auto-computed by backend if empty"
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: '8px',
              border: clientErrors.prehireSnapshotHash ? '1px solid #EF4444' : '1px solid rgba(255, 255, 255, 0.12)',
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              color: '#FFFFFF',
              fontFamily: 'monospace',
              fontSize: '0.85rem',
            }}
          />
        </div>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <label htmlFor={arbiterOverrideInputId} style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#CBD5E1', marginBottom: '6px' }}>
          Designated Arbiter Override (Optional)
        </label>
        <input
          id={arbiterOverrideInputId}
          type="text"
          value={arbiterOverride}
          onChange={(e) => setArbiterOverride(e.target.value)}
          placeholder="0x... (defaults to zero address for standard fallback)"
          style={{
            width: '100%',
            padding: '10px 14px',
            borderRadius: '8px',
            border: clientErrors.arbiterOverride ? '1px solid #EF4444' : '1px solid rgba(255, 255, 255, 0.12)',
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            color: '#FFFFFF',
            fontFamily: 'monospace',
            fontSize: '0.85rem',
          }}
        />
      </div>

      {/* Job ID Uniqueness Mode (Requirement 5) */}
      <div style={{ marginBottom: '24px', padding: '16px', borderRadius: '12px', backgroundColor: 'rgba(0, 240, 255, 0.03)', border: '1px solid rgba(0, 240, 255, 0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ fontWeight: 600, color: '#00F0FF', fontSize: '0.9rem' }}>
            Job ID Collision Protection & Uniqueness (AUDIT-04)
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              id="btn-mode-nonce"
              type="button"
              onClick={() => setIdMode('nonce')}
              style={{
                padding: '4px 10px',
                borderRadius: '6px',
                border: idMode === 'nonce' ? '1px solid #00F0FF' : '1px solid rgba(255, 255, 255, 0.1)',
                backgroundColor: idMode === 'nonce' ? 'rgba(0, 240, 255, 0.2)' : 'transparent',
                color: idMode === 'nonce' ? '#00F0FF' : '#94A3B8',
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              Nonce-Based
            </button>
            <button
              id="btn-mode-custom"
              type="button"
              onClick={() => setIdMode('custom')}
              style={{
                padding: '4px 10px',
                borderRadius: '6px',
                border: idMode === 'custom' ? '1px solid #00F0FF' : '1px solid rgba(255, 255, 255, 0.1)',
                backgroundColor: idMode === 'custom' ? 'rgba(0, 240, 255, 0.2)' : 'transparent',
                color: idMode === 'custom' ? '#00F0FF' : '#94A3B8',
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              Custom Bytes32
            </button>
          </div>
        </div>

        {idMode === 'nonce' ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <label htmlFor={nonceInputId} style={{ fontSize: '0.85rem', color: '#CBD5E1', flexShrink: 0 }}>
                Caller Nonce:
              </label>
              <input
                id={nonceInputId}
                type="number"
                min="0"
                value={nonce}
                onChange={(e) => setNonce(parseInt(e.target.value, 10) || 0)}
                style={{
                  width: '120px',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  backgroundColor: 'rgba(0, 0, 0, 0.3)',
                  color: '#FFFFFF',
                  fontFamily: 'monospace',
                }}
              />
              <button
                id="btn-regenerate-nonce"
                type="button"
                onClick={handleRandomizeNonce}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid rgba(0, 240, 255, 0.3)',
                  backgroundColor: 'rgba(0, 240, 255, 0.1)',
                  color: '#00F0FF',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                }}
              >
                🎲 Randomize Nonce
              </button>
              <button
                id="btn-increment-nonce"
                type="button"
                onClick={handleIncrementNonce}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  color: '#FFFFFF',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                }}
              >
                ➕ +1
              </button>
            </div>
            <div style={{ fontSize: '0.78rem', color: '#94A3B8' }}>
              Ensures that repeated jobs with the same counterparty and deadlines receive unique on-chain IDs without altering the contract interface.
            </div>
          </div>
        ) : (
          <div>
            <label htmlFor={customJobIdInputId} style={{ display: 'block', fontSize: '0.85rem', color: '#CBD5E1', marginBottom: '4px' }}>
              Explicit 32-Byte Hex Job ID
            </label>
            <input
              id={customJobIdInputId}
              type="text"
              value={customJobId}
              onChange={(e) => setCustomJobId(e.target.value)}
              placeholder="0x..."
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: clientErrors.customJobId ? '1px solid #EF4444' : '1px solid rgba(255, 255, 255, 0.15)',
                backgroundColor: 'rgba(0, 0, 0, 0.3)',
                color: '#FFFFFF',
                fontFamily: 'monospace',
                fontSize: '0.85rem',
              }}
            />
            {clientErrors.customJobId && (
              <div style={{ color: '#F87171', fontSize: '0.78rem', marginTop: '4px' }}>{clientErrors.customJobId}</div>
            )}
          </div>
        )}

        {previewJobId && (
          <div style={{ marginTop: '10px', fontSize: '0.75rem', color: '#94A3B8', wordBreak: 'break-all' }}>
            Derived ID Preview: <span style={{ fontFamily: 'monospace', color: '#A78BFA' }}>{previewJobId}</span>
          </div>
        )}
      </div>

      {/* Submit Button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
        <button
          id="btn-prepare-job"
          type="submit"
          disabled={isLoading}
          className="btn-primary"
          style={{
            minWidth: '220px',
            opacity: isLoading ? 0.7 : 1,
            cursor: isLoading ? 'not-allowed' : 'pointer',
          }}
        >
          {isLoading ? 'Preparing Parameters...' : 'Prepare Job Parameters →'}
        </button>
      </div>
    </form>
  );
};
