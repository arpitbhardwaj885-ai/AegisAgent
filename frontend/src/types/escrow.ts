export interface AgentTrustSummary {
  global_trust: number;
  risk: number;
  task_fit: number;
  confidence: number;
  recommendation: string;
}

export interface JobPrepareRequest {
  client_agent_id: number;
  provider_agent_id: number;
  validator_address: string;
  reward_amount_wei: string; // Authoritative exact integer wei string
  validator_fee_bps?: number; // 0-5000 bps
  min_acceptance_score?: number; // 1-100
  acceptance_deadline: number; // Unix timestamp seconds
  submission_deadline: number; // Unix timestamp seconds
  validation_deadline: number; // Unix timestamp seconds
  task_description?: string;
  task_hash?: string;
  prehire_trust_snapshot_hash?: string;
  arbiter_override?: string;
  nonce?: number;
  job_id?: string;
}

export interface CreateJobArgs {
  jobId: string;
  clientAgentId: number;
  providerAgentId: number;
  validatorAddress: string;
  validatorFeeBps: number;
  minAcceptanceScore: number;
  acceptanceDeadline: number;
  submissionDeadline: number;
  validationDeadline: number;
  taskHash: string;
  prehireTrustSnapshotHash: string;
  arbiterOverride: string;
}

export interface PreparedTransactionParameters {
  function: string; // "createJob"
  contract: string | null;
  value: string; // exact wei string
  args: CreateJobArgs;
}

export interface JobPrepareResponse {
  job_id: string;
  client_agent_id: number;
  provider_agent_id: number;
  validator_address: string;
  reward_amount_wei: string;
  reward_amount_mon: number;
  validator_fee_bps: number;
  validator_fee_percent: number;
  min_acceptance_score: number;
  acceptance_deadline: number;
  submission_deadline: number;
  validation_deadline: number;
  task_hash: string;
  prehire_trust_snapshot_hash: string;
  designated_arbiter: string;
  escrow_contract_address: string | null;
  nonce: number | null;
  preflight_identity_verified: boolean | null;
  prehire_trust_summary?: AgentTrustSummary | null;
  transaction_parameters: PreparedTransactionParameters;
  broadcast: boolean; // Always false from backend
  instructions: string;
}

export interface JobResponse {
  job_id: string;
  client_agent_id: number;
  client: string;
  provider_agent_id: number;
  validator_address: string;
  reward_amount_wei: string;
  reward_amount_mon: number;
  validator_fee_bps: number;
  validator_fee_percent: number;
  min_acceptance_score: number;
  acceptance_deadline: number;
  submission_deadline: number;
  validation_deadline: number;
  task_hash: string;
  prehire_trust_snapshot_hash: string;
  status: string;
  status_code: number;
  is_terminal: boolean;
  settled: boolean;
  submission_hash: string;
  submission_uri: string;
  submission_timestamp: number;
  validation_request_hash: string;
  failure_timestamp: number;
  challenge_deadline: number;
  dispute_timestamp: number;
  designated_arbiter: string;
}

export interface ApiErrorDetail {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiErrorResponse {
  error: ApiErrorDetail;
}

export type LifecycleStage =
  | 'IDLE'
  | 'PREPARING'
  | 'PREPARED_UNSUBMITTED'
  | 'SIGNING'
  | 'TX_PENDING'
  | 'TX_SIMULATED'
  | 'TX_CONFIRMED'
  | 'TX_REVERTED'
  | 'ERROR';
