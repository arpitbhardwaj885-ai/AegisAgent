import { useState } from 'react';
import { WalletProvider } from './context/WalletContext';
import { Navbar } from './components/Navbar';
import { JobForm } from './components/JobForm';
import { JobReviewModal } from './components/JobReviewModal';
import { JobStatusLookup } from './components/JobStatusLookup';
import type { JobPrepareResponse } from './types/escrow';
import { AlertBanner } from './components/AlertBanner';

function HiringApp() {
  const [activeTab, setActiveTab] = useState<'create' | 'lookup'>('create');
  const [preparedJob, setPreparedJob] = useState<JobPrepareResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [lookupTargetId, setLookupTargetId] = useState<string>('');
  const [successInfo, setSuccessInfo] = useState<{ txHash: string; jobId: string } | null>(null);

  const handleJobPrepared = (job: JobPrepareResponse) => {
    setPreparedJob(job);
    setSuccessInfo(null);
  };

  const handleTransactionSuccess = (txHash: string, jobId: string) => {
    setSuccessInfo({ txHash, jobId });
    setLookupTargetId(jobId);
  };

  const handleCloseReview = () => {
    setPreparedJob(null);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar activeTab={activeTab} onSelectTab={setActiveTab} />

      <main style={{ flex: 1, padding: '32px 20px', maxWidth: '1200px', width: '100%', margin: '0 auto' }}>
        {successInfo && (
          <div style={{ marginBottom: '24px' }}>
            <AlertBanner
              type="success"
              title="Job Proposal Simulation Verified (Test Boundary)"
              message={
                <div>
                  <div>
                    Simulated transaction validated locally with mock Tx Hash:{' '}
                    <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{successInfo.txHash}</span>
                  </div>
                  <div style={{ marginTop: '6px' }}>
                    Job ID: <span style={{ fontFamily: 'monospace', color: '#00F0FF' }}>{successInfo.jobId}</span>
                  </div>
                  <div style={{ marginTop: '6px', fontSize: '0.8rem', opacity: 0.9 }}>
                    <em>Note:</em> This transaction was executed in client simulation only and was <strong>NOT broadcast to Monad Testnet</strong>. It does not exist on-chain.
                  </div>
                  <button
                    id="btn-view-confirmed-job"
                    type="button"
                    onClick={() => {
                      setActiveTab('lookup');
                    }}
                    style={{
                      marginTop: '10px',
                      padding: '4px 12px',
                      borderRadius: '6px',
                      border: '1px solid #10B981',
                      backgroundColor: 'rgba(16, 185, 129, 0.2)',
                      color: '#FFFFFF',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Query On-Chain Status (Expect 404 until deployed) →
                  </button>
                </div>
              }
              onDismiss={() => setSuccessInfo(null)}
            />
          </div>
        )}

        {activeTab === 'create' ? (
          <div>
            <JobForm
              onJobPrepared={handleJobPrepared}
              isLoading={isLoading}
              setIsLoading={setIsLoading}
            />
          </div>
        ) : (
          <div>
            <JobStatusLookup initialJobId={lookupTargetId} />
          </div>
        )}

        {preparedJob && (
          <JobReviewModal
            preparedJob={preparedJob}
            onClose={handleCloseReview}
            onSuccess={handleTransactionSuccess}
          />
        )}
      </main>

      <footer
        style={{
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          padding: '24px 20px',
          textAlign: 'center',
          color: '#94A3B8',
          fontSize: '0.8rem',
          backgroundColor: 'rgba(4, 9, 20, 0.95)',
        }}
      >
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div>
            AegisAgent AI Trust & Escrow Platform — Monad Testnet (Chain ID 10143)
          </div>
          <div style={{ marginTop: '4px', fontSize: '0.72rem', opacity: 0.8 }}>
            Free Development Phase 5.3.2.3: Zero real transactions broadcast. Wallet operations strictly client-side.
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <WalletProvider>
      <HiringApp />
    </WalletProvider>
  );
}
