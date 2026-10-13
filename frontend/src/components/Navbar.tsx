import React from 'react';
import { useWallet } from '../context/useWallet';
import { truncateAddress } from '../utils/format';
import { MONAD_TESTNET_CHAIN_ID } from '../config/constants';

interface NavbarProps {
  activeTab: 'create' | 'lookup';
  onSelectTab: (tab: 'create' | 'lookup') => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, onSelectTab }) => {
  const { walletState, connectWallet, disconnectWallet, switchNetwork } = useWallet();
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    if (walletState.account) {
      navigator.clipboard.writeText(walletState.account);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        backgroundColor: 'rgba(4, 9, 20, 0.85)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        padding: '16px 24px',
      }}
    >
      <div
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #00F0FF 0%, #8B5CF6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 16px rgba(0, 240, 255, 0.4)',
            }}
          >
            <span style={{ fontSize: '1.2rem', fontWeight: 800, color: '#040914' }}>🛡️</span>
          </div>
          <div>
            <div
              style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                background: 'linear-gradient(90deg, #FFFFFF 0%, #00F0FF 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              AegisAgent
            </div>
            <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>
              Hiring Lifecycle & Escrow
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav style={{ display: 'flex', gap: '8px' }}>
          <button
            id="tab-create-job"
            type="button"
            onClick={() => onSelectTab('create')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: activeTab === 'create' ? '1px solid rgba(0, 240, 255, 0.4)' : '1px solid transparent',
              backgroundColor: activeTab === 'create' ? 'rgba(0, 240, 255, 0.1)' : 'transparent',
              color: activeTab === 'create' ? '#00F0FF' : '#94A3B8',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            Create Job Proposal
          </button>
          <button
            id="tab-lookup-job"
            type="button"
            onClick={() => onSelectTab('lookup')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: activeTab === 'lookup' ? '1px solid rgba(0, 240, 255, 0.4)' : '1px solid transparent',
              backgroundColor: activeTab === 'lookup' ? 'rgba(0, 240, 255, 0.1)' : 'transparent',
              color: activeTab === 'lookup' ? '#00F0FF' : '#94A3B8',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            Job Status Lookup
          </button>
        </nav>

        {/* Network & Wallet Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Network Badge */}
          {walletState.status === 'CONNECTED' ? (
            <div
              id="network-badge-monad"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '8px',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                fontSize: '0.75rem',
                color: '#10B981',
                fontWeight: 600,
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: '#10B981',
                  boxShadow: '0 0 6px #10B981',
                }}
              />
              Monad Testnet ({MONAD_TESTNET_CHAIN_ID})
            </div>
          ) : walletState.status === 'WRONG_NETWORK' ? (
            <button
              id="btn-switch-network"
              type="button"
              onClick={switchNetwork}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '8px',
                backgroundColor: 'rgba(245, 158, 11, 0.15)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                fontSize: '0.75rem',
                color: '#FBBF24',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              ⚠️ Switch to Monad ({MONAD_TESTNET_CHAIN_ID})
            </button>
          ) : null}

          {/* Wallet Button */}
          {walletState.status === 'CONNECTED' && walletState.account ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                id="btn-copy-address"
                type="button"
                onClick={handleCopy}
                title="Click to copy address"
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  backgroundColor: 'rgba(255, 255, 255, 0.04)',
                  color: '#FFFFFF',
                  fontFamily: 'monospace',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>{truncateAddress(walletState.account)}</span>
                <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>{copied ? '✓' : '📋'}</span>
              </button>
              <button
                id="btn-disconnect-wallet"
                type="button"
                onClick={disconnectWallet}
                style={{
                  padding: '8px 10px',
                  borderRadius: '8px',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  backgroundColor: 'rgba(239, 68, 68, 0.08)',
                  color: '#F87171',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              id="btn-connect-wallet"
              type="button"
              onClick={connectWallet}
              disabled={walletState.status === 'CONNECTING'}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                background: 'linear-gradient(135deg, #00F0FF 0%, #8B5CF6 100%)',
                color: '#040914',
                fontWeight: 700,
                fontSize: '0.875rem',
                cursor: 'pointer',
                boxShadow: '0 0 12px rgba(0, 240, 255, 0.3)',
                transition: 'all 0.2s',
                opacity: walletState.status === 'CONNECTING' ? 0.7 : 1,
              }}
            >
              {walletState.status === 'CONNECTING' ? 'Connecting...' : 'Connect Wallet'}
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
