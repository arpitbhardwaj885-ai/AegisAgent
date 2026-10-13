import React from 'react';
import { resolveJobStatus } from '../config/constants';

interface StatusBadgeProps {
  status?: string;
  statusCode?: number;
  isTerminal?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  statusCode,
  isTerminal,
}) => {
  const resolved = resolveJobStatus(statusCode, status);
  const upperStatus = resolved.statusName;
  const terminal = isTerminal ?? resolved.isTerminal;

  const getBadgeStyle = () => {
    switch (upperStatus) {
      case 'UNINITIALIZED':
        return {
          bg: 'rgba(100, 116, 139, 0.15)',
          border: 'rgba(100, 116, 139, 0.4)',
          text: '#94A3B8',
          label: 'Uninitialized',
        };
      case 'COMPLETED':
        return {
          bg: 'rgba(16, 185, 129, 0.15)',
          border: 'rgba(16, 185, 129, 0.4)',
          text: '#10B981',
          label: 'Completed (Settled)',
        };
      case 'REFUNDED':
        return {
          bg: 'rgba(239, 68, 68, 0.15)',
          border: 'rgba(239, 68, 68, 0.4)',
          text: '#F87171',
          label: 'Refunded (Settled)',
        };
      case 'CANCELLED':
      case 'REJECTED':
      case 'EXPIRED':
      case 'EXPIRED_UNSUBMITTED':
        return {
          bg: 'rgba(148, 163, 184, 0.15)',
          border: 'rgba(148, 163, 184, 0.4)',
          text: '#CBD5E1',
          label: `${upperStatus.replace('_', ' ')} (Settled)`,
        };
      case 'VALIDATING':
        return {
          bg: 'rgba(245, 158, 11, 0.15)',
          border: 'rgba(245, 158, 11, 0.4)',
          text: '#FBBF24',
          label: 'Validating',
        };
      case 'DISPUTED':
      case 'FAILED_VALIDATION':
        return {
          bg: 'rgba(239, 68, 68, 0.15)',
          border: 'rgba(239, 68, 68, 0.4)',
          text: '#F87171',
          label: upperStatus.replace('_', ' '),
        };
      case 'SUBMITTED':
        return {
          bg: 'rgba(59, 130, 246, 0.15)',
          border: 'rgba(59, 130, 246, 0.4)',
          text: '#60A5FA',
          label: 'Submitted',
        };
      case 'ACCEPTED':
        return {
          bg: 'rgba(139, 92, 246, 0.15)',
          border: 'rgba(139, 92, 246, 0.4)',
          text: '#A78BFA',
          label: 'Accepted',
        };
      case 'CREATED':
        return {
          bg: 'rgba(0, 240, 255, 0.15)',
          border: 'rgba(0, 240, 255, 0.4)',
          text: '#00F0FF',
          label: 'Created',
        };
      default:
        return {
          bg: 'rgba(239, 68, 68, 0.1)',
          border: 'rgba(239, 68, 68, 0.3)',
          text: '#F87171',
          label: resolved.statusCode !== undefined ? `Unknown (#${resolved.statusCode})` : `Unknown (${upperStatus})`,
        };
    }
  };

  const style = getBadgeStyle();

  return (
    <span
      id={`badge-status-${upperStatus.toLowerCase()}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        borderRadius: '9999px',
        fontSize: '0.75rem',
        fontWeight: 600,
        backgroundColor: style.bg,
        border: `1px solid ${style.border}`,
        color: style.text,
        letterSpacing: '0.025em',
        textTransform: 'uppercase',
      }}
    >
      <span
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          backgroundColor: style.text,
          display: 'inline-block',
        }}
      />
      {style.label}
      {statusCode !== undefined && (
        <span style={{ opacity: 0.6, fontSize: '0.7rem' }}>#{statusCode}</span>
      )}
      {terminal && (
        <span
          style={{
            fontSize: '0.65rem',
            padding: '1px 4px',
            borderRadius: '4px',
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            marginLeft: '2px',
          }}
        >
          Terminal
        </span>
      )}
    </span>
  );
};
