import React from 'react';

interface AlertBannerProps {
  type?: 'info' | 'warning' | 'error' | 'success';
  title?: string;
  message: string | React.ReactNode;
  onDismiss?: () => void;
  id?: string;
}

export const AlertBanner: React.FC<AlertBannerProps> = ({
  type = 'info',
  title,
  message,
  onDismiss,
  id,
}) => {
  const getStyles = () => {
    switch (type) {
      case 'warning':
        return {
          bg: 'rgba(245, 158, 11, 0.1)',
          border: 'rgba(245, 158, 11, 0.3)',
          text: '#FDE68A',
          iconColor: '#F59E0B',
          icon: '⚠️',
        };
      case 'error':
        return {
          bg: 'rgba(239, 68, 68, 0.1)',
          border: 'rgba(239, 68, 68, 0.3)',
          text: '#FECACA',
          iconColor: '#EF4444',
          icon: '🛑',
        };
      case 'success':
        return {
          bg: 'rgba(16, 185, 129, 0.1)',
          border: 'rgba(16, 185, 129, 0.3)',
          text: '#A7F3D0',
          iconColor: '#10B981',
          icon: '✅',
        };
      case 'info':
      default:
        return {
          bg: 'rgba(0, 240, 255, 0.08)',
          border: 'rgba(0, 240, 255, 0.25)',
          text: '#E0F2FE',
          iconColor: '#00F0FF',
          icon: 'ℹ️',
        };
    }
  };

  const s = getStyles();

  return (
    <div
      id={id || `alert-${type}`}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        padding: '12px 16px',
        borderRadius: '8px',
        backgroundColor: s.bg,
        border: `1px solid ${s.border}`,
        color: s.text,
        fontSize: '0.875rem',
        marginBottom: '16px',
        lineHeight: 1.4,
      }}
    >
      <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{s.icon}</span>
      <div style={{ flex: 1 }}>
        {title && <div style={{ fontWeight: 600, marginBottom: '2px' }}>{title}</div>}
        <div>{message}</div>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          type="button"
          style={{
            background: 'none',
            border: 'none',
            color: s.text,
            cursor: 'pointer',
            opacity: 0.7,
            padding: '2px',
            fontSize: '1rem',
            lineHeight: 1,
          }}
          aria-label="Dismiss alert"
        >
          ✕
        </button>
      )}
    </div>
  );
};
