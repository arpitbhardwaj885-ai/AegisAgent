import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  JOB_STATUS_MAP,
  TERMINAL_STATUSES,
  resolveJobStatus,
} from '../config/constants';
import { StatusBadge } from '../components/StatusBadge';
import type { LifecycleStage } from '../types/escrow';

describe('Audit 2: Escrow Status Mapping (0 through 12)', () => {
  const EXPECTED_MAPPINGS: Record<number, { name: string; isTerminal: boolean }> = {
    0: { name: 'UNINITIALIZED', isTerminal: false },
    1: { name: 'CREATED', isTerminal: false },
    2: { name: 'ACCEPTED', isTerminal: false },
    3: { name: 'SUBMITTED', isTerminal: false },
    4: { name: 'VALIDATING', isTerminal: false },
    5: { name: 'COMPLETED', isTerminal: true },
    6: { name: 'REJECTED', isTerminal: true },
    7: { name: 'CANCELLED', isTerminal: true },
    8: { name: 'EXPIRED', isTerminal: true },
    9: { name: 'EXPIRED_UNSUBMITTED', isTerminal: true },
    10: { name: 'FAILED_VALIDATION', isTerminal: false },
    11: { name: 'DISPUTED', isTerminal: false },
    12: { name: 'REFUNDED', isTerminal: true },
  };

  it('contains exactly 13 status definitions from 0 to 12 matching Solidity enum', () => {
    expect(Object.keys(JOB_STATUS_MAP).length).toBe(13);
  });

  for (let code = 0; code <= 12; code++) {
    const expected = EXPECTED_MAPPINGS[code];
    it(`maps enum code ${code} to ${expected.name} (isTerminal: ${expected.isTerminal})`, () => {
      expect(JOB_STATUS_MAP[code]).toBe(expected.name);

      const resolved = resolveJobStatus(code);
      expect(resolved.statusName).toBe(expected.name);
      expect(resolved.statusCode).toBe(code);
      expect(resolved.isKnown).toBe(true);
      expect(resolved.isTerminal).toBe(expected.isTerminal);
    });
  }

  it('explicitly handles UNINITIALIZED (code 0)', () => {
    const resolvedCode0 = resolveJobStatus(0);
    expect(resolvedCode0.statusName).toBe('UNINITIALIZED');
    expect(resolvedCode0.isKnown).toBe(true);
    expect(resolvedCode0.isTerminal).toBe(false);

    const resolvedStr = resolveJobStatus(undefined, 'UNINITIALIZED');
    expect(resolvedStr.statusName).toBe('UNINITIALIZED');
    expect(resolvedStr.statusCode).toBe(0);
    expect(resolvedStr.isKnown).toBe(true);
    expect(resolvedStr.isTerminal).toBe(false);
  });

  it('matches all 6 terminal states with Solidity contract settled terminal paths', () => {
    const expectedTerminalNames = new Set([
      'COMPLETED',
      'REJECTED',
      'CANCELLED',
      'EXPIRED',
      'EXPIRED_UNSUBMITTED',
      'REFUNDED',
    ]);
    expect(TERMINAL_STATUSES).toEqual(expectedTerminalNames);
  });

  describe('Handling Unknown and Out-of-Bounds Status Codes', () => {
    it('returns unknown for future/unrecognized numeric codes (e.g. 13, 99, -1)', () => {
      const code13 = resolveJobStatus(13);
      expect(code13.isKnown).toBe(false);
      expect(code13.statusName).toBe('UNKNOWN');
      expect(code13.isTerminal).toBe(false);

      const code99 = resolveJobStatus(99);
      expect(code99.isKnown).toBe(false);
      expect(code99.statusName).toBe('UNKNOWN');

      const codeNegative = resolveJobStatus(-1);
      expect(codeNegative.isKnown).toBe(false);
      expect(codeNegative.statusName).toBe('UNKNOWN');
    });

    it('returns unknown for unrecognized status string names', () => {
      const invalid = resolveJobStatus(undefined, 'SOME_FUTURE_STATE');
      expect(invalid.isKnown).toBe(false);
      expect(invalid.statusName).toBe('SOME_FUTURE_STATE');
      expect(invalid.isTerminal).toBe(false);
    });
  });

  describe('Frontend Lifecycle vs On-Chain Status Separation', () => {
    it('proves frontend lifecycle stages are distinct from contract enum statuses', () => {
      const frontendStages: LifecycleStage[] = [
        'IDLE',
        'PREPARING',
        'PREPARED_UNSUBMITTED',
        'SIGNING',
        'TX_PENDING',
        'TX_SIMULATED',
        'TX_CONFIRMED',
        'TX_REVERTED',
        'ERROR',
      ];

      const contractStatuses = Object.values(JOB_STATUS_MAP);

      // Verify no UI state is mistaken for an on-chain status
      frontendStages.forEach((stage) => {
        const resolved = resolveJobStatus(undefined, stage);
        expect(resolved.isKnown).toBe(false);
      });

      // Verify on-chain statuses are not frontend stages
      contractStatuses.forEach((status) => {
        expect(frontendStages.includes(status as unknown as LifecycleStage)).toBe(false);
      });
    });
  });

  describe('StatusBadge Component Rendering', () => {
    it('renders explicit label for UNINITIALIZED', () => {
      render(<StatusBadge status="UNINITIALIZED" statusCode={0} />);
      expect(screen.getByText('Uninitialized')).toBeInTheDocument();
      expect(screen.getByText('#0')).toBeInTheDocument();
    });

    it('renders terminal pill tag only on terminal states', () => {
      const { unmount } = render(<StatusBadge status="COMPLETED" statusCode={5} />);
      expect(screen.getByText(/Terminal/i)).toBeInTheDocument();
      unmount();

      render(<StatusBadge status="ACCEPTED" statusCode={2} />);
      expect(screen.queryByText(/Terminal/i)).not.toBeInTheDocument();
    });

    it('renders cleanly for unknown status codes without crashing or misclassifying', () => {
      render(<StatusBadge statusCode={13} />);
      expect(screen.getByText('Unknown (#13)')).toBeInTheDocument();
    });
  });
});
