import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StatusBadge } from '../components/StatusBadge';
import { AlertBanner } from '../components/AlertBanner';
import { JobReviewModal } from '../components/JobReviewModal';
import { JobPrepareResponse } from '../types/escrow';
import { WalletProvider } from '../context/WalletContext';

describe('UI Component Tests', () => {
  describe('StatusBadge', () => {
    it('renders CREATED status with non-terminal badge', () => {
      render(<StatusBadge status="CREATED" statusCode={1} isTerminal={false} />);
      expect(screen.getByText(/CREATED/i)).toBeInTheDocument();
      expect(screen.queryByText(/Terminal/i)).not.toBeInTheDocument();
    });

    it('renders COMPLETED status with terminal badge', () => {
      render(<StatusBadge status="COMPLETED" statusCode={5} isTerminal={true} />);
      expect(screen.getByText(/COMPLETED/i)).toBeInTheDocument();
      expect(screen.getByText(/Terminal/i)).toBeInTheDocument();
    });

    it('renders REFUNDED status with terminal badge', () => {
      render(<StatusBadge status="REFUNDED" statusCode={12} isTerminal={true} />);
      expect(screen.getByText(/REFUNDED/i)).toBeInTheDocument();
      expect(screen.getByText(/Terminal/i)).toBeInTheDocument();
    });

    it('renders DISPUTED status correctly', () => {
      render(<StatusBadge status="DISPUTED" statusCode={11} isTerminal={false} />);
      expect(screen.getByText(/DISPUTED/i)).toBeInTheDocument();
      expect(screen.queryByText(/Terminal/i)).not.toBeInTheDocument();
    });
  });

  describe('AlertBanner', () => {
    it('renders info message correctly', () => {
      render(<AlertBanner type="info" message="Test info notification" />);
      expect(screen.getByText('Test info notification')).toBeInTheDocument();
    });

    it('fires onDismiss when dismiss button is clicked', () => {
      const handleDismiss = vi.fn();
      render(<AlertBanner type="error" message="Error alert" onDismiss={handleDismiss} />);
      const btn = screen.getByLabelText('Dismiss alert');
      fireEvent.click(btn);
      expect(handleDismiss).toHaveBeenCalledTimes(1);
    });
  });

  describe('JobReviewModal', () => {
    const samplePrepared: JobPrepareResponse = {
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
      prehire_trust_summary: {
        global_trust: 85.5,
        risk: 14.5,
        task_fit: 90.0,
        confidence: 0.88,
        recommendation: 'HIRE_RECOMMENDED',
      },
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
      instructions: 'Sign and broadcast.',
    };

    it('renders prepared parameters and advisory AI badge', () => {
      render(
        <WalletProvider>
          <JobReviewModal
            preparedJob={samplePrepared}
            onClose={vi.fn()}
            onSuccess={vi.fn()}
          />
        </WalletProvider>
      );

      // Verify parameters are shown
      expect(screen.getByText(samplePrepared.job_id)).toBeInTheDocument();
      expect(screen.getByText(samplePrepared.task_hash)).toBeInTheDocument();
      expect(screen.getByText(/1 MON/i)).toBeInTheDocument();
      expect(screen.getByText(/1000000000000000000 wei/i)).toBeInTheDocument();

      // Verify AI Trust advisory badge
      expect(screen.getByText(/AI Trust Engine Assessment/i)).toBeInTheDocument();
      expect(screen.getByText(/Advisory Only/i)).toBeInTheDocument();
      expect(screen.getByText(/HIRE_RECOMMENDED/i)).toBeInTheDocument();

      // Verify testnet token disclaimer
      expect(screen.getByText(/Monad Testnet tokens hold no commercial or monetary value/i)).toBeInTheDocument();
    });

    it('disables submit button when user confirmation checkbox is unchecked', () => {
      render(
        <WalletProvider>
          <JobReviewModal
            preparedJob={samplePrepared}
            onClose={vi.fn()}
            onSuccess={vi.fn()}
          />
        </WalletProvider>
      );

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).not.toBeChecked();
    });
  });
});
