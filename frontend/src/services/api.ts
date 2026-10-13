import { API_BASE_URL } from '../config/constants';
import type {
  JobPrepareRequest,
  JobPrepareResponse,
  JobResponse,
  ApiErrorResponse,
} from '../types/escrow';

export class EscrowApiError extends Error {
  code: string;
  statusCode: number;
  details?: unknown;

  constructor(message: string, code = 'UNKNOWN_ERROR', statusCode = 500, details?: unknown) {
    super(message);
    this.name = 'EscrowApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.ok) {
    return (await res.json()) as T;
  }

  let errorData: ApiErrorResponse | { detail?: string | { msg?: string }[] } | null = null;
  try {
    errorData = await res.json();
  } catch {
    // If not JSON, use HTTP status text
  }

  let message = `API request failed with status ${res.status}`;
  let code = 'HTTP_ERROR';
  let details: unknown = undefined;

  if (errorData) {
    if ('error' in errorData && errorData.error) {
      code = errorData.error.code || code;
      message = errorData.error.message || message;
      details = errorData.error.details;
    } else if ('detail' in errorData && errorData.detail) {
      if (typeof errorData.detail === 'string') {
        message = errorData.detail;
      } else if (Array.isArray(errorData.detail)) {
        // FastAPI validation errors
        message = errorData.detail.map((d) => d.msg || JSON.stringify(d)).join('; ');
        code = 'VALIDATION_ERROR';
        details = errorData.detail;
      }
    }
  }

  throw new EscrowApiError(message, code, res.status, details);
}

/**
 * Prepares escrow transaction parameters via backend POST /escrow/jobs/prepare.
 * Strictly read-only: does not broadcast transactions.
 */
export async function prepareJob(request: JobPrepareRequest): Promise<JobPrepareResponse> {
  const url = `${API_BASE_URL}/escrow/jobs/prepare`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });
    return await handleResponse<JobPrepareResponse>(res);
  } catch (err) {
    if (err instanceof EscrowApiError) {
      throw err;
    }
    throw new EscrowApiError(
      `Network error connecting to backend: ${(err as Error).message}`,
      'NETWORK_ERROR',
      0
    );
  }
}

/**
 * Reads on-chain escrow job details via backend GET /escrow/jobs/{job_id}.
 */
export async function getJob(jobId: string): Promise<JobResponse> {
  const cleanId = encodeURIComponent(jobId.trim());
  const url = `${API_BASE_URL}/escrow/jobs/${cleanId}`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });
    return await handleResponse<JobResponse>(res);
  } catch (err) {
    if (err instanceof EscrowApiError) {
      throw err;
    }
    throw new EscrowApiError(
      `Network error connecting to backend: ${(err as Error).message}`,
      'NETWORK_ERROR',
      0
    );
  }
}
